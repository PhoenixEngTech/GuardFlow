from datetime import datetime, timezone

from fastapi import (
    APIRouter,
    Depends,
    HTTPException,
    status,
)
from sqlalchemy.orm import Session

from app.api.deps import get_current_edge_gateway
from app.core.database import get_db
from app.models.edge_gateway import EdgeGateway
from app.schemas.edge_gateway import (
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

    The gateway identity supplied in the request body
    must match the identity authenticated by the
    private request headers.
    """

    if heartbeat.gateway_id != current_gateway.gateway_id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail=(
                "The heartbeat gateway ID does not match "
                "the authenticated Edge Gateway."
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
