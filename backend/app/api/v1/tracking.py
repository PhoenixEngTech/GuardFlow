import uuid
from typing import Any, List, Optional

from fastapi import APIRouter, Depends, HTTPException, Query, status
from pydantic import BaseModel, ConfigDict, Field, field_validator
from sqlalchemy import func
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.api.deps import get_current_operator
from app.core.database import get_db
from app.core.permissions import (
    ensure_case_access,
    ensure_case_management,
)
from app.models.activity import CaseActivity
from app.models.case import CaseFile
from app.models.telemetry import TelemetryLog, TrackedVehicle
from app.models.user import Operator


router = APIRouter()


class VehicleCreate(BaseModel):
    case_id: str
    make: str = Field(min_length=1, max_length=50)
    model: str = Field(min_length=1, max_length=50)
    color: Optional[str] = Field(default=None, max_length=30)
    license_plate: str = Field(min_length=1, max_length=15)
    tracker_hardware_id: Optional[str] = Field(default=None, max_length=50)

    @field_validator(
        "case_id",
        "make",
        "model",
        "license_plate",
    )
    @classmethod
    def clean_required_text(cls, value: str) -> str:
        cleaned_value = value.strip()

        if not cleaned_value:
            raise ValueError("This field cannot be empty.")

        return cleaned_value

    @field_validator("color", "tracker_hardware_id")
    @classmethod
    def clean_optional_text(
        cls,
        value: Optional[str],
    ) -> Optional[str]:
        if value is None:
            return None

        cleaned_value = value.strip()
        return cleaned_value or None


class VehicleOut(BaseModel):
    id: str
    case_id: str
    make: str
    model: str
    color: Optional[str] = None
    license_plate: str
    tracker_hardware_id: Optional[str] = None
    is_actively_tracked: bool

    model_config = ConfigDict(from_attributes=True)


class TelemetryOut(BaseModel):
    id: int
    vehicle_id: str
    latitude: float
    longitude: float
    speed_kmh: Optional[float] = None
    heading_degrees: Optional[int] = None
    battery_percentage: Optional[int] = None
    logged_at: Any

    model_config = ConfigDict(from_attributes=True)


def get_case_or_404(
    case_id: str,
    db: Session,
) -> CaseFile:
    case_file = (
        db.query(CaseFile)
        .filter(CaseFile.id == case_id)
        .first()
    )

    if case_file is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Case file not found.",
        )

    return case_file


def get_vehicle_or_404(
    vehicle_id: str,
    db: Session,
) -> TrackedVehicle:
    vehicle = (
        db.query(TrackedVehicle)
        .filter(TrackedVehicle.id == vehicle_id)
        .first()
    )

    if vehicle is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Tracked vehicle not found.",
        )

    return vehicle


@router.get(
    "/vehicles",
    response_model=List[VehicleOut],
)
@router.get(
    "/vehicles/",
    response_model=List[VehicleOut],
    include_in_schema=False,
)
def get_tracked_vehicles(
    db: Session = Depends(get_db),
    current_operator: Operator = Depends(
        get_current_operator
    ),
) -> Any:
    """
    Return real tracked vehicles from PostgreSQL.

    Master, admin and dispatcher roles see the full fleet.
    Investigators see only vehicles linked to their assigned cases.
    """

    query = db.query(TrackedVehicle)

    if current_operator.role == "investigator":
        query = (
            query.join(
                CaseFile,
                TrackedVehicle.case_id == CaseFile.id,
            )
            .filter(
                CaseFile.assigned_operator_id
                == current_operator.id
            )
        )

    return (
        query.order_by(
            TrackedVehicle.license_plate.asc()
        )
        .all()
    )


@router.get(
    "/vehicles/{vehicle_id}/history",
    response_model=List[TelemetryOut],
)
def get_vehicle_history(
    vehicle_id: str,
    limit: int = Query(
        default=250,
        ge=1,
        le=1000,
    ),
    db: Session = Depends(get_db),
    current_operator: Operator = Depends(
        get_current_operator
    ),
) -> Any:
    """
    Return real telemetry logs for an authorised vehicle.

    Results are returned oldest-to-newest so the frontend can
    draw a route in chronological order.
    """

    vehicle = get_vehicle_or_404(
        vehicle_id,
        db,
    )

    case_file = get_case_or_404(
        vehicle.case_id,
        db,
    )

    ensure_case_access(
        current_operator,
        case_file,
    )

    newest_first = (
        db.query(TelemetryLog)
        .filter(
            TelemetryLog.vehicle_id == vehicle.id
        )
        .order_by(
            TelemetryLog.logged_at.desc(),
            TelemetryLog.id.desc(),
        )
        .limit(limit)
        .all()
    )

    return list(reversed(newest_first))


@router.post(
    "/vehicles",
    response_model=VehicleOut,
    status_code=status.HTTP_201_CREATED,
)
@router.post(
    "/vehicles/",
    response_model=VehicleOut,
    status_code=status.HTTP_201_CREATED,
    include_in_schema=False,
)
def create_tracked_vehicle(
    vehicle_in: VehicleCreate,
    db: Session = Depends(get_db),
    current_operator: Operator = Depends(
        get_current_operator
    ),
) -> Any:
    """
    Register a real tracked vehicle.

    Only master, admin and dispatcher roles may register assets.
    """

    ensure_case_management(
        current_operator
    )

    case_file = get_case_or_404(
        vehicle_in.case_id,
        db,
    )

    normalized_plate = (
        " ".join(
            vehicle_in.license_plate
            .upper()
            .split()
        )
    )

    existing_plate = (
        db.query(TrackedVehicle)
        .filter(
            func.lower(
                TrackedVehicle.license_plate
            )
            == normalized_plate.lower()
        )
        .first()
    )

    if existing_plate is not None:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=(
                "That licence plate is already "
                "registered for tracking."
            ),
        )

    tracker_hardware_id = (
        vehicle_in.tracker_hardware_id
        if vehicle_in.tracker_hardware_id
        else None
    )

    if tracker_hardware_id:
        existing_tracker = (
            db.query(TrackedVehicle)
            .filter(
                func.lower(
                    TrackedVehicle.tracker_hardware_id
                )
                == tracker_hardware_id.lower()
            )
            .first()
        )

        if existing_tracker is not None:
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail=(
                    "That tracker hardware ID is "
                    "already assigned."
                ),
            )

    vehicle = TrackedVehicle(
        id=str(uuid.uuid4()),
        case_id=case_file.id,
        make=vehicle_in.make.strip(),
        model=vehicle_in.model.strip(),
        color=(
            vehicle_in.color.strip()
            if vehicle_in.color
            else None
        ),
        license_plate=normalized_plate,
        tracker_hardware_id=tracker_hardware_id,
        is_actively_tracked=True,
    )

    activity = CaseActivity(
        id=str(uuid.uuid4()),
        case_id=case_file.id,
        operator_id=current_operator.id,
        event_type="vehicle_registered",
        summary=(
            f"Tracked vehicle registered: "
            f"{normalized_plate}."
        ),
        changes={
            "vehicle_id": vehicle.id,
            "license_plate": normalized_plate,
            "make": vehicle.make,
            "model": vehicle.model,
            "tracker_hardware_id": (
                tracker_hardware_id
            ),
        },
    )

    try:
        db.add(vehicle)
        db.add(activity)
        db.commit()
        db.refresh(vehicle)

    except IntegrityError as exc:
        db.rollback()

        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=(
                "The vehicle or tracker identifier "
                "is already registered."
            ),
        ) from exc

    return vehicle
