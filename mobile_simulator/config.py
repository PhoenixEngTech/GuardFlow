from pathlib import Path

from pydantic import Field, field_validator
from pydantic_settings import (
    BaseSettings,
    SettingsConfigDict,
)


BASE_DIRECTORY = Path(__file__).resolve().parent


class MobileSimulatorSettings(BaseSettings):
    GUARDFLOW_API_URL: str

    MOBILE_DEVICE_ID: str = Field(
        min_length=8,
        max_length=150,
    )

    MOBILE_DEVICE_TOKEN: str = Field(
        min_length=48,
    )

    HTTP_TIMEOUT_SECONDS: float = Field(
        default=20,
        gt=0,
        le=120,
    )

    model_config = SettingsConfigDict(
        env_file=BASE_DIRECTORY / ".env",
        env_file_encoding="utf-8",
        case_sensitive=True,
        extra="ignore",
    )

    @field_validator(
        "GUARDFLOW_API_URL",
        "MOBILE_DEVICE_ID",
        "MOBILE_DEVICE_TOKEN",
    )
    @classmethod
    def clean_required_values(
        cls,
        value: str,
    ) -> str:
        cleaned_value = value.strip()

        if not cleaned_value:
            raise ValueError(
                "Required mobile simulator setting "
                "cannot be empty."
            )

        return cleaned_value

    @field_validator("GUARDFLOW_API_URL")
    @classmethod
    def clean_api_url(
        cls,
        value: str,
    ) -> str:
        return value.rstrip("/")


settings = MobileSimulatorSettings()