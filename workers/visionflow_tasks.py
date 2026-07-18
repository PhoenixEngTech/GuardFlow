import fnmatch
import json
import os
from datetime import datetime, timezone
from typing import Any
from urllib.parse import urlparse

import httpx
import redis
from celery.utils.log import get_task_logger

from celery_app import celery_app


logger = get_task_logger(__name__)


def get_required_environment_value(
    variable_name: str,
) -> str:
    value = os.getenv(variable_name, "").strip()

    if not value:
        raise RuntimeError(
            f"{variable_name} is not configured."
        )

    return value


def get_api_url() -> str:
    return get_required_environment_value(
        "GUARDFLOW_API_URL"
    ).rstrip("/")


def get_worker_headers() -> dict[str, str]:
    worker_token = get_required_environment_value(
        "VISIONFLOW_WORKER_TOKEN"
    )

    return {
        "Accept": "application/json",
        "X-VisionFlow-Worker-Token": worker_token,
    }


def get_http_timeout_seconds() -> float:
    raw_value = os.getenv(
        "VISIONFLOW_HTTP_TIMEOUT_SECONDS",
        "20",
    )

    try:
        timeout_seconds = float(raw_value)
    except ValueError as exc:
        raise RuntimeError(
            "VISIONFLOW_HTTP_TIMEOUT_SECONDS must "
            "be a valid number."
        ) from exc

    if timeout_seconds <= 0:
        raise RuntimeError(
            "VISIONFLOW_HTTP_TIMEOUT_SECONDS must "
            "be greater than zero."
        )

    return timeout_seconds


def get_gateway_probe_timeout_seconds() -> float:
    raw_value = os.getenv(
        "VISIONFLOW_GATEWAY_PROBE_TIMEOUT_SECONDS",
        "8",
    )

    try:
        timeout_seconds = float(raw_value)
    except ValueError as exc:
        raise RuntimeError(
            "VISIONFLOW_GATEWAY_PROBE_TIMEOUT_SECONDS "
            "must be a valid number."
        ) from exc

    if timeout_seconds <= 0:
        raise RuntimeError(
            "VISIONFLOW_GATEWAY_PROBE_TIMEOUT_SECONDS "
            "must be greater than zero."
        )

    return timeout_seconds


def get_gateway_allowed_host_patterns() -> list[str]:
    """
    Return gateway host patterns that the cloud worker may probe.

    Raw client camera IP addresses are intentionally not probed from
    Railway. Client LAN camera checks belong to a future GuardFlow
    edge gateway installed inside the authorised client network.

    Exact hosts and wildcard patterns are supported, for example:

    gateway.example.com,*.guardflow-gateway.example.com
    """

    raw_value = os.getenv(
        "VISIONFLOW_GATEWAY_ALLOWED_HOSTS",
        "",
    )

    patterns = [
        item.strip().lower()
        for item in raw_value.split(",")
        if item.strip()
    ]

    if "*.railway.internal" not in patterns:
        patterns.append("*.railway.internal")

    return patterns


def gateway_host_is_allowed(
    hostname: str,
) -> bool:
    clean_hostname = hostname.strip().lower()

    if not clean_hostname:
        return False

    return any(
        fnmatch.fnmatch(
            clean_hostname,
            pattern,
        )
        for pattern in get_gateway_allowed_host_patterns()
    )


def get_cache_client() -> redis.Redis:
    redis_url = (
        os.getenv("VISIONFLOW_CACHE_URL")
        or os.getenv("REDIS_URL")
        or os.getenv("CELERY_BROKER_URL")
    )

    if not redis_url:
        raise RuntimeError(
            "Redis is not configured for the "
            "VisionFlow worker."
        )

    return redis.Redis.from_url(
        redis_url,
        decode_responses=True,
        socket_connect_timeout=10,
        socket_timeout=10,
        health_check_interval=30,
    )


def fetch_worker_resource(
    endpoint: str,
) -> Any:
    with httpx.Client(
        timeout=get_http_timeout_seconds(),
        follow_redirects=True,
    ) as client:
        response = client.get(
            f"{get_api_url()}{endpoint}",
            headers=get_worker_headers(),
        )

    if response.status_code in {
        401,
        403,
    }:
        raise RuntimeError(
            "VisionFlow worker authentication failed."
        )

    response.raise_for_status()
    return response.json()


def post_worker_resource(
    endpoint: str,
    payload: dict[str, Any],
) -> Any:
    with httpx.Client(
        timeout=get_http_timeout_seconds(),
        follow_redirects=True,
    ) as client:
        response = client.post(
            f"{get_api_url()}{endpoint}",
            headers={
                **get_worker_headers(),
                "Content-Type": "application/json",
            },
            json=payload,
        )

    if response.status_code in {
        401,
        403,
    }:
        raise RuntimeError(
            "VisionFlow worker authentication failed."
        )

    response.raise_for_status()

    if not response.content:
        return None

    return response.json()


def determine_gateway_health(
    camera: dict[str, Any],
) -> tuple[str, str]:
    """
    Check only the browser-safe gateway endpoint.

    GuardFlow deliberately does not use the cloud worker to scan raw
    RTSP/ONVIF camera hosts. Those devices normally live on a private
    client LAN and must later be monitored by an authorised edge
    gateway or private network tunnel.
    """

    gateway_url = str(
        camera.get("gateway_stream_url")
        or ""
    ).strip()

    if not gateway_url:
        return (
            "pending",
            "Awaiting an authorised streaming gateway.",
        )

    parsed_url = urlparse(gateway_url)

    if parsed_url.scheme not in {
        "http",
        "https",
    }:
        return (
            "error",
            "Gateway URL must use HTTP or HTTPS.",
        )

    hostname = parsed_url.hostname or ""

    if not gateway_host_is_allowed(hostname):
        return (
            "error",
            (
                "Gateway host is not included in "
                "VISIONFLOW_GATEWAY_ALLOWED_HOSTS."
            ),
        )

    probe_headers = {
        "Accept": (
            "application/vnd.apple.mpegurl,"
            "application/x-mpegURL,"
            "video/*,"
            "application/json,"
            "*/*"
        ),
        "Range": "bytes=0-0",
        "User-Agent": "GuardFlow-VisionFlow-Health/1.0",
    }

    try:
        with httpx.Client(
            timeout=get_gateway_probe_timeout_seconds(),
            follow_redirects=False,
        ) as client:
            with client.stream(
                "GET",
                gateway_url,
                headers=probe_headers,
            ) as response:
                status_code = response.status_code

        if 200 <= status_code < 400:
            return (
                "online",
                f"Gateway responded with HTTP {status_code}.",
            )

        if status_code in {
            401,
            403,
        }:
            return (
                "error",
                (
                    "Gateway rejected the health probe "
                    f"with HTTP {status_code}."
                ),
            )

        return (
            "offline",
            f"Gateway responded with HTTP {status_code}.",
        )

    except (
        httpx.ConnectError,
        httpx.ConnectTimeout,
        httpx.ReadTimeout,
        httpx.RemoteProtocolError,
    ) as exc:
        return (
            "offline",
            f"Gateway connection failed: {type(exc).__name__}.",
        )

    except httpx.RequestError as exc:
        return (
            "error",
            f"Gateway probe failed: {type(exc).__name__}.",
        )


@celery_app.task(
    name="guardflow.visionflow.refresh_control_plane",
    bind=True,
    autoretry_for=(
        httpx.RequestError,
        httpx.HTTPStatusError,
        redis.RedisError,
    ),
    retry_backoff=True,
    retry_backoff_max=300,
    retry_jitter=True,
    max_retries=5,
)
def refresh_control_plane(
    self,
) -> dict[str, Any]:
    """
    Retrieve the authorised camera registry and plate
    watchlist from GuardFlow.

    The snapshot is cached in private Redis storage for
    future edge gateways and ANPR processors.
    """

    cameras = fetch_worker_resource(
        "/api/v1/internal/visionflow/cameras"
    )

    watchlist = fetch_worker_resource(
        "/api/v1/internal/visionflow/watchlist"
    )

    if not isinstance(cameras, list):
        raise RuntimeError(
            "GuardFlow returned an invalid camera registry."
        )

    if not isinstance(watchlist, list):
        raise RuntimeError(
            "GuardFlow returned an invalid watchlist."
        )

    synced_at = datetime.now(
        timezone.utc
    ).isoformat()

    snapshot = {
        "cameras": cameras,
        "watchlist": watchlist,
        "synced_at": synced_at,
    }

    cache = get_cache_client()

    cache.setex(
        "guardflow:visionflow:cameras",
        300,
        json.dumps(cameras),
    )

    cache.setex(
        "guardflow:visionflow:watchlist",
        300,
        json.dumps(watchlist),
    )

    cache.setex(
        "guardflow:visionflow:control-plane",
        300,
        json.dumps(snapshot),
    )

    cache.set(
        "guardflow:visionflow:last-sync",
        synced_at,
    )

    logger.info(
        "VisionFlow control plane synchronised: "
        "%s cameras and %s watchlist targets.",
        len(cameras),
        len(watchlist),
    )

    return {
        "status": "synchronised",
        "camera_count": len(cameras),
        "watchlist_count": len(watchlist),
        "synced_at": synced_at,
        "task_id": self.request.id,
    }


@celery_app.task(
    name="guardflow.visionflow.monitor_camera_health",
    bind=True,
    autoretry_for=(
        httpx.RequestError,
        httpx.HTTPStatusError,
        redis.RedisError,
    ),
    retry_backoff=True,
    retry_backoff_max=180,
    retry_jitter=True,
    max_retries=3,
)
def monitor_camera_health(
    self,
) -> dict[str, Any]:
    """
    Monitor registered browser-safe streaming gateways.

    Cameras without a gateway remain pending until an authorised
    client-side edge gateway is deployed. This prevents the central
    Railway worker from scanning arbitrary private or public hosts.
    """

    cameras = fetch_worker_resource(
        "/api/v1/internal/visionflow/cameras"
    )

    if not isinstance(cameras, list):
        raise RuntimeError(
            "GuardFlow returned an invalid camera registry."
        )

    checked_at = datetime.now(
        timezone.utc
    ).isoformat()

    health_results: list[dict[str, Any]] = []
    counters = {
        "online": 0,
        "offline": 0,
        "pending": 0,
        "error": 0,
    }

    for camera in cameras:
        camera_id = str(
            camera.get("id")
            or ""
        ).strip()

        if not camera_id:
            logger.warning(
                "Skipping a camera registry entry "
                "without an ID."
            )
            continue

        status_value, reason = determine_gateway_health(
            camera
        )

        try:
            post_worker_resource(
                (
                    "/api/v1/internal/visionflow/"
                    f"cameras/{camera_id}/health"
                ),
                {
                    "status": status_value,
                    "checked_at": checked_at,
                },
            )

        except httpx.HTTPStatusError as exc:
            logger.error(
                "Unable to report camera health for %s: "
                "HTTP %s.",
                camera_id,
                exc.response.status_code,
            )

            status_value = "error"
            reason = (
                "GuardFlow rejected the camera health "
                f"update with HTTP {exc.response.status_code}."
            )

        counters[status_value] = (
            counters.get(status_value, 0) + 1
        )

        health_results.append(
            {
                "camera_id": camera_id,
                "camera_name": camera.get("name"),
                "status": status_value,
                "reason": reason,
                "checked_at": checked_at,
            }
        )

        logger.info(
            "VisionFlow camera health: %s (%s) -> %s. %s",
            camera.get("name") or camera_id,
            camera_id,
            status_value,
            reason,
        )

    health_snapshot = {
        "checked_at": checked_at,
        "camera_count": len(health_results),
        "summary": counters,
        "results": health_results,
    }

    cache = get_cache_client()

    cache.setex(
        "guardflow:visionflow:camera-health",
        180,
        json.dumps(health_snapshot),
    )

    cache.set(
        "guardflow:visionflow:last-health-check",
        checked_at,
    )

    logger.info(
        "VisionFlow health monitoring completed: "
        "%s cameras checked, %s online, %s offline, "
        "%s pending and %s error.",
        len(health_results),
        counters["online"],
        counters["offline"],
        counters["pending"],
        counters["error"],
    )

    return {
        "status": "completed",
        "camera_count": len(health_results),
        "summary": counters,
        "checked_at": checked_at,
        "task_id": self.request.id,
    }
