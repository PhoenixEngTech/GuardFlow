from datetime import datetime
from typing import Any, Dict, Optional, Union
from uuid import UUID

from pydantic import BaseModel


class CaseActivityOut(BaseModel):
    id: Union[str, UUID]
    case_id: Union[str, UUID]
    operator_id: Optional[Union[str, UUID]] = None
    event_type: str
    summary: str
    changes: Optional[Dict[str, Any]] = None
    created_at: datetime

    class Config:
        from_attributes = True
