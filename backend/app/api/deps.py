import hashlib
import secrets

from fastapi import Depends, HTTPException, status
from fastapi.security import (
    APIKeyHeader,
    OAuth2PasswordBearer,
)
from jose import JWTError, jwt
from sqlalchemy.orm import Session

from app.core.config import settings
from app.core.database import get_db
from app.models.edge_gateway import EdgeGateway
from app.models.user import Operator


oauth2_scheme = OAuth2PasswordBearer(
    tokenUrl="/api/v1/auth/login/access-token"
)


visionflow_worker_header = APIKeyHeader(
    name="X-VisionFlow-Worker-Token",
    auto_error=False,
)


edge_gateway_id_header = APIKeyHeader(
    name="X-GuardFlow-Gateway-ID",
    auto_error=False,
)


edge_gateway_token_header = APIKeyHeader(
    name="X-GuardFlow-Edge-Token",
    auto_error=False,
)


def get_current_operator(
    token: str = Depends(oauth2_scheme),
    db: Session = Depends(get_db),
) -> Operator:
    """
    Decode an operator JWT and return the active
    authenticated GuardFlow operator.
    """

    credentials_error = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Could not validate operator credentials.",
        headers={
            "WWW-Authenticate": "Bearer",
        },
    )

    try:
        payload = jwt.decode(
            token,
            settings.SECRET_KEY,
            algorithms=[
                settings.ALGORITHM,
            ],
        )

        operator_id = payload.get("sub")

        if not operator_id:
            raise credentials_error

    except JWTError as exc:
        raise credentials_error from exc

    operator = (
        db.query(Operator)
        .filter(
            Operator.id == str(operator_id)
        )
        .first()
    )

    if operator is None:
        raise credentials_error

    if not operator.is_active:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Operator profile is deactivated.",
        )

    return operator


def get_visionflow_worker(
    worker_token: str | None = Depends(
        visionflow_worker_header
    ),
) -> str:
    """
    Authenticate the internal Railway VisionFlow worker.
    """

    if not worker_token:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="VisionFlow worker authentication is required.",
        )

    token_is_valid = secrets.compare_digest(
        worker_token,
        settings.VISIONFLOW_WORKER_TOKEN,
    )

    if not token_is_valid:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid VisionFlow worker credentials.",
        )

    return "visionflow-worker"


def hash_edge_gateway_token(
    plaintext_token: str,
) -> str:
    """
    Create the SHA-256 hash stored for an Edge Gateway token.

    Plaintext gateway tokens must never be stored in PostgreSQL.
    """

    return hashlib.sha256(
        plaintext_token.encode("utf-8")
    ).hexdigest()


def get_current_edge_gateway(
    gateway_id: str | None = Depends(
        edge_gateway_id_header
    ),
    gateway_token: str | None = Depends(
        edge_gateway_token_header
    ),
    db: Session = Depends(get_db),
) -> EdgeGateway:
    """
    Authenticate an Edge Gateway using its gateway ID
    and private token.

    Required headers:

    X-GuardFlow-Gateway-ID
    X-GuardFlow-Edge-Token
    """

    authentication_error = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Invalid Edge Gateway credentials.",
    )

    if not gateway_id or not gateway_token:
        raise authentication_error

    clean_gateway_id = gateway_id.strip()
    clean_gateway_token = gateway_token.strip()

    if not clean_gateway_id or not clean_gateway_token:
        raise authentication_error

    gateway = (
        db.query(EdgeGateway)
        .filter(
            EdgeGateway.gateway_id
            == clean_gateway_id
        )
        .first()
    )

    if gateway is None:
        raise authentication_error

    supplied_token_hash = hash_edge_gateway_token(
        clean_gateway_token
    )

    token_is_valid = secrets.compare_digest(
        supplied_token_hash,
        gateway.token_hash,
    )

    if not token_is_valid:
        raise authentication_error

    if not gateway.is_active:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="This Edge Gateway has been disabled.",
        )

    return gateway
