from datetime import datetime
from typing import Literal, Optional, Union
from uuid import UUID

from pydantic import BaseModel


EvidenceType = Literal[
    "document",
    "photo",
    "video",
    "audio",
    "other",
]


class CaseEvidenceOut(BaseModel):
    id: Union[str, UUID]
    case_id: Union[str, UUID]
    uploaded_by_operator_id: Optional[Union[str, UUID]] = None

    original_filename: str
    content_type: str
    file_size: int
    evidence_type: EvidenceType
    description: Optional[str] = None
    sha256_hash: str
    created_at: datetime

    class Config:
        from_attributes = True
