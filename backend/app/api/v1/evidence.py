import hashlib
import os
import uuid
from pathlib import Path
from typing import Any, List

from fastapi import (
    APIRouter,
    Depends,
    File,
    Form,
    HTTPException,
    UploadFile,
    status,
)
from fastapi.responses import FileResponse
from sqlalchemy.orm import Session

from app.api.deps import get_current_operator
from app.core.database import get_db
from app.models.activity import CaseActivity
from app.models.case import CaseFile
from app.models.evidence import CaseEvidence
from app.models.user import Operator
from app.schemas.evidence import CaseEvidenceOut


router = APIRouter()

EVIDENCE_STORAGE_PATH = Path(
    os.getenv(
        "EVIDENCE_STORAGE_PATH",
        "/data/evidence",
    )
)

MAX_FILE_SIZE = 100 * 1024 * 1024

ALLOWED_EVIDENCE_TYPES = {
    "document",
    "photo",
    "video",
    "audio",
    "other",
}


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


def get_evidence_or_404(
    evidence_id: str,
    db: Session,
) -> CaseEvidence:
    evidence = (
        db.query(CaseEvidence)
        .filter(CaseEvidence.id == evidence_id)
        .first()
    )

    if evidence is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Evidence record not found.",
        )

    return evidence


@router.post(
    "/cases/{case_id}",
    response_model=CaseEvidenceOut,
    status_code=status.HTTP_201_CREATED,
)
async def upload_case_evidence(
    case_id: str,
    evidence_type: str = Form("document"),
    description: str | None = Form(None),
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
    current_operator: Operator = Depends(
        get_current_operator
    ),
) -> Any:
    case_file = get_case_or_404(case_id, db)

    evidence_type = evidence_type.strip().lower()

    if evidence_type not in ALLOWED_EVIDENCE_TYPES:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Invalid evidence type.",
        )

    original_filename = Path(
        file.filename or "unnamed-file"
    ).name

    file_extension = Path(
        original_filename
    ).suffix.lower()

    stored_filename = (
        f"{uuid.uuid4()}{file_extension}"
    )

    case_directory = (
        EVIDENCE_STORAGE_PATH / case_id
    )

    case_directory.mkdir(
        parents=True,
        exist_ok=True,
    )

    storage_path = (
        case_directory / stored_filename
    )

    file_hash = hashlib.sha256()
    total_size = 0

    try:
        with storage_path.open("wb") as output_file:
            while chunk := await file.read(
                1024 * 1024
            ):
                total_size += len(chunk)

                if total_size > MAX_FILE_SIZE:
                    raise HTTPException(
                        status_code=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE,
                        detail=(
                            "Evidence file exceeds the "
                            "100 MB upload limit."
                        ),
                    )

                file_hash.update(chunk)
                output_file.write(chunk)

    except Exception:
        if storage_path.exists():
            storage_path.unlink()

        raise

    finally:
        await file.close()

    evidence_record = CaseEvidence(
        id=str(uuid.uuid4()),
        case_id=case_file.id,
        uploaded_by_operator_id=(
            current_operator.id
        ),
        original_filename=original_filename,
        stored_filename=stored_filename,
        storage_path=str(storage_path),
        content_type=(
            file.content_type
            or "application/octet-stream"
        ),
        file_size=total_size,
        evidence_type=evidence_type,
        description=(
            description.strip()
            if description
            and description.strip()
            else None
        ),
        sha256_hash=file_hash.hexdigest(),
    )

    activity = CaseActivity(
        id=str(uuid.uuid4()),
        case_id=case_file.id,
        operator_id=current_operator.id,
        event_type="evidence_uploaded",
        summary=(
            f"Evidence uploaded: "
            f"{original_filename}."
        ),
        changes={
            "evidence_id": evidence_record.id,
            "filename": original_filename,
            "evidence_type": evidence_type,
            "file_size": total_size,
            "sha256_hash": (
                evidence_record.sha256_hash
            ),
        },
    )

    try:
        db.add(evidence_record)
        db.add(activity)
        db.commit()
        db.refresh(evidence_record)

    except Exception:
        db.rollback()

        if storage_path.exists():
            storage_path.unlink()

        raise

    return evidence_record


@router.get(
    "/cases/{case_id}",
    response_model=List[CaseEvidenceOut],
)
def list_case_evidence(
    case_id: str,
    db: Session = Depends(get_db),
    current_operator: Operator = Depends(
        get_current_operator
    ),
) -> Any:
    get_case_or_404(case_id, db)

    return (
        db.query(CaseEvidence)
        .filter(
            CaseEvidence.case_id == case_id
        )
        .order_by(
            CaseEvidence.created_at.desc()
        )
        .all()
    )


@router.get(
    "/{evidence_id}",
    response_model=CaseEvidenceOut,
)
def read_evidence_metadata(
    evidence_id: str,
    db: Session = Depends(get_db),
    current_operator: Operator = Depends(
        get_current_operator
    ),
) -> Any:
    return get_evidence_or_404(
        evidence_id,
        db,
    )


@router.get(
    "/{evidence_id}/download",
)
def download_evidence_file(
    evidence_id: str,
    db: Session = Depends(get_db),
    current_operator: Operator = Depends(
        get_current_operator
    ),
) -> FileResponse:
    evidence = get_evidence_or_404(
        evidence_id,
        db,
    )

    storage_path = Path(
        evidence.storage_path
    )

    if not storage_path.exists():
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=(
                "The evidence file is missing "
                "from persistent storage."
            ),
        )

    return FileResponse(
        path=storage_path,
        media_type=evidence.content_type,
        filename=evidence.original_filename,
    )
