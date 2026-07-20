from datetime import datetime
from typing import Literal, Optional

from pydantic import (
    BaseModel,
    ConfigDict,
    Field,
    field_validator,
    model_validator,
)


MobileSubjectType = Literal[
    "guard",
    "client",
]

MobilePlatform = Literal[
    "android",
    "ios",
]

MobileDeviceStatus = Literal[
    "pending",
    "online",
    "offline",
    "disabled",
]

MobileSessionType = Literal[
    "guard_shift",
    "client_protection",
]

MobileSessionStatus = Literal[
    "pending",
    "active",
    "ended",
    "cancelled",
    "expired",
    "revoked",
]

MobileSOSStatus = Literal[
    "active",
    "acknowledged",
    "resolved",
    "cancelled",
]


class MobileSubjectCreate(BaseModel):
    subject_type: MobileSubjectType

    display_name: str = Field(
        min_length=2,
        max_length=150,
    )

    operator_id: Optional[str] = Field(
        default=None,
        min_length=1,
        max_length=100,
    )

    phone_number: Optional[str] = Field(
        default=None,
        max_length=30,
    )

    external_reference: Optional[str] = Field(
        default=None,
        max_length=100,
    )

    is_active: bool = True

    @field_validator("display_name")
    @classmethod
    def clean_display_name(
        cls,
        value: str,
    ) -> str:
        cleaned_value = value.strip()

        if not cleaned_value:
            raise ValueError(
                "Display name cannot be empty."
            )

        return cleaned_value

    @field_validator(
        "operator_id",
        "phone_number",
        "external_reference",
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

    @model_validator(mode="after")
    def validate_subject_type(
        self,
    ) -> "MobileSubjectCreate":
        if (
            self.subject_type == "guard"
            and not self.operator_id
        ):
            raise ValueError(
                "A guard tracking subject must be "
                "linked to an operator account."
            )

        if (
            self.subject_type == "client"
            and self.operator_id is not None
        ):
            raise ValueError(
                "A client tracking subject cannot be "
                "linked as a GuardFlow operator."
            )

        return self


class MobileSubjectUpdate(BaseModel):
    display_name: Optional[str] = Field(
        default=None,
        min_length=2,
        max_length=150,
    )

    phone_number: Optional[str] = Field(
        default=None,
        max_length=30,
    )

    external_reference: Optional[str] = Field(
        default=None,
        max_length=100,
    )

    is_active: Optional[bool] = None

    @field_validator(
        "display_name",
        "phone_number",
        "external_reference",
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


class MobileSubjectOut(BaseModel):
    id: str
    subject_type: MobileSubjectType
    display_name: str

    operator_id: Optional[str] = None
    phone_number: Optional[str] = None
    external_reference: Optional[str] = None

    is_active: bool

    created_by_operator_id: Optional[str] = None
    created_at: datetime
    updated_at: datetime

    model_config = ConfigDict(
        from_attributes=True
    )


class MobileDeviceCreate(BaseModel):
    subject_id: str = Field(
        min_length=1,
        max_length=100,
    )

    device_id: str = Field(
        min_length=8,
        max_length=150,
    )

    device_name: Optional[str] = Field(
        default=None,
        max_length=150,
    )

    platform: MobilePlatform

    app_version: Optional[str] = Field(
        default=None,
        max_length=30,
    )

    is_active: bool = True

    @field_validator(
        "subject_id",
        "device_id",
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
        "device_name",
        "app_version",
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


class MobileDeviceUpdate(BaseModel):
    device_name: Optional[str] = Field(
        default=None,
        max_length=150,
    )

    app_version: Optional[str] = Field(
        default=None,
        max_length=30,
    )

    is_active: Optional[bool] = None

    @field_validator(
        "device_name",
        "app_version",
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


class MobileDeviceOut(BaseModel):
    id: str
    device_id: str
    subject_id: str

    device_name: Optional[str] = None
    platform: MobilePlatform
    app_version: Optional[str] = None

    status: MobileDeviceStatus
    is_active: bool
    last_seen_at: Optional[datetime] = None

    registered_by_operator_id: Optional[str] = None
    created_at: datetime
    updated_at: datetime

    model_config = ConfigDict(
        from_attributes=True
    )


class MobileDeviceRegistrationResult(
    MobileDeviceOut
):
    """
    Returned only when a mobile device is registered
    or its authentication token is deliberately rotated.

    The plaintext token must be copied immediately.
    It is never stored or returned again.
    """

    mobile_device_token: str


class MobileSessionCreate(BaseModel):
    subject_id: str = Field(
        min_length=1,
        max_length=100,
    )

    device_id: str = Field(
        min_length=1,
        max_length=100,
    )

    session_type: MobileSessionType

    case_id: Optional[str] = Field(
        default=None,
        min_length=1,
        max_length=100,
    )

    expected_end_at: Optional[datetime] = None

    consent_confirmed: bool = False

    consent_reference: Optional[str] = Field(
        default=None,
        max_length=150,
    )

    @field_validator(
        "subject_id",
        "device_id",
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
        "case_id",
        "consent_reference",
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

    @model_validator(mode="after")
    def validate_consent(
        self,
    ) -> "MobileSessionCreate":
        if (
            self.session_type
            == "client_protection"
            and not self.consent_confirmed
        ):
            raise ValueError(
                "A client protection session requires "
                "explicit client consent."
            )

        return self


class MobileSessionOut(BaseModel):
    id: str
    subject_id: str
    device_id: str

    session_type: MobileSessionType
    status: MobileSessionStatus

    case_id: Optional[str] = None

    consent_given_at: Optional[datetime] = None
    consent_reference: Optional[str] = None
    consent_revoked_at: Optional[datetime] = None

    started_at: Optional[datetime] = None
    expected_end_at: Optional[datetime] = None
    ended_at: Optional[datetime] = None

    started_by_operator_id: Optional[str] = None
    ended_by_operator_id: Optional[str] = None

    created_at: datetime
    updated_at: datetime

    model_config = ConfigDict(
        from_attributes=True
    )


class MobileSessionEndRequest(BaseModel):
    consent_revoked: bool = False

    reason: Optional[str] = Field(
        default=None,
        max_length=500,
    )

    @field_validator("reason")
    @classmethod
    def clean_optional_reason(
        cls,
        value: Optional[str],
    ) -> Optional[str]:
        if value is None:
            return None

        cleaned_value = value.strip()
        return cleaned_value or None


class MobileLocationCreate(BaseModel):
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


class MobileLocationOut(BaseModel):
    id: int
    session_id: str
    subject_id: str
    device_id: str

    latitude: float
    longitude: float

    accuracy_metres: Optional[float] = None
    altitude_metres: Optional[float] = None
    speed_kmh: Optional[float] = None
    heading_degrees: Optional[float] = None
    battery_percentage: Optional[int] = None

    recorded_at: datetime
    received_at: datetime

    model_config = ConfigDict(
        from_attributes=True
    )


class MobileLiveSubjectOut(BaseModel):
    subject: MobileSubjectOut
    session: MobileSessionOut
    latest_location: Optional[MobileLocationOut] = None
    device_status: MobileDeviceStatus


class MobileSOSCreate(BaseModel):
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
    def clean_optional_message(
        cls,
        value: Optional[str],
    ) -> Optional[str]:
        if value is None:
            return None

        cleaned_value = value.strip()
        return cleaned_value or None


class MobileSOSOut(BaseModel):
    id: str
    session_id: str
    subject_id: str
    device_id: str

    status: MobileSOSStatus

    latitude: float
    longitude: float
    accuracy_metres: Optional[float] = None

    message: Optional[str] = None
    triggered_at: datetime

    acknowledged_at: Optional[datetime] = None
    acknowledged_by_operator_id: Optional[str] = None

    resolved_at: Optional[datetime] = None
    resolved_by_operator_id: Optional[str] = None

    created_at: datetime
    updated_at: datetime

    model_config = ConfigDict(
        from_attributes=True
    )


class MobileSOSAction(BaseModel):
    action: Literal[
        "acknowledge",
        "resolve",
        "cancel",
    ]