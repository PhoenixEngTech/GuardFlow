import time
from typing import Any, Optional

import httpx

from config import settings
from schemas import (
    ANPRDetectionSubmission,
    CameraHealthResult,
)


class GuardFlowCloudError(RuntimeError):
    """
    Raised when the edge gateway cannot communicate
    safely with the GuardFlow cloud API.
    """


class GuardFlowCloudClient:
    def __init__(self) -> None:
        self._client = httpx.Client(
            base_url=settings.GUARDFLOW_API_URL,
            timeout=settings.HTTP_TIMEOUT_SECONDS,
            follow_redirects=True,
            headers={
                "Accept": "application/json",
                "Content-Type": "application/json",
                "User-Agent": (
                    "GuardFlow-Edge-Gateway/1.0"
                ),
                "X-GuardFlow-Gateway-ID": (
                    settings.GATEWAY_ID
                ),
                "X-GuardFlow-Edge-Token": (
                    settings.EDGE_GATEWAY_TOKEN
                ),
            },
        )

    def __enter__(
        self,
    ) -> "GuardFlowCloudClient":
        return self

    def __exit__(
        self,
        exc_type: object,
        exc_value: object,
        traceback: object,
    ) -> None:
        self.close()

    def close(self) -> None:
        self._client.close()

    def _request(
        self,
        method: str,
        endpoint: str,
        payload: Optional[dict[str, Any]] = None,
        maximum_attempts: int = 3,
    ) -> Any:
        last_error: Optional[Exception] = None

        for attempt in range(
            1,
            maximum_attempts + 1,
        ):
            try:
                response = self._client.request(
                    method=method,
                    url=endpoint,
                    json=payload,
                )

                if response.status_code in {
                    401,
                    403,
                }:
                    raise GuardFlowCloudError(
                        "GuardFlow rejected the edge "
                        "gateway credentials."
                    )

                if response.status_code == 404:
                    raise GuardFlowCloudError(
                        "The GuardFlow edge gateway "
                        "endpoint was not found."
                    )

                if response.status_code >= 500:
                    raise httpx.HTTPStatusError(
                        message=(
                            "GuardFlow cloud service "
                            "returned a server error."
                        ),
                        request=response.request,
                        response=response,
                    )

                if response.status_code >= 400:
                    try:
                        error_data = response.json()
                        detail = error_data.get(
                            "detail"
                        )
                    except ValueError:
                        detail = None

                    raise GuardFlowCloudError(
                        detail
                        or (
                            "GuardFlow rejected the "
                            f"request with HTTP "
                            f"{response.status_code}."
                        )
                    )

                if not response.content:
                    return None

                return response.json()

            except GuardFlowCloudError:
                raise

            except (
                httpx.ConnectError,
                httpx.ConnectTimeout,
                httpx.ReadTimeout,
                httpx.RemoteProtocolError,
                httpx.HTTPStatusError,
            ) as exc:
                last_error = exc

                if attempt >= maximum_attempts:
                    break

                time.sleep(
                    min(
                        2 ** (attempt - 1),
                        5,
                    )
                )

        raise GuardFlowCloudError(
            "The edge gateway could not reach the "
            "GuardFlow cloud service."
        ) from last_error

    def send_heartbeat(
        self,
        registered_camera_count: int,
        online_camera_count: int,
        offline_camera_count: int,
    ) -> Any:
        return self._request(
            method="POST",
            endpoint=(
                "/api/v1/internal/edge/heartbeat"
            ),
            payload={
                "gateway_id": settings.GATEWAY_ID,
                "gateway_name": settings.GATEWAY_NAME,
                "registered_camera_count": (
                    registered_camera_count
                ),
                "online_camera_count": (
                    online_camera_count
                ),
                "offline_camera_count": (
                    offline_camera_count
                ),
            },
        )

    def report_camera_health(
        self,
        health_result: CameraHealthResult,
    ) -> Any:
        return self._request(
            method="POST",
            endpoint=(
                "/api/v1/internal/edge/cameras/"
                f"{health_result.camera_id}/health"
            ),
            payload=health_result.model_dump(
                mode="json"
            ),
        )

    def submit_anpr_detection(
        self,
        detection: ANPRDetectionSubmission,
    ) -> Any:
        return self._request(
            method="POST",
            endpoint=(
                "/api/v1/internal/edge/"
                "anpr/detections"
            ),
            payload=detection.model_dump(
                mode="json"
            ),
        )
