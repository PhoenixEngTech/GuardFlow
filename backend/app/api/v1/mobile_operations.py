from datetime import datetime, timezone
from typing import Any, List

from fastapi import (
    APIRouter,
    Depends,
    HTTPException,
    Query,
    status,
)
from sqlalchemy import select
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
    MobileLocationLog,
    MobileSOSAlert,
    MobileTrackingSession,
    MobileTrackingSubject,
)
from app.models.user import Operator
from app.schemas.mobile_tracking import (
    MobileLiveSubjectOut,
    MobileLocationOut,
    MobileSOSAction,
    MobileSOSOut,
    MobileSessionOut,
    MobileSubjectOut,
)


router = APIRouter()


VALID_SOS_STATUSES = {
    "active",
    "acknowledged",
    "resolved",
    "cancelled",
}


def get_mobile_sos_or_404(
    alert_id: str,
    db: Session,
    lock_record: bool = False,
) -> MobileSOSAlert:
    query = (
        db.query(MobileSOSAlert)
        .filter(
            MobileSOSAlert.id == alert_id
        )
    )

    if lock_record:
        query = query.with_for_update()

    alert = query.first()

    if alert is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Mobile SOS alert not found.",
        )

    return alert


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


def ensure_session_read_access(
    session: MobileTrackingSession,
    current_operator: Operator,
    db: Session,
) -> None:
    """
    Master, admin and dispatcher roles may read every
    operational mobile-tracking record.

    Investigators may read only records connected to
    cases assigned directly to them.
    """

    if current_operator.role != "investigator":
        return

    if session.case_id is None:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail=(
                "Investigators may access only mobile "
                "tracking linked to their assigned cases."
            ),
        )

    case_file = (
        db.query(CaseFile)
        .filter(
            CaseFile.id == session.case_id
        )
        .first()
    )

    if case_file is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="The linked case file was not found.",
        )

    ensure_case_access(
        current_operator,
        case_file,
    )


def expire_overdue_mobile_sessions(
    db: Session,
) -> None:
    """
    Close active sessions whose authorised tracking
    period has passed.
    """

    current_time = datetime.now(timezone.utc)

    overdue_sessions = (
        db.query(MobileTrackingSession)
        .filter(
            MobileTrackingSession.status == "active",
            MobileTrackingSession.expected_end_at.isnot(
                None
            ),
            MobileTrackingSession.expected_end_at
            <= current_time,
        )
        .all()
    )

    if not overdue_sessions:
        return

    for session in overdue_sessions:
        session.status = "expired"
        session.ended_at = current_time

    db.commit()


@router.get(
    "/live",
    response_model=List[MobileLiveSubjectOut],
)
def list_live_mobile_subjects(
    db: Session = Depends(get_db),
    current_operator: Operator = Depends(
        require_authenticated_operator
    ),
) -> Any:
    """
    Return authorised active mobile-tracking sessions
    with each subject's latest available GPS position.
    """

    expire_overdue_mobile_sessions(db)

    query = db.query(MobileTrackingSession).filter(
        MobileTrackingSession.status == "active"
    )

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

    sessions = (
        query.order_by(
            MobileTrackingSession.started_at.desc()
        )
        .all()
    )

    live_subjects = []

    for session in sessions:
        subject = (
            db.query(MobileTrackingSubject)
            .filter(
                MobileTrackingSubject.id
                == session.subject_id
            )
            .first()
        )

        device = (
            db.query(MobileDevice)
            .filter(
                MobileDevice.id
                == session.device_id
            )
            .first()
        )

        if subject is None or device is None:
            continue

        latest_location = (
            db.query(MobileLocationLog)
            .filter(
                MobileLocationLog.session_id
                == session.id
            )
            .order_by(
                MobileLocationLog.recorded_at.desc(),
                MobileLocationLog.id.desc(),
            )
            .first()
        )

        live_subjects.append(
            MobileLiveSubjectOut(
                subject=(
                    MobileSubjectOut.model_validate(
                        subject
                    )
                ),
                session=(
                    MobileSessionOut.model_validate(
                        session
                    )
                ),
                latest_location=(
                    MobileLocationOut.model_validate(
                        latest_location
                    )
                    if latest_location is not None
                    else None
                ),
                device_status=device.status,
            )
        )

    return live_subjects


@router.get(
    "/sos",
    response_model=List[MobileSOSOut],
)
def list_mobile_sos_alerts(
    alert_status: str | None = Query(
        default=None,
        alias="status",
    ),
    open_only: bool = Query(
        default=True,
    ),
    session_id: str | None = Query(
        default=None,
    ),
    limit: int = Query(
        default=100,
        ge=1,
        le=500,
    ),
    db: Session = Depends(get_db),
    current_operator: Operator = Depends(
        require_authenticated_operator
    ),
) -> Any:
    """
    Return mobile SOS alerts visible to the current
    GuardFlow operator.

    By default, only active and acknowledged alerts are
    returned.
    """

    query = (
        db.query(MobileSOSAlert)
        .join(
            MobileTrackingSession,
            MobileTrackingSession.id
            == MobileSOSAlert.session_id,
        )
    )

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

    if alert_status is not None:
        clean_status = alert_status.strip().lower()

        if clean_status not in VALID_SOS_STATUSES:
            raise HTTPException(
                status_code=(
                    status.HTTP_422_UNPROCESSABLE_ENTITY
                ),
                detail="Invalid mobile SOS status.",
            )

        query = query.filter(
            MobileSOSAlert.status == clean_status
        )

    elif open_only:
        query = query.filter(
            MobileSOSAlert.status.in_(
                [
                    "active",
                    "acknowledged",
                ]
            )
        )

    if session_id is not None:
        query = query.filter(
            MobileSOSAlert.session_id
            == session_id.strip()
        )

    return (
        query.order_by(
            MobileSOSAlert.triggered_at.desc()
        )
        .limit(limit)
        .all()
    )


@router.get(
    "/sos/{alert_id}",
    response_model=MobileSOSOut,
)
def read_mobile_sos_alert(
    alert_id: str,
    db: Session = Depends(get_db),
    current_operator: Operator = Depends(
        require_authenticated_operator
    ),
) -> Any:
    alert = get_mobile_sos_or_404(
        alert_id,
        db,
    )

    session = get_mobile_session_or_404(
        alert.session_id,
        db,
    )

    ensure_session_read_access(
        session,
        current_operator,
        db,
    )

    return alert


@router.post(
    "/sos/{alert_id}/action",
    response_model=MobileSOSOut,
)
def action_mobile_sos_alert(
    alert_id: str,
    action_in: MobileSOSAction,
    db: Session = Depends(get_db),
    current_operator: Operator = Depends(
        require_dispatch_operator
    ),
) -> Any:
    """
    Acknowledge, resolve or cancel an SOS alert.

    Master, administrator and dispatcher roles may
    perform SOS command-centre actions.
    """

    alert = get_mobile_sos_or_404(
        alert_id,
        db,
        lock_record=True,
    )

    current_time = datetime.now(timezone.utc)

    if action_in.action == "acknowledge":
        if alert.status != "active":
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail=(
                    "Only an active SOS alert can be "
                    "acknowledged."
                ),
            )

        alert.status = "acknowledged"
        alert.acknowledged_at = current_time
        alert.acknowledged_by_operator_id = (
            current_operator.id
        )

    elif action_in.action == "resolve":
        if alert.status not in {
            "active",
            "acknowledged",
        }:
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail=(
                    "This SOS alert is already closed."
                ),
            )

        alert.status = "resolved"
        alert.resolved_at = current_time
        alert.resolved_by_operator_id = (
            current_operator.id
        )

    elif action_in.action == "cancel":
        if alert.status not in {
            "active",
            "acknowledged",
        }:
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail=(
                    "This SOS alert is already closed."
                ),
            )

        alert.status = "cancelled"

        # The existing resolved fields provide the
        # terminal closure audit record for cancellation.
        alert.resolved_at = current_time
        alert.resolved_by_operator_id = (
            current_operator.id
        )

    db.commit()
    db.refresh(alert)

    return alert