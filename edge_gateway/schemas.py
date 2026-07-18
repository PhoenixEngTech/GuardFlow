from datetime import datetime
from typing import Literal, Optional

from pydantic import (
    BaseModel,
    Field,
    field_validator,
)


CameraProtocol = Literal[
    "rtsp",
    "onvif",
    "http",
]

CameraHealthStatus = Literal[
    "pending",
    "online",
    "offline",
    "error",
    "disabled",
]


class EdgeCameraConfig(BaseModel):
    """
    Local camera configuration stored inside the
    authorised client network.

    Actual usernames and passwords are never stored
    directly in cameras.json. The gateway reads them
    from environment variables using the names below.
    """

    camera_id: str = Field(
        min_length=1,
        max_length=100,
    )

    name: str = Field(
        min_length=2,
        max_length=100,
    )

    manufacturer: Optional[str] = Field(
        default=None,
        max_length=50,
    )

    model: Optional[str] = Field(
        default=None,
        max_length=100,
    )

    location_name: str = Field(
        min_length=2,
        max_length=150,
    )

    protocol: CameraProtocol = "rtsp"

    host: str = Field(
        min_length=1,
        max_length=255,
    )

    port: int = Field(
        default=554,
        ge=1,
        le=65535,
    )

    stream_path: Optional[str] = Field(
        default=None,
        max_length=255,
    )

    username_environment_variable: Optional[str] = Field(
        default=None,
        max_length=100,
    )

    password_environment_variable: Optional[str] = Field(
        default=None,
        max_length=100,
    )

    latitude: Optional[float] = Field(
        default=None,
        ge=-90,
        le=90,
    )

    longitude: Optional[float] = Field(
        default=None,
        ge=-180,
        le=180,
    )

    is_active: bool = True

    @field_validator(
        "camera_id",
        "name",
        "location_name",
        "host",
    )
    @classmethod
    def clean_required_text(
        cls,
        value: str,
    ) -> str:
        cleaned_value = value.strip()

        if not cleaned_value:
            raise ValueError(
                "This field cannot be empty."
            )

        return cleaned_value

    @field_validator(
        "manufacturer",
        "model",
        "stream_path",
        "username_environment_variable",
        "password_environment_variable",
    )
    @classmethod
    def clean_optional_text(
        cls,
        value: Optional[str],
    ) -> Optional[str]:
        if value is None:
            return None

        cleaned_value = value.strip()
        return cleaned_value or None


class EdgeCameraCollection(BaseModel):
    cameras: list[EdgeCameraConfig] = Field(
        default_factory=list,
    )


class CameraHealthResult(BaseModel):
    camera_id: str
    status: CameraHealthStatus
    checked_at: datetime
    message: str
    response_time_ms: Optional[float] = None


class ANPRDetectionSubmission(BaseModel):
    camera_id: str
    license_plate: str = Field(
        min_length=1,
        max_length=15,
    )

    confidence_score: float = Field(
        ge=0,
        le=1,
    )

    latitude: Optional[float] = Field(
        default=None,
        ge=-90,
        le=90,
    )

    longitude: Optional[float] = Field(
        default=None,
        ge=-180,
        le=180,
    )

    cropped_plate_image_url: Optional[str] = Field(
        default=None,
        max_length=255,
    )

    spotted_at: datetime

    @field_validator(
        "camera_id",
        "license_plate",
    )
    @classmethod
    def clean_detection_text(
        cls,
        value: str,
    ) -> str:
        cleaned_value = value.strip()

        if not cleaned_value:
            raise ValueError(
                "This field cannot be empty."
            )

        return cleaned_value

    @field_validator("license_plate")
    @classmethod
    def normalise_plate(
        cls,
        value: str,
    ) -> str:
        return " ".join(
            value.upper().split()
        )
