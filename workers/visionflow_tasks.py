import json
import os
from datetime import datetime, timezone
from typing import Any

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
    timeout_seconds = float(
        os.getenv(
            "VISIONFLOW_HTTP_TIMEOUT_SECONDS",
            "20",
        )
    )

    with httpx.Client(
        timeout=timeout_seconds,
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
