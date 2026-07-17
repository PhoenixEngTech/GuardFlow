import uuid
from datetime import datetime
from typing import Any, List

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.models.case import CaseFile
from app.schemas.case import CaseCreate, CaseOut, CaseUpdate


router = APIRouter()


@router.post(
    "/",
    response_model=CaseOut,
    status_code=status.HTTP_201_CREATED,
)
def create_case_file(
    case_in: CaseCreate,
    db: Session = Depends(get_db),
) -> Any:
    """
    Create a new investigative case file.
    """

    title = case_in.title.strip()

    if not title:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Case title cannot be empty.",
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

    next_sequence = str(case_count + 1).zfill(4)
    generated_case_number = (
        f"TPI-{current_year}-{next_sequence}"
    )

    new_case = CaseFile(
        id=str(uuid.uuid4()),
        case_number=generated_case_number,
        title=title,
        description=(
            case_in.description.strip()
            if case_in.description
            else None
        ),
        assigned_operator_id=(
            str(case_in.assigned_operator_id)
            if case_in.assigned_operator_id
            else None
        ),
        status="open",
    )

    db.add(new_case)
    db.commit()
    db.refresh(new_case)

    return new_case


@router.get(
    "/",
    response_model=List[CaseOut],
)
def read_all_cases(
    db: Session = Depends(get_db),
) -> Any:
    """
    Retrieve all investigative case files.
    """

    return (
        db.query(CaseFile)
        .order_by(CaseFile.created_at.desc())
        .all()
    )


@router.get(
    "/{case_id}",
    response_model=CaseOut,
)
def read_case_file(
    case_id: str,
    db: Session = Depends(get_db),
) -> Any:
    """
    Retrieve one investigative case file.
    """

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


@router.patch(
    "/{case_id}",
    response_model=CaseOut,
)
def update_case_file(
    case_id: str,
    case_in: CaseUpdate,
    db: Session = Depends(get_db),
) -> Any:
    """
    Update selected fields on an investigative case file.
    """

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

    update_data = case_in.model_dump(
        exclude_unset=True
    )

    if "title" in update_data:
        title = update_data["title"]

        if title is None or not title.strip():
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail="Case title cannot be empty.",
            )

        case_file.title = title.strip()

    if "description" in update_data:
        description = update_data["description"]

        case_file.description = (
            description.strip()
            if description and description.strip()
            else None
        )

    if "status" in update_data:
        case_file.status = update_data["status"]

    if "assigned_operator_id" in update_data:
        operator_id = update_data["assigned_operator_id"]

        case_file.assigned_operator_id = (
            str(operator_id)
            if operator_id
            else None
        )

    db.commit()
    db.refresh(case_file)

    return case_file
