from datetime import datetime
from typing import Literal, Optional

from pydantic import (
    BaseModel,
    ConfigDict,
    Field,
    field_validator,
)


CameraConnectionType = Literal[
    "rtsp",
    "onvif",
    "http",
    "hls",
    "webrtc",
]

CameraStatus = Literal[
    "pending",
    "online",
    "offline",
    "error",
    "disabled",
]


class CameraCreate(BaseModel):
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

    serial_number: Optional[str] = Field(
        default=None,
        max_length=100,
    )

    location_name: str = Field(
        min_length=2,
        max_length=150,
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

    connection_type: CameraConnectionType = "rtsp"

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

    credential_reference: Optional[str] = Field(
        default=None,
        max_length=100,
    )

    gateway_stream_url: Optional[str] = Field(
        default=None,
        max_length=500,
    )

    is_active: bool = True

    @field_validator(
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
        "serial_number",
        "stream_path",
        "credential_reference",
        "gateway_stream_url",
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


class CameraUpdate(BaseModel):
    name: Optional[str] = Field(
        default=None,
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

    serial_number: Optional[str] = Field(
        default=None,
        max_length=100,
    )

    location_name: Optional[str] = Field(
        default=None,
        min_length=2,
        max_length=150,
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

    connection_type: Optional[
        CameraConnectionType
    ] = None

    host: Optional[str] = Field(
        default=None,
        min_length=1,
        max_length=255,
    )

    port: Optional[int] = Field(
        default=None,
        ge=1,
        le=65535,
    )

    stream_path: Optional[str] = Field(
        default=None,
        max_length=255,
    )

    credential_reference: Optional[str] = Field(
        default=None,
        max_length=100,
    )

    gateway_stream_url: Optional[str] = Field(
        default=None,
        max_length=500,
    )

    is_active: Optional[bool] = None

    @field_validator(
        "name",
        "location_name",
        "host",
    )
    @classmethod
    def clean_optional_required_text(
        cls,
        value: Optional[str],
    ) -> Optional[str]:
        if value is None:
            return None

        cleaned_value = value.strip()

        if not cleaned_value:
            raise ValueError(
                "This field cannot be empty."
            )

        return cleaned_value

    @field_validator(
        "manufacturer",
        "model",
        "serial_number",
        "stream_path",
        "credential_reference",
        "gateway_stream_url",
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


class CameraHealthUpdate(BaseModel):
    status: CameraStatus
    last_seen_at: Optional[datetime] = None


class CameraOut(BaseModel):
    id: str
    name: str
    manufacturer: Optional[str] = None
    model: Optional[str] = None
    serial_number: Optional[str] = None

    location_name: str
    latitude: Optional[float] = None
    longitude: Optional[float] = None

    connection_type: CameraConnectionType
    host: str
    port: int
    stream_path: Optional[str] = None

    credential_reference: Optional[str] = None
    gateway_stream_url: Optional[str] = None

    status: CameraStatus
    is_active: bool
    last_seen_at: Optional[datetime] = None

    created_by_operator_id: Optional[str] = None
    created_at: datetime
    updated_at: datetime

    model_config = ConfigDict(
        from_attributes=True
    )
