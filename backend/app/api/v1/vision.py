import uuid
from datetime import datetime
from typing import Any, List, Literal, Optional

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
from app.models.user import Operator
from app.models.vision import ANPRHit, WatchlistPlate


router = APIRouter()


RiskLevel = Literal[
    "low",
    "medium",
    "high",
    "critical",
]


class WatchlistCreate(BaseModel):
    case_id: Optional[str] = None
    license_plate: str = Field(
        min_length=1,
        max_length=15,
    )
    flag_reason: str = Field(
        min_length=1,
        max_length=500,
    )
    risk_level: RiskLevel = "medium"

    @field_validator(
        "license_plate",
        "flag_reason",
    )
    @classmethod
    def clean_required_text(
        cls,
        value: str,
    ) -> str:
        cleaned_value = value.strip()

        if not cleaned_value:
            raise ValueError(
                "This field cannot be empty."
            )

        return cleaned_value

    @field_validator("case_id")
    @classmethod
    def clean_optional_case_id(
        cls,
        value: Optional[str],
    ) -> Optional[str]:
        if value is None:
            return None

        cleaned_value = value.strip()
        return cleaned_value or None


class WatchlistOut(BaseModel):
    id: str
    case_id: str
    license_plate: str
    risk_level: str
    flag_reason: str
    created_at: datetime


class VisionAlertOut(BaseModel):
    id: str
    watchlist_plate_id: str
    case_id: str
    license_plate: str
    risk_level: str
    confidence_score: float
    camera_location: str
    camera_id: str
    latitude: float
    longitude: float
    cropped_plate_image_url: Optional[str] = None
    captured_at: datetime


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


def resolve_watchlist_case(
    requested_case_id: Optional[str],
    current_operator: Operator,
    db: Session,
) -> CaseFile:
    """
    Prefer an explicit case ID.

    The optional fallback exists only for compatibility with the
    current frontend: it is allowed when exactly one accessible
    case exists. GuardFlow never guesses between multiple cases.
    """

    if requested_case_id:
        case_file = get_case_or_404(
            requested_case_id,
            db,
        )

        ensure_case_access(
            current_operator,
            case_file,
        )

        return case_file

    query = db.query(CaseFile)

    if current_operator.role == "investigator":
        query = query.filter(
            CaseFile.assigned_operator_id
            == current_operator.id
        )

    candidates = (
        query.order_by(
            CaseFile.created_at.desc()
        )
        .limit(2)
        .all()
    )

    if len(candidates) != 1:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=(
                "A case_id is required when zero or "
                "multiple accessible cases exist."
            ),
        )

    return candidates[0]


@router.get(
    "/watchlist",
    response_model=List[WatchlistOut],
)
@router.get(
    "/watchlist/",
    response_model=List[WatchlistOut],
    include_in_schema=False,
)
def get_vision_watchlist(
    db: Session = Depends(get_db),
    current_operator: Operator = Depends(
        get_current_operator
    ),
) -> Any:
    """
    Return real watchlist entries from PostgreSQL.

    Investigators see entries only for their assigned cases.
    """

    query = db.query(WatchlistPlate)

    if current_operator.role == "investigator":
        query = (
            query.join(
                CaseFile,
                WatchlistPlate.case_id
                == CaseFile.id,
            )
            .filter(
                CaseFile.assigned_operator_id
                == current_operator.id
            )
        )

    records = (
        query.order_by(
            WatchlistPlate.created_at.desc()
        )
        .all()
    )

    return [
        WatchlistOut(
            id=record.id,
            case_id=record.case_id,
            license_plate=record.license_plate,
            risk_level=record.risk_level,
            flag_reason=record.reason_flagged,
            created_at=record.created_at,
        )
        for record in records
    ]


@router.post(
    "/watchlist",
    response_model=WatchlistOut,
    status_code=status.HTTP_201_CREATED,
)
@router.post(
    "/watchlist/",
    response_model=WatchlistOut,
    status_code=status.HTTP_201_CREATED,
    include_in_schema=False,
)
def add_to_watchlist(
    target: WatchlistCreate,
    db: Session = Depends(get_db),
    current_operator: Operator = Depends(
        get_current_operator
    ),
) -> Any:
    """
    Add a real vehicle plate to the VisionFlow watchlist.

    Only master, admin and dispatcher roles may create targets.
    """

    ensure_case_management(
        current_operator
    )

    case_file = resolve_watchlist_case(
        target.case_id,
        current_operator,
        db,
    )

    normalized_plate = (
        " ".join(
            target.license_plate
            .upper()
            .split()
        )
    )

    existing_plate = (
        db.query(WatchlistPlate)
        .filter(
            func.lower(
                WatchlistPlate.license_plate
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
                "registered on the watchlist."
            ),
        )

    watchlist_entry = WatchlistPlate(
        id=str(uuid.uuid4()),
        case_id=case_file.id,
        license_plate=normalized_plate,
        risk_level=target.risk_level,
        reason_flagged=target.flag_reason.strip(),
    )

    activity = CaseActivity(
        id=str(uuid.uuid4()),
        case_id=case_file.id,
        operator_id=current_operator.id,
        event_type="watchlist_added",
        summary=(
            f"VisionFlow watchlist target added: "
            f"{normalized_plate}."
        ),
        changes={
            "watchlist_id": watchlist_entry.id,
            "license_plate": normalized_plate,
            "risk_level": target.risk_level,
            "flag_reason": (
                target.flag_reason.strip()
            ),
        },
    )

    try:
        db.add(watchlist_entry)
        db.add(activity)
        db.commit()
        db.refresh(watchlist_entry)

    except IntegrityError as exc:
        db.rollback()

        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=(
                "That licence plate is already "
                "registered on the watchlist."
            ),
        ) from exc

    return WatchlistOut(
        id=watchlist_entry.id,
        case_id=watchlist_entry.case_id,
        license_plate=watchlist_entry.license_plate,
        risk_level=watchlist_entry.risk_level,
        flag_reason=watchlist_entry.reason_flagged,
        created_at=watchlist_entry.created_at,
    )


@router.get(
    "/alerts",
    response_model=List[VisionAlertOut],
)
@router.get(
    "/alerts/",
    response_model=List[VisionAlertOut],
    include_in_schema=False,
)
def get_vision_alerts(
    limit: int = Query(
        default=200,
        ge=1,
        le=1000,
    ),
    db: Session = Depends(get_db),
    current_operator: Operator = Depends(
        get_current_operator
    ),
) -> Any:
    """
    Return real ANPR detections joined to their watchlist targets.

    No demonstration or fallback alerts are generated.
    """

    query = (
        db.query(
            ANPRHit,
            WatchlistPlate,
        )
        .join(
            WatchlistPlate,
            ANPRHit.watchlist_plate_id
            == WatchlistPlate.id,
        )
    )

    if current_operator.role == "investigator":
        query = (
            query.join(
                CaseFile,
                WatchlistPlate.case_id
                == CaseFile.id,
            )
            .filter(
                CaseFile.assigned_operator_id
                == current_operator.id
            )
        )

    rows = (
        query.order_by(
            ANPRHit.spotted_at.desc()
        )
        .limit(limit)
        .all()
    )

    return [
        VisionAlertOut(
            id=hit.id,
            watchlist_plate_id=(
                hit.watchlist_plate_id
            ),
            case_id=plate.case_id,
            license_plate=plate.license_plate,
            risk_level=plate.risk_level,
            confidence_score=hit.confidence_score,
            camera_location=hit.camera_name,
            camera_id=hit.camera_name,
            latitude=hit.latitude,
            longitude=hit.longitude,
            cropped_plate_image_url=(
                hit.cropped_plate_image_url
            ),
            captured_at=hit.spotted_at,
        )
        for hit, plate in rows
    ]
