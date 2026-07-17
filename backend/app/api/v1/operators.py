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


ROLE_LEVELS = {
    "investigator": 1,
    "dispatcher": 2,
    "admin": 3,
    "master": 4,
}


def require_management_access(
    current_operator: Operator,
) -> None:
    if current_operator.role not in {
        "master",
        "admin",
    }:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail=(
                "Administrator or master access "
                "is required."
            ),
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


def active_master_count(
    db: Session,
) -> int:
    return (
        db.query(Operator)
        .filter(
            Operator.role == "master",
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
            detail=(
                "That username is already "
                "registered."
            ),
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
            detail=(
                "That email address is already "
                "registered."
            ),
        )


def ensure_actor_can_manage_target(
    current_operator: Operator,
    target_operator: Operator,
) -> None:
    """
    Masters can manage every operator.

    Administrators can manage only dispatchers
    and investigators.
    """

    if current_operator.role == "master":
        return

    if target_operator.role in {
        "master",
        "admin",
    }:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail=(
                "Administrators cannot manage "
                "master or administrator profiles."
            ),
        )


def ensure_role_can_be_assigned(
    current_operator: Operator,
    requested_role: str,
) -> None:
    """
    Only a master may create or assign the
    master and administrator roles.
    """

    if current_operator.role == "master":
        return

    if requested_role in {
        "master",
        "admin",
    }:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail=(
                "Only a master operator may assign "
                "administrator or master authority."
            ),
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
    require_management_access(
        current_operator
    )

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
    require_management_access(
        current_operator
    )

    operator = get_operator_or_404(
        operator_id,
        db,
    )

    ensure_actor_can_manage_target(
        current_operator,
        operator,
    )

    return operator


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
    require_management_access(
        current_operator
    )

    ensure_role_can_be_assigned(
        current_operator,
        operator_in.role,
    )

    username = operator_in.username.strip()
    email = (
        str(operator_in.email)
        .strip()
        .lower()
    )

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
        password_hash=(
            security.get_password_hash(
                operator_in.password
            )
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
    require_management_access(
        current_operator
    )

    operator = get_operator_or_404(
        operator_id,
        db,
    )

    ensure_actor_can_manage_target(
        current_operator,
        operator,
    )

    update_data = operator_in.model_dump(
        exclude_unset=True
    )

    requested_role = update_data.get(
        "role",
        operator.role,
    )

    requested_active = update_data.get(
        "is_active",
        operator.is_active,
    )

    ensure_role_can_be_assigned(
        current_operator,
        requested_role,
    )

    if operator.id == current_operator.id:
        if (
            "role" in update_data
            and requested_role
            != current_operator.role
        ):
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail=(
                    "You cannot change your own "
                    "authority level."
                ),
            )

        if (
            "is_active" in update_data
            and requested_active is False
        ):
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail=(
                    "You cannot deactivate your own "
                    "operator profile."
                ),
            )

    removing_active_master = (
        operator.role == "master"
        and operator.is_active
        and (
            requested_role != "master"
            or requested_active is False
        )
    )

    if (
        removing_active_master
        and active_master_count(db) <= 1
    ):
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=(
                "GuardFlow must retain at least one "
                "active master operator."
            ),
        )

    if "username" in update_data:
        username = (
            update_data["username"]
            .strip()
        )

        ensure_unique_username(
            username,
            db,
            exclude_operator_id=operator.id,
        )

        operator.username = username

    if "email" in update_data:
        email = (
            str(update_data["email"])
            .strip()
            .lower()
        )

        ensure_unique_email(
            email,
            db,
            exclude_operator_id=operator.id,
        )

        operator.email = email

    if "role" in update_data:
        operator.role = requested_role

    if "is_active" in update_data:
        operator.is_active = (
            requested_active
        )

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
    require_management_access(
        current_operator
    )

    operator = get_operator_or_404(
        operator_id,
        db,
    )

    ensure_actor_can_manage_target(
        current_operator,
        operator,
    )

    operator.password_hash = (
        security.get_password_hash(
            password_in.new_password
        )
    )

    db.commit()
    db.refresh(operator)

    return operator
