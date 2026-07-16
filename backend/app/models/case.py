from sqlalchemy import Column, String, DateTime, ForeignKey
from sqlalchemy.sql import func
from app.core.database import Base

class CaseFile(Base):
    __tablename__ = "case_files"

    id = Column(String, primary_key=True, index=True)
    case_number = Column(String, unique=True, index=True, nullable=False) # e.g., TPI-2026-0001
    title = Column(String, nullable=False)
    description = Column(String, nullable=True)
    status = Column(String, default="open") # open, suspended, closed
    assigned_operator_id = Column(String, ForeignKey("operators.id"), nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
