from datetime import datetime, timezone
from typing import Any

from fastapi import (
    APIRouter,
    Depends,
    HTTPException,
    status,
)
from sqlalchemy.orm import Session

from app.api.deps import get_current_edge_gateway
from app.core.database import get_db
from app.models.camera import CameraSource
from app.models.edge_gateway import EdgeGateway
from app.schemas.edge_gateway import (
    EdgeCameraHealthReport,
    EdgeGatewayHeartbeat,
    EdgeGatewayOut,
)


router = APIRouter()


@router.post(
    "/heartbeat",
    response_model=EdgeGatewayOut,
)
def receive_edge_gateway_heartbeat(
    heartbeat: EdgeGatewayHeartbeat,
    db: Session = Depends(get_db),
    current_gateway: EdgeGateway = Depends(
        get_current_edge_gateway
    ),
) -> EdgeGateway:
    """
    Receive a secure heartbeat from an authenticated
    GuardFlow Edge Gateway.
    """

    if (
        heartbeat.gateway_id
        != current_gateway.gateway_id
    ):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail=(
                "The heartbeat gateway ID does not "
                "match the authenticated Edge Gateway."
            ),
        )

    current_gateway.status = "online"
    current_gateway.last_seen_at = datetime.now(
        timezone.utc
    )

    current_gateway.registered_camera_count = (
        heartbeat.registered_camera_count
    )

    current_gateway.online_camera_count = (
        heartbeat.online_camera_count
    )

    current_gateway.offline_camera_count = (
        heartbeat.offline_camera_count
    )

    db.commit()
    db.refresh(current_gateway)

    return current_gateway


@router.post(
    "/cameras/{camera_id}/health",
)
def receive_edge_camera_health(
    camera_id: str,
    health_report: EdgeCameraHealthReport,
    db: Session = Depends(get_db),
    current_gateway: EdgeGateway = Depends(
        get_current_edge_gateway
    ),
) -> Any:
    """
    Receive a camera-health report from an
    authenticated Edge Gateway.

    A gateway may report only cameras assigned
    to its own database record.
    """

    if health_report.camera_id != camera_id:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=(
                "The camera ID in the request body "
                "does not match the URL."
            ),
        )

    camera = (
        db.query(CameraSource)
        .filter(
            CameraSource.id == camera_id,
            CameraSource.edge_gateway_id
            == current_gateway.id,
        )
        .first()
    )

    if camera is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=(
                "The camera was not found or is not "
                "assigned to this Edge Gateway."
            ),
        )

    camera.status = health_report.status
    camera.last_seen_at = health_report.checked_at

    current_gateway.status = "online"
    current_gateway.last_seen_at = datetime.now(
        timezone.utc
    )

    db.commit()
    db.refresh(camera)

    return {
        "camera_id": camera.id,
        "status": camera.status,
        "checked_at": health_report.checked_at,
        "message": health_report.message,
        "response_time_ms": (
            health_report.response_time_ms
        ),
    }
