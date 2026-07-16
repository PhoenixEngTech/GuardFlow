from pydantic import BaseModel
from datetime import datetime
from typing import Optional, Union
from uuid import UUID

# For registering a target car or device asset
class VehicleCreate(BaseModel):
    case_id: Union[str, UUID]
    make: str
    model: str
    color: Optional[str] = None
    license_plate: str
    tracker_hardware_id: Optional[str] = None

class VehicleOut(VehicleCreate):
    id: Union[str, UUID]
    is_actively_tracked: bool

    class Config:
        from_attributes = True

# For incoming GPS location pings from the field
class TelemetryPing(BaseModel):
    latitude: float
    longitude: float
    speed_kmh: Optional[float] = 0.0
    heading_degrees: Optional[int] = 0
    battery_percentage: Optional[int] = 100

class TelemetryOut(TelemetryPing):
    id: int
    vehicle_id: Union[str, UUID]
    logged_at: datetime

    class Config:
        from_attributes = True
