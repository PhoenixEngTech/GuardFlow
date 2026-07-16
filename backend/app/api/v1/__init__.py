from fastapi import APIRouter
from app.api.v1 import auth, cases, tracking, vision

router = APIRouter()

router.include_router(auth.router, prefix="/auth", tags=["Authentication"])
router.include_router(cases.router, prefix="/cases", tags=["Case Files"])
router.include_router(tracking.router, prefix="/tracking", tags=["Tactical Telematics"])
router.include_router(vision.router, prefix="/vision", tags=["VisionFlow AI"])
