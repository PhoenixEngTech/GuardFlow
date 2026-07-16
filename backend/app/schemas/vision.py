from pydantic import BaseModel
from datetime import datetime
from typing import Optional, Union
from uuid import UUID

# For adding a license plate onto the active watchlist tracking filter
class PlateWatchCreate(BaseModel):
    case_id: Union[str, UUID]
    license_plate: str
    risk_level: Optional[str] = "medium"
    reason_flagged: str

class PlateWatchOut(PlateWatchCreate):
    id: Union[str, UUID]
    created_at: datetime

    class Config:
        from_attributes = True

# For incoming real-time alerts fired by your computer vision AI background worker instances
class ANPRHitIngest(BaseModel):
    camera_name: str
    latitude: float
    longitude: float
    confidence_score: float
    cropped_plate_image_url: Optional[str] = None

class ANPRHitOut(ANPRHitIngest):
    id: Union[str, UUID]
    watchlist_plate_id: Union[str, UUID]
    spotted_at: datetime

    class Config:
        from_attributes = True
