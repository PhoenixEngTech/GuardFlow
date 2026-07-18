import socket
import time
from concurrent.futures import (
    ThreadPoolExecutor,
    as_completed,
)
from datetime import datetime, timezone

from schemas import (
    CameraHealthResult,
    EdgeCameraConfig,
)


def probe_camera(
    camera: EdgeCameraConfig,
    timeout_seconds: float = 5.0,
) -> CameraHealthResult:
    """
    Check whether the configured camera endpoint is
    reachable from inside the client network.

    This does not transmit usernames or passwords and
    does not log camera credentials.
    """

    checked_at = datetime.now(
        timezone.utc
    )

    if not camera.is_active:
        return CameraHealthResult(
            camera_id=camera.camera_id,
            status="disabled",
            checked_at=checked_at,
            message="Camera monitoring is disabled.",
        )

    started_at = time.perf_counter()

    try:
        with socket.create_connection(
            (
                camera.host,
                camera.port,
            ),
            timeout=timeout_seconds,
        ):
            response_time_ms = (
                time.perf_counter() - started_at
            ) * 1000

            return CameraHealthResult(
                camera_id=camera.camera_id,
                status="online",
                checked_at=checked_at,
                message=(
                    "Camera network endpoint is reachable. "
                    "Video verification will be performed by "
                    "the streaming processor."
                ),
                response_time_ms=round(
                    response_time_ms,
                    2,
                ),
            )

    except socket.timeout:
        response_time_ms = (
            time.perf_counter() - started_at
        ) * 1000

        return CameraHealthResult(
            camera_id=camera.camera_id,
            status="offline",
            checked_at=checked_at,
            message=(
                "Camera connection timed out."
            ),
            response_time_ms=round(
                response_time_ms,
                2,
            ),
        )

    except socket.gaierror:
        return CameraHealthResult(
            camera_id=camera.camera_id,
            status="error",
            checked_at=checked_at,
            message=(
                "The camera hostname could not be resolved."
            ),
        )

    except ConnectionRefusedError:
        response_time_ms = (
            time.perf_counter() - started_at
        ) * 1000

        return CameraHealthResult(
            camera_id=camera.camera_id,
            status="offline",
            checked_at=checked_at,
            message=(
                "The camera endpoint refused the connection."
            ),
            response_time_ms=round(
                response_time_ms,
                2,
            ),
        )

    except OSError as exc:
        response_time_ms = (
            time.perf_counter() - started_at
        ) * 1000

        return CameraHealthResult(
            camera_id=camera.camera_id,
            status="offline",
            checked_at=checked_at,
            message=(
                "Camera network check failed: "
                f"{type(exc).__name__}."
            ),
            response_time_ms=round(
                response_time_ms,
                2,
            ),
        )


def check_all_cameras(
    cameras: list[EdgeCameraConfig],
    timeout_seconds: float = 5.0,
    maximum_workers: int = 8,
) -> list[CameraHealthResult]:
    """
    Check multiple client cameras concurrently.

    The worker count is deliberately limited so the
    gateway does not overload the client network.
    """

    if not cameras:
        return []

    worker_count = min(
        max(maximum_workers, 1),
        len(cameras),
    )

    results: list[CameraHealthResult] = []

    with ThreadPoolExecutor(
        max_workers=worker_count
    ) as executor:
        future_map = {
            executor.submit(
                probe_camera,
                camera,
                timeout_seconds,
            ): camera
            for camera in cameras
        }

        for future in as_completed(
            future_map
        ):
            camera = future_map[future]

            try:
                result = future.result()

            except Exception as exc:
                result = CameraHealthResult(
                    camera_id=camera.camera_id,
                    status="error",
                    checked_at=datetime.now(
                        timezone.utc
                    ),
                    message=(
                        "Unexpected health-check failure: "
                        f"{type(exc).__name__}."
                    ),
                )

            results.append(result)

    results.sort(
        key=lambda result: result.camera_id
    )

    return results
