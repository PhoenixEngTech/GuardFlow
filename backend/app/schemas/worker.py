from datetime import datetime
from typing import Literal, Optional

from pydantic import (
    BaseModel,
    ConfigDict,
    Field,
    field_validator,
)


WorkerCameraStatus = Literal[
    "pending",
    "online",
    "offline",
    "error",
]


class WorkerCameraOut(BaseModel):
    id: str
    name: str
    manufacturer: Optional[str] = None
    model: Optional[str] = None

    location_name: str
    latitude: Optional[float] = None
    longitude: Optional[float] = None

    connection_type: str
    host: str
    port: int
    stream_path: Optional[str] = None

    credential_reference: Optional[str] = None
    gateway_stream_url: Optional[str] = None

    status: str
    is_active: bool
    last_seen_at: Optional[datetime] = None

    model_config = ConfigDict(
        from_attributes=True
    )


class WorkerCameraHealthUpdate(BaseModel):
    status: WorkerCameraStatus
    checked_at: Optional[datetime] = None


class WorkerWatchlistOut(BaseModel):
    id: str
    case_id: str
    license_plate: str
    risk_level: str
    reason_flagged: str
    created_at: datetime

    model_config = ConfigDict(
        from_attributes=True
    )


class ANPRDetectionCreate(BaseModel):
    camera_id: str = Field(
        min_length=1,
    )

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

    spotted_at: Optional[datetime] = None

    @field_validator(
        "camera_id",
        "license_plate",
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
        "cropped_plate_image_url",
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


class ANPRDetectionResult(BaseModel):
    matched: bool
    message: str
    alert_id: Optional[str] = None
    watchlist_plate_id: Optional[str] = None
