import uuid
from sqlalchemy import Column, String, Float, DateTime, ForeignKey
from sqlalchemy.sql import func
from app.core.database import Base

class WatchlistPlate(Base):
    __tablename__ = "watchlist_plates"

    id = Column(String, primary_key=True, index=True, default=lambda: str(uuid.uuid4()))
    case_id = Column(String, ForeignKey("case_files.id", ondelete="CASCADE"), nullable=False)
    license_plate = Column(String(15), unique=True, index=True, nullable=False)
    risk_level = Column(String(20), default="medium") # low, medium, high, critical
    reason_flagged = Column(String, nullable=False)
    created_at = Column(DateTime(timezone=True), server_default=func.now())

class ANPRHit(Base):
    __tablename__ = "anpr_hits"

    id = Column(String, primary_key=True, index=True, default=lambda: str(uuid.uuid4()))
    watchlist_plate_id = Column(String, ForeignKey("watchlist_plates.id", ondelete="CASCADE"), nullable=False)
    camera_name = Column(String(100), nullable=False) # e.g., 'N1_North_ Pretoria_Cam3'
    latitude = Column(Float, nullable=False)
    longitude = Column(Float, nullable=False)
    confidence_score = Column(Float, nullable=False) # AI model reading confidence (e.g., 0.94)
    cropped_plate_image_url = Column(String(255), nullable=True) # File system snapshot path
    spotted_at = Column(DateTime(timezone=True), server_default=func.now())
