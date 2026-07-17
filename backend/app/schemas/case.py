from datetime import datetime
from typing import Literal, Optional, Union
from uuid import UUID

from pydantic import BaseModel


CaseStatus = Literal[
    "open",
    "assigned",
    "active",
    "investigating",
    "suspended",
    "resolved",
    "closed",
]


class CaseCreate(BaseModel):
    title: str
    description: Optional[str] = None
    assigned_operator_id: Optional[Union[str, UUID]] = None


class CaseUpdate(BaseModel):
    title: Optional[str] = None
    description: Optional[str] = None
    status: Optional[CaseStatus] = None
    assigned_operator_id: Optional[Union[str, UUID]] = None


class CaseOut(BaseModel):
    id: Union[str, UUID]
    case_number: str
    title: str
    description: Optional[str]
    status: str
    assigned_operator_id: Optional[Union[str, UUID]]
    created_at: datetime

    class Config:
        from_attributes = True
