import uuid
from datetime import datetime, timezone
from typing import Any, List

from fastapi import (
    APIRouter,
    Depends,
    HTTPException,
    Query,
    status,
)
from sqlalchemy import or_, select
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.core.permissions import (
    ensure_case_access,
    require_authenticated_operator,
    require_dispatch_operator,
)
from app.models.case import CaseFile
from app.models.mobile_tracking import (
    MobileDevice,
    MobileTrackingSession,
    MobileTrackingSubject,
)
from app.models.user import Operator
from app.schemas.mobile_tracking import (
    MobileSessionCreate,
    MobileSessionEndRequest,
    MobileSessionOut,
)


router = APIRouter()


VALID_SESSION_STATUSES = {
    "pending",
    "active",
    "ended",
    "cancelled",
    "expired",
    "revoked",
}


def get_mobile_session_or_404(
    session_id: str,
    db: Session,
) -> MobileTrackingSession:
    session = (
        db.query(MobileTrackingSession)
        .filter(
            MobileTrackingSession.id == session_id
        )
        .first()
    )

    if session is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Mobile tracking session not found.",
        )

    return session


def get_mobile_subject_or_404(
    subject_id: str,
    db: Session,
) -> MobileTrackingSubject:
    subject = (
        db.query(MobileTrackingSubject)
        .filter(
            MobileTrackingSubject.id == subject_id
        )
        .first()
    )

    if subject is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Mobile tracking subject not found.",
        )

    return subject


def get_mobile_device_or_404(
    device_record_id: str,
    db: Session,
) -> MobileDevice:
    device = (
        db.query(MobileDevice)
        .filter(
            MobileDevice.id == device_record_id
        )
        .first()
    )

    if device is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Mobile device record not found.",
        )

    return device


def get_case_or_404(
    case_id: str,
    db: Session,
) -> CaseFile:
    case_file = (
        db.query(CaseFile)
        .filter(
            CaseFile.id == case_id
        )
        .first()
    )

    if case_file is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="The selected case file does not exist.",
        )

    return case_file


def ensure_session_read_access(
    session: MobileTrackingSession,
    current_operator: Operator,
    db: Session,
) -> None:
    """
    Master, admin and dispatcher roles may read every
    mobile tracking session.

    Investigators may read only sessions connected to
    cases assigned directly to them.
    """

    if current_operator.role != "investigator":
        return

    if session.case_id is None:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail=(
                "Investigators may access only mobile "
                "sessions linked to their assigned cases."
            ),
        )

    case_file = get_case_or_404(
        session.case_id,
        db,
    )

    ensure_case_access(
        current_operator,
        case_file,
    )


def validate_expected_end_time(
    expected_end_at: datetime | None,
) -> datetime:
    """
    Require a future timezone-aware end time so mobile
    tracking cannot continue indefinitely.
    """

    if expected_end_at is None:
        raise HTTPException(
            status_code=(
                status.HTTP_422_UNPROCESSABLE_ENTITY
            ),
            detail=(
                "Every mobile tracking session requires "
                "an expected end date and time."
            ),
        )

    if (
        expected_end_at.tzinfo is None
        or expected_end_at.utcoffset() is None
    ):
        raise HTTPException(
            status_code=(
                status.HTTP_422_UNPROCESSABLE_ENTITY
            ),
            detail=(
                "The expected end time must include "
                "timezone information."
            ),
        )

    current_time = datetime.now(timezone.utc)

    if expected_end_at <= current_time:
        raise HTTPException(
            status_code=(
                status.HTTP_422_UNPROCESSABLE_ENTITY
            ),
            detail=(
                "The expected end time must be in "
                "the future."
            ),
        )

    return expected_end_at


def ensure_no_active_session(
    subject_id: str,
    device_record_id: str,
    db: Session,
) -> None:
    existing_session = (
        db.query(MobileTrackingSession)
        .filter(
            MobileTrackingSession.status.in_(
                [
                    "pending",
                    "active",
                ]
            ),
            or_(
                MobileTrackingSession.subject_id
                == subject_id,
                MobileTrackingSession.device_id
                == device_record_id,
            ),
        )
        .first()
    )

    if existing_session is not None:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=(
                "The selected subject or mobile device "
                "already has an active tracking session."
            ),
        )


@router.get(
    "/sessions",
    response_model=List[MobileSessionOut],
)
def list_mobile_sessions(
    session_status: str | None = Query(
        default=None,
        alias="status",
    ),
    subject_id: str | None = Query(
        default=None,
    ),
    device_id: str | None = Query(
        default=None,
    ),
    db: Session = Depends(get_db),
    current_operator: Operator = Depends(
        require_authenticated_operator
    ),
) -> Any:
    query = db.query(MobileTrackingSession)

    if current_operator.role == "investigator":
        assigned_case_ids = select(
            CaseFile.id
        ).where(
            CaseFile.assigned_operator_id
            == current_operator.id
        )

        query = query.filter(
            MobileTrackingSession.case_id.in_(
                assigned_case_ids
            )
        )

    if session_status is not None:
        clean_status = session_status.strip().lower()

        if clean_status not in VALID_SESSION_STATUSES:
            raise HTTPException(
                status_code=(
                    status.HTTP_422_UNPROCESSABLE_ENTITY
                ),
                detail="Invalid mobile session status.",
            )

        query = query.filter(
            MobileTrackingSession.status
            == clean_status
        )

    if subject_id is not None:
        query = query.filter(
            MobileTrackingSession.subject_id
            == subject_id.strip()
        )

    if device_id is not None:
        query = query.filter(
            MobileTrackingSession.device_id
            == device_id.strip()
        )

    return (
        query.order_by(
            MobileTrackingSession.created_at.desc()
        )
        .all()
    )


@router.get(
    "/sessions/{session_id}",
    response_model=MobileSessionOut,
)
def read_mobile_session(
    session_id: str,
    db: Session = Depends(get_db),
    current_operator: Operator = Depends(
        require_authenticated_operator
    ),
) -> Any:
    session = get_mobile_session_or_404(
        session_id,
        db,
    )

    ensure_session_read_access(
        session,
        current_operator,
        db,
    )

    return session


@router.post(
    "/sessions",
    response_model=MobileSessionOut,
    status_code=status.HTTP_201_CREATED,
)
def start_mobile_session(
    session_in: MobileSessionCreate,
    db: Session = Depends(get_db),
    current_operator: Operator = Depends(
        require_dispatch_operator
    ),
) -> Any:
    subject = get_mobile_subject_or_404(
        session_in.subject_id,
        db,
    )

    device = get_mobile_device_or_404(
        session_in.device_id,
        db,
    )

    if not subject.is_active:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=(
                "A tracking session cannot be started "
                "for a disabled subject."
            ),
        )

    if not device.is_active:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=(
                "A tracking session cannot be started "
                "with a disabled mobile device."
            ),
        )

    if device.subject_id != subject.id:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=(
                "The selected mobile device does not "
                "belong to the selected subject."
            ),
        )

    required_subject_type = {
        "guard_shift": "guard",
        "client_protection": "client",
    }[session_in.session_type]

    if subject.subject_type != required_subject_type:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=(
                "The session type does not match the "
                "selected tracking subject."
            ),
        )

    expected_end_at = validate_expected_end_time(
        session_in.expected_end_at
    )

    if session_in.session_type == "client_protection":
        if not session_in.consent_confirmed:
            raise HTTPException(
                status_code=(
                    status.HTTP_422_UNPROCESSABLE_ENTITY
                ),
                detail=(
                    "Client protection tracking requires "
                    "explicit consent."
                ),
            )

        if not session_in.consent_reference:
            raise HTTPException(
                status_code=(
                    status.HTTP_422_UNPROCESSABLE_ENTITY
                ),
                detail=(
                    "Client consent requires an auditable "
                    "consent reference."
                ),
            )

    if session_in.case_id is not None:
        case_file = get_case_or_404(
            session_in.case_id,
            db,
        )

        ensure_case_access(
            current_operator,
            case_file,
        )

        if case_file.status != "open":
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail=(
                    "Mobile tracking cannot be started "
                    "under a suspended or closed case."
                ),
            )

    ensure_no_active_session(
        subject.id,
        device.id,
        db,
    )

    current_time = datetime.now(timezone.utc)

    session = MobileTrackingSession(
        id=str(uuid.uuid4()),
        subject_id=subject.id,
        device_id=device.id,
        session_type=session_in.session_type,
        status="active",
        case_id=session_in.case_id,
        consent_given_at=(
            current_time
            if session_in.consent_confirmed
            else None
        ),
        consent_reference=(
            session_in.consent_reference
        ),
        started_at=current_time,
        expected_end_at=expected_end_at,
        started_by_operator_id=current_operator.id,
    )

    device.status = "online"

    db.add(session)
    db.commit()
    db.refresh(session)

    return session


@router.post(
    "/sessions/{session_id}/end",
    response_model=MobileSessionOut,
)
def end_mobile_session(
    session_id: str,
    end_in: MobileSessionEndRequest,
    db: Session = Depends(get_db),
    current_operator: Operator = Depends(
        require_dispatch_operator
    ),
) -> Any:
    session = get_mobile_session_or_404(
        session_id,
        db,
    )

    if session.status not in {
        "pending",
        "active",
    }:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=(
                "This mobile tracking session is no "
                "longer active."
            ),
        )

    current_time = datetime.now(timezone.utc)

    if end_in.consent_revoked:
        session.status = "revoked"
        session.consent_revoked_at = current_time
    else:
        session.status = "ended"

    session.ended_at = current_time
    session.ended_by_operator_id = (
        current_operator.id
    )

    device = get_mobile_device_or_404(
        session.device_id,
        db,
    )

    if device.is_active:
        device.status = "online"
    else:
        device.status = "disabled"

    db.commit()
    db.refresh(session)

    return session