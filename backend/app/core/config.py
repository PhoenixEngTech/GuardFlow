from pydantic import Field, field_validator
from pydantic_settings import (
    BaseSettings,
    SettingsConfigDict,
)


class Settings(BaseSettings):
    PROJECT_NAME: str = "GuardFlow"
    API_V1_STR: str = "/api/v1"

    SECRET_KEY: str = Field(
        min_length=32,
    )

    ALGORITHM: str = "HS256"

    ACCESS_TOKEN_EXPIRE_MINUTES: int = Field(
        default=480,
        ge=15,
        le=1440,
    )

    DATABASE_URL: str

    VISIONFLOW_WORKER_TOKEN: str = Field(
        min_length=48,
    )

    REDIS_URL: str = (
        "redis://localhost:6379/0"
    )

    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        case_sensitive=True,
        extra="ignore",
    )

    @field_validator(
        "SECRET_KEY",
        "DATABASE_URL",
        "VISIONFLOW_WORKER_TOKEN",
    )
    @classmethod
    def validate_required_settings(
        cls,
        value: str,
    ) -> str:
        cleaned_value = value.strip()

        if not cleaned_value:
            raise ValueError(
                "Required environment setting "
                "cannot be empty."
            )

        return cleaned_value


settings = Settings()
