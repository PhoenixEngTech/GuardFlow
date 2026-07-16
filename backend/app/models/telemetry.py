import uuid
from sqlalchemy import Column, String, Float, Integer, DateTime, ForeignKey, Boolean
from sqlalchemy.sql import func
from app.core.database import Base

class TrackedVehicle(Base):
    __tablename__ = "tracked_vehicles"

    id = Column(String, primary_key=True, index=True, default=lambda: str(uuid.uuid4()))
    case_id = Column(String, ForeignKey("case_files.id", ondelete="CASCADE"), nullable=False)
    make = Column(String(50), nullable=False)
    model = Column(String(50), nullable=False)
    color = Column(String(30), nullable=True)
    license_plate = Column(String(15), unique=True, index=True, nullable=False)
    tracker_hardware_id = Column(String(50), unique=True, index=True, nullable=True)
    is_actively_tracked = Column(Boolean, default=True)

class TelemetryLog(Base):
    __tablename__ = "telemetry_logs"

    id = Column(Integer, primary_key=True, index=True, autoincrement=True)
    vehicle_id = Column(String, ForeignKey("tracked_vehicles.id", ondelete="CASCADE"), nullable=False)
    
    # Store coordinates cleanly as standard floats; we convert to spatial geometries in pgAdmin queries
    latitude = Column(Float, nullable=False)
    longitude = Column(Float, nullable=False)
    
    speed_kmh = Column(Float, nullable=True)
    heading_degrees = Column(Integer, nullable=True)
    battery_percentage = Column(Integer, nullable=True)
    logged_at = Column(DateTime(timezone=True), server_default=func.now())
