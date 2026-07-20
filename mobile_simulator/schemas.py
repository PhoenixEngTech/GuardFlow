from datetime import datetime
from typing import Optional

from pydantic import (
    BaseModel,
    Field,
    field_validator,
)


class MobileLocationSubmission(BaseModel):
    session_id: str = Field(
        min_length=1,
        max_length=100,
    )

    latitude: float = Field(
        ge=-90,
        le=90,
    )

    longitude: float = Field(
        ge=-180,
        le=180,
    )

    accuracy_metres: Optional[float] = Field(
        default=None,
        ge=0,
    )

    altitude_metres: Optional[float] = None

    speed_kmh: Optional[float] = Field(
        default=None,
        ge=0,
    )

    heading_degrees: Optional[float] = Field(
        default=None,
        ge=0,
        le=360,
    )

    battery_percentage: Optional[int] = Field(
        default=None,
        ge=0,
        le=100,
    )

    recorded_at: datetime

    @field_validator("session_id")
    @classmethod
    def clean_session_id(
        cls,
        value: str,
    ) -> str:
        cleaned_value = value.strip()

        if not cleaned_value:
            raise ValueError(
                "Session ID cannot be empty."
            )

        return cleaned_value

    @field_validator("recorded_at")
    @classmethod
    def require_timezone(
        cls,
        value: datetime,
    ) -> datetime:
        if (
            value.tzinfo is None
            or value.utcoffset() is None
        ):
            raise ValueError(
                "Recorded time must include timezone "
                "information."
            )

        return value


class MobileSOSSubmission(BaseModel):
    session_id: str = Field(
        min_length=1,
        max_length=100,
    )

    latitude: float = Field(
        ge=-90,
        le=90,
    )

    longitude: float = Field(
        ge=-180,
        le=180,
    )

    accuracy_metres: Optional[float] = Field(
        default=None,
        ge=0,
    )

    message: Optional[str] = Field(
        default=None,
        max_length=1000,
    )

    triggered_at: datetime

    @field_validator("session_id")
    @classmethod
    def clean_session_id(
        cls,
        value: str,
    ) -> str:
        cleaned_value = value.strip()

        if not cleaned_value:
            raise ValueError(
                "Session ID cannot be empty."
            )

        return cleaned_value

    @field_validator("message")
    @classmethod
    def clean_message(
        cls,
        value: Optional[str],
    ) -> Optional[str]:
        if value is None:
            return None

        cleaned_value = value.strip()
        return cleaned_value or None

    @field_validator("triggered_at")
    @classmethod
    def require_timezone(
        cls,
        value: datetime,
    ) -> datetime:
        if (
            value.tzinfo is None
            or value.utcoffset() is None
        ):
            raise ValueError(
                "SOS time must include timezone "
                "information."
            )

        return value