import uuid
from datetime import datetime
from typing import Any, List

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app.api.deps import get_current_operator
from app.core.database import get_db
from app.core.permissions import (
    ensure_case_access,
    ensure_case_management,
)
from app.models.activity import CaseActivity
from app.models.case import CaseFile
from app.models.user import Operator
from app.schemas.activity import CaseActivityOut
from app.schemas.case import CaseCreate, CaseOut, CaseUpdate


router = APIRouter()


def get_case_or_404(
    case_id: str,
    db: Session,
) -> CaseFile:
    case_file = (
        db.query(CaseFile)
        .filter(CaseFile.id == case_id)
        .first()
    )

    if case_file is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Case file not found.",
        )

    return case_file


def validate_assigned_operator(
    operator_id: str | None,
    db: Session,
) -> None:
    if not operator_id:
        return

    operator = (
        db.query(Operator)
        .filter(Operator.id == operator_id)
        .first()
    )

    if operator is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Assigned operator profile not found.",
        )

    if not operator.is_active:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Cases cannot be assigned to an inactive operator.",
        )


@router.post(
    "/",
    response_model=CaseOut,
    status_code=status.HTTP_201_CREATED,
)
def create_case_file(
    case_in: CaseCreate,
    db: Session = Depends(get_db),
    current_operator: Operator = Depends(
        get_current_operator
    ),
) -> Any:
    ensure_case_management(current_operator)

    title = case_in.title.strip()

    if not title:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Case title cannot be empty.",
        )

    assigned_operator_id = (
        str(case_in.assigned_operator_id)
        if case_in.assigned_operator_id
        else None
    )

    validate_assigned_operator(
        assigned_operator_id,
        db,
    )

    description = (
        case_in.description.strip()
        if case_in.description
        and case_in.description.strip()
        else None
    )

    current_year = datetime.now().year

    case_count = (
        db.query(CaseFile)
        .filter(
            CaseFile.case_number.like(
                f"TPI-{current_year}-%"
            )
        )
        .count()
    )

    next_sequence = str(
        case_count + 1
    ).zfill(4)

    generated_case_number = (
        f"TPI-{current_year}-{next_sequence}"
    )

    new_case = CaseFile(
        id=str(uuid.uuid4()),
        case_number=generated_case_number,
        title=title,
        description=description,
        assigned_operator_id=assigned_operator_id,
        status="open",
    )

    creation_activity = CaseActivity(
        id=str(uuid.uuid4()),
        case_id=new_case.id,
        operator_id=current_operator.id,
        event_type="case_created",
        summary=(
            f"Case file {generated_case_number} "
            "was created."
        ),
        changes={
            "title": {
                "from": None,
                "to": title,
            },
            "description": {
                "from": None,
                "to": description,
            },
            "status": {
                "from": None,
                "to": "open",
            },
            "assigned_operator_id": {
                "from": None,
                "to": assigned_operator_id,
            },
        },
    )

    db.add(new_case)
    db.add(creation_activity)
    db.commit()
    db.refresh(new_case)

    return new_case


@router.get(
    "/",
    response_model=List[CaseOut],
)
def read_all_cases(
    db: Session = Depends(get_db),
    current_operator: Operator = Depends(
        get_current_operator
    ),
) -> Any:
    query = db.query(CaseFile)

    if current_operator.role == "investigator":
        query = query.filter(
            CaseFile.assigned_operator_id
            == current_operator.id
        )

    return (
        query
        .order_by(CaseFile.created_at.desc())
        .all()
    )


@router.get(
    "/{case_id}/activities",
    response_model=List[CaseActivityOut],
)
def read_case_activities(
    case_id: str,
    db: Session = Depends(get_db),
    current_operator: Operator = Depends(
        get_current_operator
    ),
) -> Any:
    case_file = get_case_or_404(
        case_id,
        db,
    )

    ensure_case_access(
        current_operator,
        case_file,
    )

    return (
        db.query(CaseActivity)
        .filter(
            CaseActivity.case_id == case_id
        )
        .order_by(
            CaseActivity.created_at.desc()
        )
        .all()
    )


@router.get(
    "/{case_id}",
    response_model=CaseOut,
)
def read_case_file(
    case_id: str,
    db: Session = Depends(get_db),
    current_operator: Operator = Depends(
        get_current_operator
    ),
) -> Any:
    case_file = get_case_or_404(
        case_id,
        db,
    )

    ensure_case_access(
        current_operator,
        case_file,
    )

    return case_file


@router.patch(
    "/{case_id}",
    response_model=CaseOut,
)
def update_case_file(
    case_id: str,
    case_in: CaseUpdate,
    db: Session = Depends(get_db),
    current_operator: Operator = Depends(
        get_current_operator
    ),
) -> Any:
    case_file = get_case_or_404(
        case_id,
        db,
    )

    ensure_case_access(
        current_operator,
        case_file,
    )

    update_data = case_in.model_dump(
        exclude_unset=True
    )

    if current_operator.role == "investigator":
        restricted_fields = (
            set(update_data.keys())
            - {
                "description",
                "status",
            }
        )

        if restricted_fields:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail=(
                    "Investigators may update only "
                    "the description and status of "
                    "assigned cases."
                ),
            )

        if (
            "status" in update_data
            and update_data["status"]
            not in {
                "active",
                "investigating",
                "resolved",
            }
        ):
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail=(
                    "Investigators may set assigned "
                    "cases only to active, "
                    "investigating or resolved."
                ),
            )

    else:
        ensure_case_management(
            current_operator
        )

    changes = {}

    if "title" in update_data:
        new_title = update_data["title"]

        if (
            new_title is None
            or not new_title.strip()
        ):
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail="Case title cannot be empty.",
            )

        new_title = new_title.strip()

        if new_title != case_file.title:
            changes["title"] = {
                "from": case_file.title,
                "to": new_title,
            }

            case_file.title = new_title

    if "description" in update_data:
        description_value = update_data[
            "description"
        ]

        new_description = (
            description_value.strip()
            if description_value
            and description_value.strip()
            else None
        )

        if (
            new_description
            != case_file.description
        ):
            changes["description"] = {
                "from": case_file.description,
                "to": new_description,
            }

            case_file.description = (
                new_description
            )

    if "status" in update_data:
        new_status = update_data["status"]

        if new_status != case_file.status:
            changes["status"] = {
                "from": case_file.status,
                "to": new_status,
            }

            case_file.status = new_status

    if "assigned_operator_id" in update_data:
        operator_value = update_data[
            "assigned_operator_id"
        ]

        new_operator_id = (
            str(operator_value)
            if operator_value
            else None
        )

        validate_assigned_operator(
            new_operator_id,
            db,
        )

        if (
            new_operator_id
            != case_file.assigned_operator_id
        ):
            changes[
                "assigned_operator_id"
            ] = {
                "from": (
                    case_file
                    .assigned_operator_id
                ),
                "to": new_operator_id,
            }

            case_file.assigned_operator_id = (
                new_operator_id
            )

    if changes:
        changed_fields = set(
            changes.keys()
        )

        if changed_fields == {"status"}:
            event_type = "status_changed"

            summary = (
                "Case status changed from "
                f"{changes['status']['from']} "
                "to "
                f"{changes['status']['to']}."
            )

        elif changed_fields == {
            "assigned_operator_id"
        }:
            event_type = (
                "operator_reassigned"
            )

            summary = (
                "Case operator assignment "
                "was changed."
            )

        else:
            event_type = "case_updated"

            summary = (
                "Case details updated: "
                + ", ".join(
                    sorted(changed_fields)
                )
                + "."
            )

        activity = CaseActivity(
            id=str(uuid.uuid4()),
            case_id=case_file.id,
            operator_id=current_operator.id,
            event_type=event_type,
            summary=summary,
            changes=changes,
        )

        db.add(activity)

    db.commit()
    db.refresh(case_file)

    return case_file
