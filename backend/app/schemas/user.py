from datetime import datetime
from typing import Literal, Optional

from pydantic import (
    BaseModel,
    ConfigDict,
    EmailStr,
    Field,
    field_validator,
)


OperatorRole = Literal[
    "admin",
    "dispatcher",
    "investigator",
]


class UserBase(BaseModel):
    username: str = Field(
        min_length=3,
        max_length=50,
    )

    email: EmailStr

    role: OperatorRole = "dispatcher"

    is_active: bool = True

    @field_validator("username")
    @classmethod
    def clean_username(cls, value: str) -> str:
        cleaned_value = value.strip()

        if not cleaned_value:
            raise ValueError(
                "Username cannot be empty."
            )

        return cleaned_value


class UserCreate(UserBase):
    password: str = Field(
        min_length=12,
        max_length=128,
    )


class UserUpdate(BaseModel):
    username: Optional[str] = Field(
        default=None,
        min_length=3,
        max_length=50,
    )

    email: Optional[EmailStr] = None

    role: Optional[OperatorRole] = None

    is_active: Optional[bool] = None

    @field_validator("username")
    @classmethod
    def clean_optional_username(
        cls,
        value: Optional[str],
    ) -> Optional[str]:
        if value is None:
            return None

        cleaned_value = value.strip()

        if not cleaned_value:
            raise ValueError(
                "Username cannot be empty."
            )

        return cleaned_value


class PasswordReset(BaseModel):
    new_password: str = Field(
        min_length=12,
        max_length=128,
    )


class UserOut(UserBase):
    id: str
    created_at: datetime

    model_config = ConfigDict(
        from_attributes=True
    )


class Token(BaseModel):
    access_token: str
    token_type: str
    role: str
