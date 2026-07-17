from typing import Any, Callable

from fastapi import Depends, HTTPException, status

from app.api.deps import get_current_operator
from app.models.user import Operator


VALID_ROLES = (
    "master",
    "admin",
    "dispatcher",
    "investigator",
)


ROLE_LEVELS = {
    "investigator": 1,
    "dispatcher": 2,
    "admin": 3,
    "master": 4,
}


def require_roles(
    *allowed_roles: str,
) -> Callable[..., Operator]:
    """
    Create a reusable FastAPI dependency that permits
    only the supplied GuardFlow roles.
    """

    invalid_roles = set(allowed_roles) - set(
        VALID_ROLES
    )

    if invalid_roles:
        raise ValueError(
            "Invalid GuardFlow roles supplied: "
            + ", ".join(sorted(invalid_roles))
        )

    def role_dependency(
        current_operator: Operator = Depends(
            get_current_operator
        ),
    ) -> Operator:
        if current_operator.role not in allowed_roles:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail=(
                    "Your GuardFlow authority level "
                    "does not permit this action."
                ),
            )

        return current_operator

    return role_dependency


require_master_operator = require_roles(
    "master",
)

require_management_operator = require_roles(
    "master",
    "admin",
)

require_dispatch_operator = require_roles(
    "master",
    "admin",
    "dispatcher",
)

require_authenticated_operator = require_roles(
    "master",
    "admin",
    "dispatcher",
    "investigator",
)


def ensure_case_access(
    current_operator: Operator,
    case_file: Any,
) -> None:
    """
    Master, admin and dispatcher roles may access
    every case.

    Investigators may access only cases assigned
    directly to their operator ID.
    """

    if current_operator.role in {
        "master",
        "admin",
        "dispatcher",
    }:
        return

    assigned_operator_id = getattr(
        case_file,
        "assigned_operator_id",
        None,
    )

    if (
        current_operator.role == "investigator"
        and assigned_operator_id
        == current_operator.id
    ):
        return

    raise HTTPException(
        status_code=status.HTTP_403_FORBIDDEN,
        detail=(
            "You are not assigned to this "
            "investigative case."
        ),
    )


def ensure_case_management(
    current_operator: Operator,
) -> None:
    """
    Only master, admin and dispatcher roles may
    create cases, change assignments or manage
    operational case settings.
    """

    if current_operator.role not in {
        "master",
        "admin",
        "dispatcher",
    }:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail=(
                "Case management requires master, "
                "administrator or dispatcher access."
            ),
        )


def ensure_role_level(
    current_operator: Operator,
    minimum_role: str,
) -> None:
    """
    Require an operator to have at least the supplied
    role level.
    """

    if minimum_role not in ROLE_LEVELS:
        raise ValueError(
            "Unknown GuardFlow role level."
        )

    current_level = ROLE_LEVELS.get(
        current_operator.role,
        0,
    )

    required_level = ROLE_LEVELS[
        minimum_role
    ]

    if current_level < required_level:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail=(
                f"This action requires at least "
                f"{minimum_role} authority."
            ),
        )
