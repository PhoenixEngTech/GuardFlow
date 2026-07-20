import time
from typing import Any, Optional

import httpx

from config import settings
from schemas import (
    MobileLocationSubmission,
    MobileSOSSubmission,
)


class GuardFlowMobileCloudError(RuntimeError):
    """
    Raised when the mobile simulator cannot communicate
    safely with the GuardFlow cloud API.
    """


class GuardFlowMobileCloudClient:
    def __init__(self) -> None:
        self._client = httpx.Client(
            base_url=settings.GUARDFLOW_API_URL,
            timeout=settings.HTTP_TIMEOUT_SECONDS,
            follow_redirects=True,
            headers={
                "Accept": "application/json",
                "Content-Type": "application/json",
                "User-Agent": (
                    "GuardFlow-Mobile-Simulator/1.0"
                ),
                "X-GuardFlow-Device-ID": (
                    settings.MOBILE_DEVICE_ID
                ),
                "X-GuardFlow-Mobile-Token": (
                    settings.MOBILE_DEVICE_TOKEN
                ),
            },
        )

    def __enter__(
        self,
    ) -> "GuardFlowMobileCloudClient":
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
                    raise GuardFlowMobileCloudError(
                        "GuardFlow rejected the mobile "
                        "device credentials or access."
                    )

                if response.status_code == 404:
                    raise GuardFlowMobileCloudError(
                        "The requested GuardFlow mobile "
                        "endpoint or session was not found."
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

                    raise GuardFlowMobileCloudError(
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

            except GuardFlowMobileCloudError:
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

        raise GuardFlowMobileCloudError(
            "The mobile simulator could not reach the "
            "GuardFlow cloud service."
        ) from last_error

    def send_heartbeat(self) -> Any:
        return self._request(
            method="POST",
            endpoint="/api/v1/mobile/heartbeat",
        )

    def submit_location(
        self,
        location: MobileLocationSubmission,
    ) -> Any:
        return self._request(
            method="POST",
            endpoint="/api/v1/mobile/locations",
            payload=location.model_dump(
                mode="json"
            ),
        )

    def trigger_sos(
        self,
        sos_alert: MobileSOSSubmission,
    ) -> Any:
        return self._request(
            method="POST",
            endpoint="/api/v1/mobile/sos",
            payload=sos_alert.model_dump(
                mode="json"
            ),
        )