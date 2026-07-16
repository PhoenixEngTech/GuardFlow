from pydantic import BaseModel
from datetime import datetime
from typing import Optional, Union
from uuid import UUID

# Properties required to create a new case file via the API
class CaseCreate(BaseModel):
    title: str
    description: Optional[str] = None
    assigned_operator_id: Optional[Union[str, UUID]] = None  # Accepts either string format or native UUID keys

# Properties returned to the client browser securely
class CaseOut(BaseModel):
    id: Union[str, UUID]                    # Prevents Pydantic string validation errors
    case_number: str
    title: str
    description: Optional[str]
    status: str
    assigned_operator_id: Optional[Union[str, UUID]] # Prevents tracking key mismatches
    created_at: datetime

    class Config:
        from_attributes = True
