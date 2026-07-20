from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.core.config import settings
from app.core.database import Base, engine


# Register database models before creating tables.
import app.models.user
import app.models.case
import app.models.telemetry
import app.models.vision
import app.models.activity
import app.models.evidence
import app.models.camera
import app.models.edge_gateway
import app.models.mobile_tracking


Base.metadata.create_all(bind=engine)


# Import API routers.
from app.api.v1 import (
    auth,
    cameras,
    cases,
    edge,
    edge_gateways,
    evidence,
    mobile,
    mobile_operations,
    mobile_sessions,
    mobile_tracking,
    operators,
    tracking,
    vision,
    worker,
)


app = FastAPI(
    title=settings.PROJECT_NAME,
    version="1.0.0",
    openapi_url=f"{settings.API_V1_STR}/openapi.json",
)


app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


app.include_router(
    auth.router,
    prefix="/api/v1/auth",
    tags=["Authentication"],
)

app.include_router(
    cases.router,
    prefix="/api/v1/cases",
    tags=["Case Files"],
)

app.include_router(
    tracking.router,
    prefix="/api/v1/tracking",
    tags=["Tactical Telematics"],
)

app.include_router(
    vision.router,
    prefix="/api/v1/vision",
    tags=["VisionFlow AI"],
)

app.include_router(
    evidence.router,
    prefix="/api/v1/evidence",
    tags=["Evidence Management"],
)

app.include_router(
    operators.router,
    prefix="/api/v1/operators",
    tags=["Operator Management"],
)

app.include_router(
    cameras.router,
    prefix="/api/v1/cameras",
    tags=["Camera Source Management"],
)

app.include_router(
    edge_gateways.router,
    prefix="/api/v1/edge-gateways",
    tags=["Edge Gateway Management"],
)

app.include_router(
    mobile_tracking.router,
    prefix="/api/v1/mobile-tracking",
    tags=["Mobile Tracking Management"],
)

app.include_router(
    mobile_sessions.router,
    prefix="/api/v1/mobile-tracking",
    tags=["Mobile Tracking Sessions"],
)

app.include_router(
    mobile_operations.router,
    prefix="/api/v1/mobile-tracking",
    tags=["Mobile Tracking Operations"],
)

app.include_router(
    mobile.router,
    prefix="/api/v1/mobile",
    tags=["Mobile Companion"],
)

app.include_router(
    edge.router,
    prefix="/api/v1/internal/edge",
    tags=["Edge Gateway Internal"],
    include_in_schema=False,
)

app.include_router(
    worker.router,
    prefix="/api/v1/internal/visionflow",
    tags=["VisionFlow Worker"],
    include_in_schema=False,
)


@app.get("/")
def root_health_check():
    return {
        "status": "online",
        "system": "GuardFlow Engine Core",
        "developer": "Phoenix EngTech",
    }