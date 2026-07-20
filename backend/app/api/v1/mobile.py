from datetime import datetime, timezone
from typing import Any

from fastapi import (
    APIRouter,
    Depends,
    HTTPException,
    status,
)
from sqlalchemy.orm import Session

from app.api.deps import get_current_mobile_device
from app.core.database import get_db
from app.models.mobile_tracking import (
    MobileDevice,
    MobileLocationLog,
    MobileSOSAlert,
    MobileTrackingSession,
)
from app.schemas.mobile_tracking import (
    MobileDeviceOut,
    MobileLocationCreate,
    MobileLocationOut,
    MobileSOSCreate,
    MobileSOSOut,
)


router = APIRouter()


def get_authorised_active_session(
    session_id: str,
    current_device: MobileDevice,
    db: Session,
) -> MobileTrackingSession:
    """
    Return an active tracking session belonging to the
    authenticated mobile device.

    A phone cannot submit tracking information for
    another device or tracking subject.
    """

    session = (
        db.query(MobileTrackingSession)
        .filter(
            MobileTrackingSession.id == session_id,
            MobileTrackingSession.device_id
            == current_device.id,
            MobileTrackingSession.subject_id
            == current_device.subject_id,
        )
        .first()
    )

    if session is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=(
                "The tracking session was not found "
                "for this mobile device."
            ),
        )

    current_time = datetime.now(timezone.utc)

    if (
        session.status == "active"
        and session.expected_end_at is not None
        and session.expected_end_at <= current_time
    ):
        session.status = "expired"
        session.ended_at = current_time

        db.commit()

        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="The tracking session has expired.",
        )

    if session.status != "active":
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=(
                "Location services are permitted only "
                "during an active tracking session."
            ),
        )

    if (
        session.session_type == "client_protection"
        and session.consent_given_at is None
    ):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail=(
                "Client tracking cannot continue "
                "without recorded consent."
            ),
        )

    if session.consent_revoked_at is not None:
        session.status = "revoked"
        session.ended_at = current_time

        db.commit()

        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail=(
                "Tracking consent has been revoked "
                "for this session."
            ),
        )

    return session


def mark_mobile_device_online(
    current_device: MobileDevice,
) -> None:
    current_device.status = "online"
    current_device.last_seen_at = datetime.now(
        timezone.utc
    )


@router.post(
    "/heartbeat",
    response_model=MobileDeviceOut,
)
def receive_mobile_device_heartbeat(
    db: Session = Depends(get_db),
    current_device: MobileDevice = Depends(
        get_current_mobile_device
    ),
) -> Any:
    """
    Receive a secure heartbeat from an authenticated
    GuardFlow mobile companion application.
    """

    mark_mobile_device_online(current_device)

    db.commit()
    db.refresh(current_device)

    return current_device


@router.post(
    "/locations",
    response_model=MobileLocationOut,
    status_code=status.HTTP_201_CREATED,
)
def receive_mobile_location(
    location_in: MobileLocationCreate,
    db: Session = Depends(get_db),
    current_device: MobileDevice = Depends(
        get_current_mobile_device
    ),
) -> Any:
    """
    Receive GPS telemetry from an authenticated phone.

    Telemetry is accepted only while the phone has an
    authorised active tracking session.
    """

    session = get_authorised_active_session(
        location_in.session_id,
        current_device,
        db,
    )

    location = MobileLocationLog(
        session_id=session.id,
        subject_id=current_device.subject_id,
        device_id=current_device.id,
        latitude=location_in.latitude,
        longitude=location_in.longitude,
        accuracy_metres=(
            location_in.accuracy_metres
        ),
        altitude_metres=(
            location_in.altitude_metres
        ),
        speed_kmh=location_in.speed_kmh,
        heading_degrees=(
            location_in.heading_degrees
        ),
        battery_percentage=(
            location_in.battery_percentage
        ),
        recorded_at=location_in.recorded_at,
    )

    mark_mobile_device_online(current_device)

    db.add(location)
    db.commit()
    db.refresh(location)

    return location


@router.post(
    "/sos",
    response_model=MobileSOSOut,
    status_code=status.HTTP_201_CREATED,
)
def receive_mobile_sos(
    sos_in: MobileSOSCreate,
    db: Session = Depends(get_db),
    current_device: MobileDevice = Depends(
        get_current_mobile_device
    ),
) -> Any:
    """
    Receive an SOS alert from an authenticated mobile
    device during an authorised tracking session.
    """

    session = get_authorised_active_session(
        sos_in.session_id,
        current_device,
        db,
    )

    sos_alert = MobileSOSAlert(
        session_id=session.id,
        subject_id=current_device.subject_id,
        device_id=current_device.id,
        status="active",
        latitude=sos_in.latitude,
        longitude=sos_in.longitude,
        accuracy_metres=sos_in.accuracy_metres,
        message=sos_in.message,
        triggered_at=sos_in.triggered_at,
    )

    mark_mobile_device_online(current_device)

    db.add(sos_alert)
    db.commit()
    db.refresh(sos_alert)

    return sos_alert