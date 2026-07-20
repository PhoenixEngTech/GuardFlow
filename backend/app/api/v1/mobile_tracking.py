import secrets
import uuid
from typing import Any, List

from fastapi import (
    APIRouter,
    Depends,
    HTTPException,
    Query,
    status,
)
from sqlalchemy import func
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.api.deps import hash_mobile_device_token
from app.core.database import get_db
from app.core.permissions import (
    require_management_operator,
)
from app.models.mobile_tracking import (
    MobileDevice,
    MobileTrackingSubject,
)
from app.models.user import Operator
from app.schemas.mobile_tracking import (
    MobileDeviceCreate,
    MobileDeviceOut,
    MobileDeviceRegistrationResult,
    MobileDeviceUpdate,
    MobileSubjectCreate,
    MobileSubjectOut,
    MobileSubjectUpdate,
)


router = APIRouter()


def get_mobile_subject_or_404(
    subject_id: str,
    db: Session,
) -> MobileTrackingSubject:
    subject = (
        db.query(MobileTrackingSubject)
        .filter(
            MobileTrackingSubject.id == subject_id
        )
        .first()
    )

    if subject is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Mobile tracking subject not found.",
        )

    return subject


def get_mobile_device_or_404(
    device_record_id: str,
    db: Session,
) -> MobileDevice:
    device = (
        db.query(MobileDevice)
        .filter(
            MobileDevice.id == device_record_id
        )
        .first()
    )

    if device is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Mobile device record not found.",
        )

    return device


def get_operator_or_404(
    operator_id: str,
    db: Session,
) -> Operator:
    operator = (
        db.query(Operator)
        .filter(
            Operator.id == operator_id
        )
        .first()
    )

    if operator is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=(
                "The selected GuardFlow operator "
                "does not exist."
            ),
        )

    return operator


def ensure_guard_operator_available(
    operator_id: str,
    db: Session,
) -> None:
    existing_subject = (
        db.query(MobileTrackingSubject)
        .filter(
            MobileTrackingSubject.operator_id
            == operator_id,
            MobileTrackingSubject.subject_type
            == "guard",
        )
        .first()
    )

    if existing_subject is not None:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=(
                "That GuardFlow operator is already "
                "registered as a mobile tracking "
                "subject."
            ),
        )


def ensure_unique_mobile_device_id(
    device_id: str,
    db: Session,
) -> None:
    existing_device = (
        db.query(MobileDevice)
        .filter(
            func.lower(
                MobileDevice.device_id
            )
            == device_id.lower()
        )
        .first()
    )

    if existing_device is not None:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=(
                "That mobile device ID is already "
                "registered."
            ),
        )


def generate_mobile_device_token() -> str:
    """
    Generate a high-entropy mobile authentication
    token.

    The plaintext token is returned only once. Only
    its SHA-256 hash is stored in PostgreSQL.
    """

    return secrets.token_urlsafe(48)


@router.get(
    "/subjects",
    response_model=List[MobileSubjectOut],
)
def list_mobile_subjects(
    subject_type: str | None = Query(
        default=None,
    ),
    active_only: bool = Query(
        default=False,
    ),
    db: Session = Depends(get_db),
    current_operator: Operator = Depends(
        require_management_operator
    ),
) -> Any:
    query = db.query(MobileTrackingSubject)

    if subject_type is not None:
        clean_subject_type = (
            subject_type.strip().lower()
        )

        if clean_subject_type not in {
            "guard",
            "client",
        }:
            raise HTTPException(
                status_code=(
                    status.HTTP_422_UNPROCESSABLE_ENTITY
                ),
                detail=(
                    "Subject type must be guard "
                    "or client."
                ),
            )

        query = query.filter(
            MobileTrackingSubject.subject_type
            == clean_subject_type
        )

    if active_only:
        query = query.filter(
            MobileTrackingSubject.is_active.is_(
                True
            )
        )

    return (
        query.order_by(
            MobileTrackingSubject.is_active.desc(),
            MobileTrackingSubject.created_at.desc(),
        )
        .all()
    )


@router.get(
    "/subjects/{subject_id}",
    response_model=MobileSubjectOut,
)
def read_mobile_subject(
    subject_id: str,
    db: Session = Depends(get_db),
    current_operator: Operator = Depends(
        require_management_operator
    ),
) -> Any:
    return get_mobile_subject_or_404(
        subject_id,
        db,
    )


@router.post(
    "/subjects",
    response_model=MobileSubjectOut,
    status_code=status.HTTP_201_CREATED,
)
def create_mobile_subject(
    subject_in: MobileSubjectCreate,
    db: Session = Depends(get_db),
    current_operator: Operator = Depends(
        require_management_operator
    ),
) -> Any:
    linked_operator = None

    if subject_in.subject_type == "guard":
        linked_operator = get_operator_or_404(
            subject_in.operator_id,
            db,
        )

        if not linked_operator.is_active:
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail=(
                    "A deactivated operator cannot "
                    "be registered for mobile "
                    "tracking."
                ),
            )

        ensure_guard_operator_available(
            linked_operator.id,
            db,
        )

    subject = MobileTrackingSubject(
        id=str(uuid.uuid4()),
        subject_type=subject_in.subject_type,
        display_name=subject_in.display_name,
        operator_id=(
            linked_operator.id
            if linked_operator is not None
            else None
        ),
        phone_number=subject_in.phone_number,
        external_reference=(
            subject_in.external_reference
        ),
        is_active=subject_in.is_active,
        created_by_operator_id=(
            current_operator.id
        ),
    )

    try:
        db.add(subject)
        db.commit()
        db.refresh(subject)

    except IntegrityError as exc:
        db.rollback()

        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=(
                "The mobile tracking subject could "
                "not be registered."
            ),
        ) from exc

    return subject


@router.patch(
    "/subjects/{subject_id}",
    response_model=MobileSubjectOut,
)
def update_mobile_subject(
    subject_id: str,
    subject_in: MobileSubjectUpdate,
    db: Session = Depends(get_db),
    current_operator: Operator = Depends(
        require_management_operator
    ),
) -> Any:
    subject = get_mobile_subject_or_404(
        subject_id,
        db,
    )

    update_data = subject_in.model_dump(
        exclude_unset=True
    )

    if (
        "display_name" in update_data
        and not update_data["display_name"]
    ):
        raise HTTPException(
            status_code=(
                status.HTTP_422_UNPROCESSABLE_ENTITY
            ),
            detail="Display name cannot be empty.",
        )

    editable_fields = {
        "display_name",
        "phone_number",
        "external_reference",
        "is_active",
    }

    for field_name in editable_fields:
        if field_name in update_data:
            setattr(
                subject,
                field_name,
                update_data[field_name],
            )

    db.commit()
    db.refresh(subject)

    return subject


@router.get(
    "/devices",
    response_model=List[MobileDeviceOut],
)
def list_mobile_devices(
    subject_id: str | None = Query(
        default=None,
    ),
    active_only: bool = Query(
        default=False,
    ),
    db: Session = Depends(get_db),
    current_operator: Operator = Depends(
        require_management_operator
    ),
) -> Any:
    query = db.query(MobileDevice)

    if subject_id is not None:
        query = query.filter(
            MobileDevice.subject_id
            == subject_id.strip()
        )

    if active_only:
        query = query.filter(
            MobileDevice.is_active.is_(True)
        )

    return (
        query.order_by(
            MobileDevice.is_active.desc(),
            MobileDevice.created_at.desc(),
        )
        .all()
    )


@router.get(
    "/devices/{device_record_id}",
    response_model=MobileDeviceOut,
)
def read_mobile_device(
    device_record_id: str,
    db: Session = Depends(get_db),
    current_operator: Operator = Depends(
        require_management_operator
    ),
) -> Any:
    return get_mobile_device_or_404(
        device_record_id,
        db,
    )


@router.post(
    "/devices",
    response_model=MobileDeviceRegistrationResult,
    status_code=status.HTTP_201_CREATED,
)
def register_mobile_device(
    device_in: MobileDeviceCreate,
    db: Session = Depends(get_db),
    current_operator: Operator = Depends(
        require_management_operator
    ),
) -> Any:
    subject = get_mobile_subject_or_404(
        device_in.subject_id,
        db,
    )

    if not subject.is_active:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=(
                "A mobile device cannot be registered "
                "to a disabled tracking subject."
            ),
        )

    clean_device_id = device_in.device_id.strip()

    ensure_unique_mobile_device_id(
        clean_device_id,
        db,
    )

    plaintext_token = (
        generate_mobile_device_token()
    )

    device = MobileDevice(
        id=str(uuid.uuid4()),
        device_id=clean_device_id,
        subject_id=subject.id,
        device_name=device_in.device_name,
        platform=device_in.platform,
        app_version=device_in.app_version,
        token_hash=hash_mobile_device_token(
            plaintext_token
        ),
        status=(
            "pending"
            if device_in.is_active
            else "disabled"
        ),
        is_active=device_in.is_active,
        registered_by_operator_id=(
            current_operator.id
        ),
    )

    try:
        db.add(device)
        db.commit()
        db.refresh(device)

    except IntegrityError as exc:
        db.rollback()

        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=(
                "The mobile device could not be "
                "registered because its device ID "
                "already exists."
            ),
        ) from exc

    device_response = (
        MobileDeviceOut.model_validate(
            device
        ).model_dump()
    )

    return MobileDeviceRegistrationResult(
        **device_response,
        mobile_device_token=plaintext_token,
    )


@router.patch(
    "/devices/{device_record_id}",
    response_model=MobileDeviceOut,
)
def update_mobile_device(
    device_record_id: str,
    device_in: MobileDeviceUpdate,
    db: Session = Depends(get_db),
    current_operator: Operator = Depends(
        require_management_operator
    ),
) -> Any:
    device = get_mobile_device_or_404(
        device_record_id,
        db,
    )

    update_data = device_in.model_dump(
        exclude_unset=True
    )

    editable_fields = {
        "device_name",
        "app_version",
    }

    for field_name in editable_fields:
        if field_name in update_data:
            setattr(
                device,
                field_name,
                update_data[field_name],
            )

    if "is_active" in update_data:
        device.is_active = update_data[
            "is_active"
        ]

        if device.is_active:
            if device.status == "disabled":
                device.status = "pending"
        else:
            device.status = "disabled"

    db.commit()
    db.refresh(device)

    return device


@router.post(
    "/devices/{device_record_id}/rotate-token",
    response_model=MobileDeviceRegistrationResult,
)
def rotate_mobile_device_token(
    device_record_id: str,
    db: Session = Depends(get_db),
    current_operator: Operator = Depends(
        require_management_operator
    ),
) -> Any:
    """
    Rotate a mobile device token deliberately.

    The previous token becomes invalid immediately.
    The replacement plaintext token is returned once.
    """

    device = get_mobile_device_or_404(
        device_record_id,
        db,
    )

    plaintext_token = (
        generate_mobile_device_token()
    )

    device.token_hash = (
        hash_mobile_device_token(
            plaintext_token
        )
    )

    if device.is_active:
        device.status = "pending"
    else:
        device.status = "disabled"

    db.commit()
    db.refresh(device)

    device_response = (
        MobileDeviceOut.model_validate(
            device
        ).model_dump()
    )

    return MobileDeviceRegistrationResult(
        **device_response,
        mobile_device_token=plaintext_token,
    )