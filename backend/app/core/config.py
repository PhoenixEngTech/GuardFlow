import os
from pydantic_settings import BaseSettings

class Settings(BaseSettings):
    PROJECT_NAME: str = "GuardFlow"
    API_V1_STR: str = "/api/v1"
    SECRET_KEY: str = "SUPER_SECRET_KEY_FOR_PHOENIX_ENGTECH_2026"
    ALGORITHM: str = "HS256"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 480  # 8 hours

    # Direct connection link to pgAdmin 4
    DATABASE_URL: str = "postgresql://postgres:postgres@localhost:5432/guardflow"

    class Config:
        # Explicit path pointing exactly to your Desktop root folder where .env sits
        env_file = "C:\\Users\\user\\Desktop\\GuardFlow\\backend\\.env"
        case_sensitive = True

settings = Settings()
