from fastapi import Depends, HTTPException, status
from fastapi.security import OAuth2PasswordBearer
from jose import JWTError, jwt
from sqlalchemy.orm import Session

from app.core.config import settings
from app.core.database import get_db
from app.models.user import Operator


oauth2_scheme = OAuth2PasswordBearer(
    tokenUrl="/api/v1/auth/login/access-token"
)


def get_current_operator(
    token: str = Depends(oauth2_scheme),
    db: Session = Depends(get_db),
) -> Operator:
    """
    Decode the access token and return the authenticated operator.
    """

    credentials_error = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Could not validate operator credentials.",
        headers={"WWW-Authenticate": "Bearer"},
    )

    try:
        payload = jwt.decode(
            token,
            settings.SECRET_KEY,
            algorithms=[settings.ALGORITHM],
        )

        operator_id = payload.get("sub")

        if not operator_id:
            raise credentials_error

    except JWTError:
        raise credentials_error

    operator = (
        db.query(Operator)
        .filter(Operator.id == str(operator_id))
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
