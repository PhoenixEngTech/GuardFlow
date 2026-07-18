import secrets
import uuid
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

from app.api.deps import hash_edge_gateway_token
from app.core.database import get_db
from app.core.permissions import (
    require_management_operator,
)
from app.models.edge_gateway import EdgeGateway
from app.models.user import Operator
from app.schemas.edge_gateway import (
    EdgeGatewayCreate,
    EdgeGatewayOut,
    EdgeGatewayRegistrationResult,
    EdgeGatewayUpdate,
)


router = APIRouter()


def get_gateway_or_404(
    gateway_record_id: str,
    db: Session,
) -> EdgeGateway:
    gateway = (
        db.query(EdgeGateway)
        .filter(
            EdgeGateway.id == gateway_record_id
        )
        .first()
    )

    if gateway is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Edge Gateway record not found.",
        )

    return gateway


def ensure_unique_gateway_id(
    gateway_id: str,
    db: Session,
    exclude_record_id: str | None = None,
) -> None:
    query = (
        db.query(EdgeGateway)
        .filter(
            func.lower(
                EdgeGateway.gateway_id
            )
            == gateway_id.lower()
        )
    )

    if exclude_record_id:
        query = query.filter(
            EdgeGateway.id != exclude_record_id
        )

    if query.first() is not None:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=(
                "That Edge Gateway ID is already "
                "registered."
            ),
        )


def generate_edge_gateway_token() -> str:
    """
    Generate a high-entropy token.

    The plaintext value is returned once and only its
    SHA-256 hash is stored in PostgreSQL.
    """

    return secrets.token_urlsafe(48)


@router.get(
    "/",
    response_model=List[EdgeGatewayOut],
)
def list_edge_gateways(
    db: Session = Depends(get_db),
    current_operator: Operator = Depends(
        require_management_operator
    ),
) -> Any:
    return (
        db.query(EdgeGateway)
        .order_by(
            EdgeGateway.is_active.desc(),
            EdgeGateway.created_at.desc(),
        )
        .all()
    )


@router.get(
    "/{gateway_record_id}",
    response_model=EdgeGatewayOut,
)
def read_edge_gateway(
    gateway_record_id: str,
    db: Session = Depends(get_db),
    current_operator: Operator = Depends(
        require_management_operator
    ),
) -> Any:
    return get_gateway_or_404(
        gateway_record_id,
        db,
    )


@router.post(
    "/",
    response_model=EdgeGatewayRegistrationResult,
    status_code=status.HTTP_201_CREATED,
)
def register_edge_gateway(
    gateway_in: EdgeGatewayCreate,
    db: Session = Depends(get_db),
    current_operator: Operator = Depends(
        require_management_operator
    ),
) -> Any:
    clean_gateway_id = gateway_in.gateway_id.strip()

    ensure_unique_gateway_id(
        clean_gateway_id,
        db,
    )

    plaintext_token = (
        generate_edge_gateway_token()
    )

    gateway = EdgeGateway(
        id=str(uuid.uuid4()),
        gateway_id=clean_gateway_id,
        name=gateway_in.name.strip(),
        site_name=gateway_in.site_name,
        customer_name=gateway_in.customer_name,
        token_hash=hash_edge_gateway_token(
            plaintext_token
        ),
        status=(
            "pending"
            if gateway_in.is_active
            else "disabled"
        ),
        is_active=gateway_in.is_active,
        registered_camera_count=0,
        online_camera_count=0,
        offline_camera_count=0,
        created_by_operator_id=(
            current_operator.id
        ),
    )

    try:
        db.add(gateway)
        db.commit()
        db.refresh(gateway)

    except IntegrityError as exc:
        db.rollback()

        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=(
                "The Edge Gateway could not be "
                "registered because its ID already "
                "exists."
            ),
        ) from exc

    gateway_response = (
        EdgeGatewayOut.model_validate(
            gateway
        ).model_dump()
    )

    return EdgeGatewayRegistrationResult(
        **gateway_response,
        edge_gateway_token=plaintext_token,
    )


@router.patch(
    "/{gateway_record_id}",
    response_model=EdgeGatewayOut,
)
def update_edge_gateway(
    gateway_record_id: str,
    gateway_in: EdgeGatewayUpdate,
    db: Session = Depends(get_db),
    current_operator: Operator = Depends(
        require_management_operator
    ),
) -> Any:
    gateway = get_gateway_or_404(
        gateway_record_id,
        db,
    )

    update_data = gateway_in.model_dump(
        exclude_unset=True
    )

    editable_fields = {
        "name",
        "site_name",
        "customer_name",
    }

    for field_name in editable_fields:
        if field_name in update_data:
            setattr(
                gateway,
                field_name,
                update_data[field_name],
            )

    if "is_active" in update_data:
        gateway.is_active = update_data[
            "is_active"
        ]

        if gateway.is_active:
            if gateway.status == "disabled":
                gateway.status = "pending"
        else:
            gateway.status = "disabled"

    db.commit()
    db.refresh(gateway)

    return gateway


@router.post(
    "/{gateway_record_id}/rotate-token",
    response_model=EdgeGatewayRegistrationResult,
)
def rotate_edge_gateway_token(
    gateway_record_id: str,
    db: Session = Depends(get_db),
    current_operator: Operator = Depends(
        require_management_operator
    ),
) -> Any:
    """
    Rotate the gateway token deliberately.

    The previous token becomes invalid immediately.
    The replacement plaintext token is returned once.
    """

    gateway = get_gateway_or_404(
        gateway_record_id,
        db,
    )

    plaintext_token = (
        generate_edge_gateway_token()
    )

    gateway.token_hash = (
        hash_edge_gateway_token(
            plaintext_token
        )
    )

    if gateway.is_active:
        gateway.status = "pending"
    else:
        gateway.status = "disabled"

    db.commit()
    db.refresh(gateway)

    gateway_response = (
        EdgeGatewayOut.model_validate(
            gateway
        ).model_dump()
    )

    return EdgeGatewayRegistrationResult(
        **gateway_response,
        edge_gateway_token=plaintext_token,
    )
