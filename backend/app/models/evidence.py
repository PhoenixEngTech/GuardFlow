import uuid

from sqlalchemy import BigInteger, Column, DateTime, ForeignKey, String, Text
from sqlalchemy.sql import func

from app.core.database import Base


class CaseEvidence(Base):
    __tablename__ = "case_evidence"

    id = Column(
        String,
        primary_key=True,
        index=True,
        default=lambda: str(uuid.uuid4()),
    )

    case_id = Column(
        String,
        ForeignKey("case_files.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )

    uploaded_by_operator_id = Column(
        String,
        ForeignKey("operators.id"),
        nullable=True,
        index=True,
    )

    original_filename = Column(
        String,
        nullable=False,
    )

    stored_filename = Column(
        String,
        unique=True,
        nullable=False,
    )

    storage_path = Column(
        String,
        nullable=False,
    )

    content_type = Column(
        String,
        nullable=False,
    )

    file_size = Column(
        BigInteger,
        nullable=False,
    )

    evidence_type = Column(
        String,
        default="document",
        nullable=False,
    )

    description = Column(
        Text,
        nullable=True,
    )

    sha256_hash = Column(
        String,
        nullable=False,
        index=True,
    )

    created_at = Column(
        DateTime(timezone=True),
        server_default=func.now(),
        nullable=False,
    )
