import uuid
from datetime import datetime
from typing import List, Any
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from app.core.database import get_db
from app.models.case import CaseFile
from app.schemas.case import CaseCreate, CaseOut

router = APIRouter()

@router.post("/", response_model=CaseOut, status_code=status.HTTP_201_CREATED)
def create_case_file(case_in: CaseCreate, db: Session = Depends(get_db)) -> Any:
    """
    Generates an automated case number and records a new investigative file in pgAdmin 4.
    """
    # Auto-generate a standardized tracking number based on current year
    current_year = datetime.now().year
    case_count = db.query(CaseFile).count()
    next_sequence = str(case_count + 1).zfill(4)
    generated_case_number = f"TPI-{current_year}-{next_sequence}"

    new_case = CaseFile(
        id=str(uuid.uuid4()),
        case_number=generated_case_number,
        title=case_in.title,
        description=case_in.description,
        assigned_operator_id=case_in.assigned_operator_id,
        status="open"
    )
    
    db.add(new_case)
    db.commit()
    db.refresh(new_case)
    return new_case

@router.get("/", response_model=List[CaseOut])
def read_all_cases(db: Session = Depends(get_db)) -> Any:
    """
    Retrieves all recorded investigative case histories from the database.
    """
    cases = db.query(CaseFile).all()
    return cases
