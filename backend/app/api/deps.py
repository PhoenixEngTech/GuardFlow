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
from app.models.user import Operator


oauth2_scheme = OAuth2PasswordBearer(
    tokenUrl="/api/v1/auth/login/access-token"
)

visionflow_worker_header = APIKeyHeader(
    name="X-VisionFlow-Worker-Token",
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
    Authenticate the internal VisionFlow worker.

    The worker token must be supplied through:

    X-VisionFlow-Worker-Token: <private-token>
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
