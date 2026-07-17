import uuid

from sqlalchemy import JSON, Column, DateTime, ForeignKey, String
from sqlalchemy.sql import func

from app.core.database import Base


class CaseActivity(Base):
    __tablename__ = "case_activities"

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

    operator_id = Column(
        String,
        ForeignKey("operators.id"),
        nullable=True,
        index=True,
    )

    event_type = Column(
        String,
        nullable=False,
    )

    summary = Column(
        String,
        nullable=False,
    )

    changes = Column(
        JSON,
        nullable=True,
    )

    created_at = Column(
        DateTime(timezone=True),
        server_default=func.now(),
        nullable=False,
    )
