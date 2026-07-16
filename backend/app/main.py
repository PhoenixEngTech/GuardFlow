from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from app.core.config import settings
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

# Enforcing direct endpoints mapping strings cleanly with zero repeats
app.include_router(auth.router, prefix="/api/v1/auth", tags=["Authentication"])
app.include_router(cases.router, prefix="/api/v1/cases", tags=["Case Files"])
app.include_router(tracking.router, prefix="/api/v1/tracking", tags=["Tactical Telematics"])
app.include_router(vision.router, prefix="/api/v1/vision", tags=["VisionFlow AI"])

@app.get("/")
def root_health_check():
    return {"status": "online", "system": "GuardFlow Engine Core", "developer": "Phoenix EngTech"}
