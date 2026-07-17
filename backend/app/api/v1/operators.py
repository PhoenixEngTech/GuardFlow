import uuid
from typing import Any, List

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import func
from sqlalchemy.orm import Session

from app.api.deps import get_current_operator
from app.core import security
from app.core.database import get_db
from app.models.user import Operator
from app.schemas.user import (
    PasswordReset,
    UserCreate,
    UserOut,
    UserUpdate,
)


router = APIRouter()


def require_admin(
    current_operator: Operator,
) -> None:
    if current_operator.role != "admin":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Administrator access is required.",
        )


def get_operator_or_404(
    operator_id: str,
    db: Session,
) -> Operator:
    operator = (
        db.query(Operator)
        .filter(Operator.id == operator_id)
        .first()
    )

    if operator is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Operator profile not found.",
        )

    return operator


def active_admin_count(
    db: Session,
) -> int:
    return (
        db.query(Operator)
        .filter(
            Operator.role == "admin",
            Operator.is_active.is_(True),
        )
        .count()
    )


def ensure_unique_username(
    username: str,
    db: Session,
    exclude_operator_id: str | None = None,
) -> None:
    query = db.query(Operator).filter(
        func.lower(Operator.username)
        == username.lower()
    )

    if exclude_operator_id:
        query = query.filter(
            Operator.id != exclude_operator_id
        )

    if query.first():
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="That username is already registered.",
        )


def ensure_unique_email(
    email: str,
    db: Session,
    exclude_operator_id: str | None = None,
) -> None:
    query = db.query(Operator).filter(
        func.lower(Operator.email)
        == email.lower()
    )

    if exclude_operator_id:
        query = query.filter(
            Operator.id != exclude_operator_id
        )

    if query.first():
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="That email address is already registered.",
        )


@router.get(
    "/",
    response_model=List[UserOut],
)
def list_operators(
    db: Session = Depends(get_db),
    current_operator: Operator = Depends(
        get_current_operator
    ),
) -> Any:
    require_admin(current_operator)

    return (
        db.query(Operator)
        .order_by(
            Operator.is_active.desc(),
            Operator.created_at.desc(),
        )
        .all()
    )


@router.get(
    "/{operator_id}",
    response_model=UserOut,
)
def read_operator(
    operator_id: str,
    db: Session = Depends(get_db),
    current_operator: Operator = Depends(
        get_current_operator
    ),
) -> Any:
    require_admin(current_operator)

    return get_operator_or_404(
        operator_id,
        db,
    )


@router.post(
    "/",
    response_model=UserOut,
    status_code=status.HTTP_201_CREATED,
)
def create_operator(
    operator_in: UserCreate,
    db: Session = Depends(get_db),
    current_operator: Operator = Depends(
        get_current_operator
    ),
) -> Any:
    require_admin(current_operator)

    username = operator_in.username.strip()
    email = str(operator_in.email).strip().lower()

    ensure_unique_username(
        username,
        db,
    )

    ensure_unique_email(
        email,
        db,
    )

    new_operator = Operator(
        id=str(uuid.uuid4()),
        username=username,
        email=email,
        password_hash=security.get_password_hash(
            operator_in.password
        ),
        role=operator_in.role,
        is_active=operator_in.is_active,
    )

    db.add(new_operator)
    db.commit()
    db.refresh(new_operator)

    return new_operator


@router.patch(
    "/{operator_id}",
    response_model=UserOut,
)
def update_operator(
    operator_id: str,
    operator_in: UserUpdate,
    db: Session = Depends(get_db),
    current_operator: Operator = Depends(
        get_current_operator
    ),
) -> Any:
    require_admin(current_operator)

    operator = get_operator_or_404(
        operator_id,
        db,
    )

    update_data = operator_in.model_dump(
        exclude_unset=True
    )

    if "username" in update_data:
        username = update_data["username"].strip()

        ensure_unique_username(
            username,
            db,
            exclude_operator_id=operator.id,
        )

        operator.username = username

    if "email" in update_data:
        email = str(
            update_data["email"]
        ).strip().lower()

        ensure_unique_email(
            email,
            db,
            exclude_operator_id=operator.id,
        )

        operator.email = email

    requested_role = update_data.get(
        "role",
        operator.role,
    )

    requested_active = update_data.get(
        "is_active",
        operator.is_active,
    )

    removing_active_admin = (
        operator.role == "admin"
        and operator.is_active
        and (
            requested_role != "admin"
            or requested_active is False
        )
    )

    if (
        removing_active_admin
        and active_admin_count(db) <= 1
    ):
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=(
                "GuardFlow must retain at least one "
                "active administrator."
            ),
        )

    if (
        operator.id == current_operator.id
        and requested_active is False
    ):
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=(
                "You cannot deactivate your own "
                "operator profile."
            ),
        )

    if "role" in update_data:
        operator.role = update_data["role"]

    if "is_active" in update_data:
        operator.is_active = update_data[
            "is_active"
        ]

    db.commit()
    db.refresh(operator)

    return operator


@router.post(
    "/{operator_id}/reset-password",
    response_model=UserOut,
)
def reset_operator_password(
    operator_id: str,
    password_in: PasswordReset,
    db: Session = Depends(get_db),
    current_operator: Operator = Depends(
        get_current_operator
    ),
) -> Any:
    require_admin(current_operator)

    operator = get_operator_or_404(
        operator_id,
        db,
    )

    operator.password_hash = (
        security.get_password_hash(
            password_in.new_password
        )
    )

    db.commit()
    db.refresh(operator)

    return operator
