from pydantic import BaseModel, EmailStr
from typing import Optional
from datetime import datetime

# Shared properties across schemas
class UserBase(BaseModel):
    username: str
    email: EmailStr
    role: str = "dispatcher" # admin, dispatcher, investigator
    is_active: Optional[bool] = True

# Properties to receive via API on user creation
class UserCreate(UserBase):
    password: str

# Properties returned to the client browser via API safely (No passwords leaked)
class UserOut(UserBase):
    id: str
    created_at: datetime

    class Config:
        from_attributes = True

# Format required for the Login Response token
class Token(BaseModel):
    access_token: str
    token_type: str
    role: str
