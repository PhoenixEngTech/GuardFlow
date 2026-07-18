from pathlib import Path

from pydantic import Field, field_validator
from pydantic_settings import (
    BaseSettings,
    SettingsConfigDict,
)


class EdgeGatewaySettings(BaseSettings):
    GATEWAY_NAME: str = Field(
        default="GuardFlow Edge Gateway",
        min_length=3,
        max_length=100,
    )

    GATEWAY_ID: str = Field(
        min_length=8,
        max_length=100,
    )

    GUARDFLOW_API_URL: str

    EDGE_GATEWAY_TOKEN: str = Field(
        min_length=48,
    )

    CAMERA_CONFIGURATION_FILE: Path = Path(
        "./data/cameras.json"
    )

    HEALTH_CHECK_INTERVAL_SECONDS: int = Field(
        default=30,
        ge=10,
        le=300,
    )

    CONTROL_PLANE_SYNC_INTERVAL_SECONDS: int = Field(
        default=60,
        ge=30,
        le=600,
    )

    HTTP_TIMEOUT_SECONDS: float = Field(
        default=20,
        gt=0,
        le=120,
    )

    LOG_LEVEL: str = "INFO"

    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        case_sensitive=True,
        extra="ignore",
    )

    @field_validator(
        "GUARDFLOW_API_URL",
        "EDGE_GATEWAY_TOKEN",
        "GATEWAY_ID",
    )
    @classmethod
    def clean_required_values(
        cls,
        value: str,
    ) -> str:
        cleaned_value = value.strip()

        if not cleaned_value:
            raise ValueError(
                "Required gateway setting cannot be empty."
            )

        return cleaned_value

    @field_validator("GUARDFLOW_API_URL")
    @classmethod
    def clean_api_url(
        cls,
        value: str,
    ) -> str:
        return value.rstrip("/")


settings = EdgeGatewaySettings()
