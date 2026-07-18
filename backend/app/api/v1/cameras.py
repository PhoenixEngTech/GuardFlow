from datetime import datetime, timezone
from typing import Any, List

from fastapi import (
    APIRouter,
    Depends,
    HTTPException,
    status,
)
from sqlalchemy import func, or_
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.core.permissions import (
    require_management_operator,
)
from app.models.camera import CameraSource
from app.models.edge_gateway import EdgeGateway
from app.models.user import Operator
from app.schemas.camera import (
    CameraCreate,
    CameraHealthUpdate,
    CameraOut,
    CameraUpdate,
)


router = APIRouter()


def get_camera_or_404(
    camera_id: str,
    db: Session,
) -> CameraSource:
    camera = (
        db.query(CameraSource)
        .filter(
            CameraSource.id == camera_id
        )
        .first()
    )

    if camera is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Camera source not found.",
        )

    return camera


def resolve_edge_gateway_id(
    edge_gateway_reference: str | None,
    db: Session,
) -> str | None:
    """
    Resolve an Edge Gateway reference to its internal
    database record ID.

    The request may provide either:

    - The internal EdgeGateway.id value.
    - The readable gateway ID, such as GF-EDGE-001.

    Only active gateways may receive camera
    assignments.
    """

    if edge_gateway_reference is None:
        return None

    clean_reference = (
        edge_gateway_reference.strip()
    )

    if not clean_reference:
        return None

    gateway = (
        db.query(EdgeGateway)
        .filter(
            or_(
                EdgeGateway.id
                == clean_reference,
                func.lower(
                    EdgeGateway.gateway_id
                )
                == clean_reference.lower(),
            )
        )
        .first()
    )

    if gateway is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=(
                "The selected Edge Gateway "
                "does not exist."
            ),
        )

    if not gateway.is_active:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=(
                "The selected Edge Gateway "
                "is disabled."
            ),
        )

    return gateway.id


def ensure_unique_serial_number(
    serial_number: str | None,
    db: Session,
    exclude_camera_id: str | None = None,
) -> None:
    if not serial_number:
        return

    query = (
        db.query(CameraSource)
        .filter(
            func.lower(
                CameraSource.serial_number
            )
            == serial_number.lower()
        )
    )

    if exclude_camera_id:
        query = query.filter(
            CameraSource.id
            != exclude_camera_id
        )

    if query.first():
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=(
                "That camera serial number is "
                "already registered."
            ),
        )


def ensure_unique_connection(
    host: str,
    port: int,
    stream_path: str | None,
    db: Session,
    exclude_camera_id: str | None = None,
) -> None:
    normalised_path = stream_path or ""

    query = (
        db.query(CameraSource)
        .filter(
            func.lower(
                CameraSource.host
            )
            == host.lower(),
            CameraSource.port == port,
            func.coalesce(
                CameraSource.stream_path,
                "",
            )
            == normalised_path,
        )
    )

    if exclude_camera_id:
        query = query.filter(
            CameraSource.id
            != exclude_camera_id
        )

    if query.first():
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=(
                "A camera using this host, port "
                "and stream path is already "
                "registered."
            ),
        )


@router.get(
    "/",
    response_model=List[CameraOut],
)
def list_camera_sources(
    db: Session = Depends(get_db),
    current_operator: Operator = Depends(
        require_management_operator
    ),
) -> Any:
    """
    Return all registered camera sources.

    Camera connection settings are visible only to
    master and administrator operators.
    """

    return (
        db.query(CameraSource)
        .order_by(
            CameraSource.is_active.desc(),
            CameraSource.name.asc(),
        )
        .all()
    )


@router.get(
    "/{camera_id}",
    response_model=CameraOut,
)
def read_camera_source(
    camera_id: str,
    db: Session = Depends(get_db),
    current_operator: Operator = Depends(
        require_management_operator
    ),
) -> Any:
    return get_camera_or_404(
        camera_id,
        db,
    )


@router.post(
    "/",
    response_model=CameraOut,
    status_code=status.HTTP_201_CREATED,
)
def create_camera_source(
    camera_in: CameraCreate,
    db: Session = Depends(get_db),
    current_operator: Operator = Depends(
        require_management_operator
    ),
) -> Any:
    ensure_unique_serial_number(
        camera_in.serial_number,
        db,
    )

    ensure_unique_connection(
        camera_in.host,
        camera_in.port,
        camera_in.stream_path,
        db,
    )

    resolved_edge_gateway_id = (
        resolve_edge_gateway_id(
            camera_in.edge_gateway_id,
            db,
        )
    )

    initial_status = (
        "pending"
        if camera_in.is_active
        else "disabled"
    )

    camera = CameraSource(
        name=camera_in.name,
        manufacturer=(
            camera_in.manufacturer
        ),
        model=camera_in.model,
        serial_number=(
            camera_in.serial_number
        ),
        location_name=(
            camera_in.location_name
        ),
        latitude=camera_in.latitude,
        longitude=camera_in.longitude,
        connection_type=(
            camera_in.connection_type
        ),
        host=camera_in.host,
        port=camera_in.port,
        stream_path=(
            camera_in.stream_path
        ),
        credential_reference=(
            camera_in.credential_reference
        ),
        gateway_stream_url=(
            camera_in.gateway_stream_url
        ),
        edge_gateway_id=(
            resolved_edge_gateway_id
        ),
        status=initial_status,
        is_active=camera_in.is_active,
        created_by_operator_id=(
            current_operator.id
        ),
    )

    try:
        db.add(camera)
        db.commit()
        db.refresh(camera)

    except IntegrityError as exc:
        db.rollback()

        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=(
                "The camera could not be "
                "registered because a unique "
                "value already exists."
            ),
        ) from exc

    return camera


@router.patch(
    "/{camera_id}",
    response_model=CameraOut,
)
def update_camera_source(
    camera_id: str,
    camera_in: CameraUpdate,
    db: Session = Depends(get_db),
    current_operator: Operator = Depends(
        require_management_operator
    ),
) -> Any:
    camera = get_camera_or_404(
        camera_id,
        db,
    )

    update_data = camera_in.model_dump(
        exclude_unset=True
    )

    requested_serial_number = (
        update_data.get(
            "serial_number",
            camera.serial_number,
        )
    )

    requested_host = update_data.get(
        "host",
        camera.host,
    )

    requested_port = update_data.get(
        "port",
        camera.port,
    )

    requested_stream_path = (
        update_data.get(
            "stream_path",
            camera.stream_path,
        )
    )

    ensure_unique_serial_number(
        requested_serial_number,
        db,
        exclude_camera_id=camera.id,
    )

    ensure_unique_connection(
        requested_host,
        requested_port,
        requested_stream_path,
        db,
        exclude_camera_id=camera.id,
    )

    gateway_assignment_changed = False

    if "edge_gateway_id" in update_data:
        resolved_edge_gateway_id = (
            resolve_edge_gateway_id(
                update_data[
                    "edge_gateway_id"
                ],
                db,
            )
        )

        gateway_assignment_changed = (
            resolved_edge_gateway_id
            != camera.edge_gateway_id
        )

        update_data[
            "edge_gateway_id"
        ] = resolved_edge_gateway_id

    editable_fields = {
        "name",
        "manufacturer",
        "model",
        "serial_number",
        "location_name",
        "latitude",
        "longitude",
        "connection_type",
        "host",
        "port",
        "stream_path",
        "credential_reference",
        "gateway_stream_url",
        "edge_gateway_id",
    }

    for field_name in editable_fields:
        if field_name in update_data:
            setattr(
                camera,
                field_name,
                update_data[field_name],
            )

    if "is_active" in update_data:
        camera.is_active = update_data[
            "is_active"
        ]

        if camera.is_active:
            if camera.status == "disabled":
                camera.status = "pending"
        else:
            camera.status = "disabled"
            camera.last_seen_at = None

    if (
        gateway_assignment_changed
        and camera.is_active
    ):
        camera.status = "pending"
        camera.last_seen_at = None

    try:
        db.commit()
        db.refresh(camera)

    except IntegrityError as exc:
        db.rollback()

        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=(
                "The camera update conflicts "
                "with another registered source."
            ),
        ) from exc

    return camera


@router.post(
    "/{camera_id}/health",
    response_model=CameraOut,
)
def update_camera_health(
    camera_id: str,
    health_in: CameraHealthUpdate,
    db: Session = Depends(get_db),
    current_operator: Operator = Depends(
        require_management_operator
    ),
) -> Any:
    """
    Authenticated management health endpoint.

    Edge Gateways report automatically through the
    protected internal Edge Gateway endpoint.
    """

    camera = get_camera_or_404(
        camera_id,
        db,
    )

    if not camera.is_active:
        camera.status = "disabled"
        camera.last_seen_at = None

    else:
        camera.status = health_in.status

        if health_in.last_seen_at:
            camera.last_seen_at = (
                health_in.last_seen_at
            )

        elif health_in.status == "online":
            camera.last_seen_at = (
                datetime.now(timezone.utc)
            )

    db.commit()
    db.refresh(camera)

    return camera
