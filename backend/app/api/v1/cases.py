import uuid
from datetime import datetime
from typing import Any, List

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.models.case import CaseFile
from app.schemas.case import CaseCreate, CaseOut


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

    current_year = datetime.now().year

    case_count = (
        db.query(CaseFile)
        .filter(CaseFile.case_number.like(f"TPI-{current_year}-%"))
        .count()
    )

    next_sequence = str(case_count + 1).zfill(4)
    generated_case_number = (
        f"TPI-{current_year}-{next_sequence}"
    )

    new_case = CaseFile(
        id=str(uuid.uuid4()),
        case_number=generated_case_number,
        title=case_in.title.strip(),
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
    Retrieve one investigative case file by its ID.
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
