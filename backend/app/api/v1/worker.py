import uuid
from datetime import datetime, timezone
from typing import Any, List

from fastapi import (
    APIRouter,
    Depends,
    HTTPException,
    status,
)
from sqlalchemy import func
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.api.deps import get_visionflow_worker
from app.core.database import get_db
from app.models.camera import CameraSource
from app.models.vision import ANPRHit, WatchlistPlate
from app.schemas.worker import (
    ANPRDetectionCreate,
    ANPRDetectionResult,
    WorkerCameraHealthUpdate,
    WorkerCameraOut,
    WorkerWatchlistOut,
)


router = APIRouter()


def get_camera_or_404(
    camera_id: str,
    db: Session,
) -> CameraSource:
    camera = (
        db.query(CameraSource)
        .filter(CameraSource.id == camera_id)
        .first()
    )

    if camera is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Camera source not found.",
        )

    return camera


def normalize_plate(
    license_plate: str,
) -> str:
    return " ".join(
        license_plate.upper().split()
    )


@router.get(
    "/cameras",
    response_model=List[WorkerCameraOut],
)
@router.get(
    "/cameras/",
    response_model=List[WorkerCameraOut],
    include_in_schema=False,
)
def list_worker_cameras(
    db: Session = Depends(get_db),
    worker_identity: str = Depends(
        get_visionflow_worker
    ),
) -> Any:
    """
    Return active camera sources to the internal
    VisionFlow worker.
    """

    return (
        db.query(CameraSource)
        .filter(CameraSource.is_active.is_(True))
        .order_by(CameraSource.name.asc())
        .all()
    )


@router.post(
    "/cameras/{camera_id}/health",
    response_model=WorkerCameraOut,
)
def report_camera_health(
    camera_id: str,
    health_in: WorkerCameraHealthUpdate,
    db: Session = Depends(get_db),
    worker_identity: str = Depends(
        get_visionflow_worker
    ),
) -> Any:
    """
    Update camera health from the authenticated
    VisionFlow worker.
    """

    camera = get_camera_or_404(
        camera_id,
        db,
    )

    if not camera.is_active:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="The camera source is disabled.",
        )

    camera.status = health_in.status

    if health_in.status == "online":
        camera.last_seen_at = (
            health_in.checked_at
            or datetime.now(timezone.utc)
        )

    db.commit()
    db.refresh(camera)

    return camera


@router.get(
    "/watchlist",
    response_model=List[WorkerWatchlistOut],
)
@router.get(
    "/watchlist/",
    response_model=List[WorkerWatchlistOut],
    include_in_schema=False,
)
def list_worker_watchlist(
    db: Session = Depends(get_db),
    worker_identity: str = Depends(
        get_visionflow_worker
    ),
) -> Any:
    """
    Return the genuine plate watchlist used by
    VisionFlow ANPR processors.
    """

    return (
        db.query(WatchlistPlate)
        .order_by(
            WatchlistPlate.created_at.desc()
        )
        .all()
    )


@router.post(
    "/anpr/detections",
    response_model=ANPRDetectionResult,
    status_code=status.HTTP_201_CREATED,
)
@router.post(
    "/anpr/detections/",
    response_model=ANPRDetectionResult,
    status_code=status.HTTP_201_CREATED,
    include_in_schema=False,
)
def submit_anpr_detection(
    detection: ANPRDetectionCreate,
    db: Session = Depends(get_db),
    worker_identity: str = Depends(
        get_visionflow_worker
    ),
) -> Any:
    """
    Compare an ANPR reading against the real watchlist.

    Only matched detections are stored as ANPR alerts.
    """

    camera = get_camera_or_404(
        detection.camera_id,
        db,
    )

    if not camera.is_active:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="The camera source is disabled.",
        )

    normalized_plate = normalize_plate(
        detection.license_plate
    )

    watchlist_entry = (
        db.query(WatchlistPlate)
        .filter(
            func.lower(
                WatchlistPlate.license_plate
            )
            == normalized_plate.lower()
        )
        .first()
    )

    camera.status = "online"
    camera.last_seen_at = (
        detection.spotted_at
        or datetime.now(timezone.utc)
    )

    if watchlist_entry is None:
        db.commit()

        return ANPRDetectionResult(
            matched=False,
            message=(
                "Plate processed successfully. "
                "No watchlist match was found."
            ),
        )

    latitude = (
        detection.latitude
        if detection.latitude is not None
        else camera.latitude
    )

    longitude = (
        detection.longitude
        if detection.longitude is not None
        else camera.longitude
    )

    if latitude is None or longitude is None:
        db.rollback()

        raise HTTPException(
            status_code=(
                status.HTTP_422_UNPROCESSABLE_ENTITY
            ),
            detail=(
                "Detection coordinates are required "
                "because the camera has no registered "
                "location coordinates."
            ),
        )

    alert = ANPRHit(
        id=str(uuid.uuid4()),
        watchlist_plate_id=watchlist_entry.id,
        camera_name=camera.name,
        latitude=latitude,
        longitude=longitude,
        confidence_score=(
            detection.confidence_score
        ),
        cropped_plate_image_url=(
            detection.cropped_plate_image_url
        ),
        spotted_at=(
            detection.spotted_at
            or datetime.now(timezone.utc)
        ),
    )

    try:
        db.add(alert)
        db.commit()
        db.refresh(alert)

    except IntegrityError as exc:
        db.rollback()

        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=(
                "The ANPR alert could not be recorded."
            ),
        ) from exc

    return ANPRDetectionResult(
        matched=True,
        message=(
            "Watchlist match detected and the "
            "VisionFlow alert was recorded."
        ),
        alert_id=alert.id,
        watchlist_plate_id=watchlist_entry.id,
    )
