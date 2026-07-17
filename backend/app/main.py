from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from app.core.config import settings
from app.core.database import engine, Base

# Import models explicitly
import app.models.user
import app.models.case
import app.models.telemetry
import app.models.vision
import app.models.activity
import app.models.evidence

# Create all tables
Base.metadata.create_all(bind=engine)

from app.api.v1 import auth, cases, tracking, vision

app = FastAPI(
    title=settings.PROJECT_NAME,
    version="1.0.0",
    openapi_url=f"{settings.API_V1_STR}/openapi.json"
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(auth.router, prefix="/api/v1/auth", tags=["Authentication"])
app.include_router(cases.router, prefix="/api/v1/cases", tags=["Case Files"])
app.include_router(tracking.router, prefix="/api/v1/tracking", tags=["Tactical Telematics"])
app.include_router(vision.router, prefix="/api/v1/vision", tags=["VisionFlow AI"])

@app.get("/")
def root_health_check():
    return {"status": "online", "system": "GuardFlow Engine Core", "developer": "Phoenix EngTech"}
