from datetime import datetime
from typing import Literal, Optional

from pydantic import (
    BaseModel,
    ConfigDict,
    Field,
    field_validator,
)


GatewayStatus = Literal[
    "pending",
    "online",
    "offline",
    "error",
    "disabled",
]

EdgeCameraStatus = Literal[
    "pending",
    "online",
    "offline",
    "error",
    "disabled",
]


class EdgeGatewayCreate(BaseModel):
    gateway_id: str = Field(
        min_length=8,
        max_length=100,
    )

    name: str = Field(
        min_length=3,
        max_length=100,
    )

    site_name: Optional[str] = Field(
        default=None,
        max_length=150,
    )

    customer_name: Optional[str] = Field(
        default=None,
        max_length=150,
    )

    is_active: bool = True

    @field_validator(
        "gateway_id",
        "name",
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
        "site_name",
        "customer_name",
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


class EdgeGatewayUpdate(BaseModel):
    name: Optional[str] = Field(
        default=None,
        min_length=3,
        max_length=100,
    )

    site_name: Optional[str] = Field(
        default=None,
        max_length=150,
    )

    customer_name: Optional[str] = Field(
        default=None,
        max_length=150,
    )

    is_active: Optional[bool] = None

    @field_validator("name")
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
        "site_name",
        "customer_name",
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


class EdgeGatewayOut(BaseModel):
    id: str
    gateway_id: str
    name: str

    site_name: Optional[str] = None
    customer_name: Optional[str] = None

    status: GatewayStatus
    is_active: bool

    registered_camera_count: int
    online_camera_count: int
    offline_camera_count: int

    last_seen_at: Optional[datetime] = None
    created_by_operator_id: Optional[str] = None

    created_at: datetime
    updated_at: datetime

    model_config = ConfigDict(
        from_attributes=True
    )


class EdgeGatewayRegistrationResult(
    EdgeGatewayOut
):
    """
    Returned only when a gateway is first registered
    or its token is deliberately rotated.

    The plaintext token must be copied immediately.
    It is never returned again.
    """

    edge_gateway_token: str


class EdgeGatewayHeartbeat(BaseModel):
    gateway_id: str = Field(
        min_length=8,
        max_length=100,
    )

    gateway_name: str = Field(
        min_length=3,
        max_length=100,
    )

    registered_camera_count: int = Field(
        ge=0,
    )

    online_camera_count: int = Field(
        ge=0,
    )

    offline_camera_count: int = Field(
        ge=0,
    )

    @field_validator(
        "gateway_id",
        "gateway_name",
    )
    @classmethod
    def clean_heartbeat_text(
        cls,
        value: str,
    ) -> str:
        cleaned_value = value.strip()

        if not cleaned_value:
            raise ValueError(
                "This field cannot be empty."
            )

        return cleaned_value


class EdgeCameraHealthReport(BaseModel):
    camera_id: str = Field(
        min_length=1,
        max_length=100,
    )

    status: EdgeCameraStatus

    checked_at: datetime

    message: str = Field(
        min_length=1,
        max_length=500,
    )

    response_time_ms: Optional[float] = Field(
        default=None,
        ge=0,
    )

    @field_validator(
        "camera_id",
        "message",
    )
    @classmethod
    def clean_camera_health_text(
        cls,
        value: str,
    ) -> str:
        cleaned_value = value.strip()

        if not cleaned_value:
            raise ValueError(
                "This field cannot be empty."
            )

        return cleaned_value


class EdgeANPRDetectionCreate(BaseModel):
    camera_id: str = Field(
        min_length=1,
        max_length=100,
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


class EdgeANPRDetectionResult(BaseModel):
    matched: bool
    message: str
    alert_id: Optional[str] = None
    watchlist_plate_id: Optional[str] = None
