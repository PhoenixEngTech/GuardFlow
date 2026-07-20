import uuid

from sqlalchemy import (
    BigInteger,
    Boolean,
    Column,
    DateTime,
    Float,
    ForeignKey,
    Integer,
    String,
    Text,
)
from sqlalchemy.sql import func

from app.core.database import Base


class MobileTrackingSubject(Base):
    """
    A person who may be tracked through the GuardFlow
    mobile companion application.

    Guards may be linked to an Operator account.
    Consenting clients do not require an Operator login.
    """

    __tablename__ = "mobile_tracking_subjects"

    id = Column(
        String,
        primary_key=True,
        index=True,
        default=lambda: str(uuid.uuid4()),
    )

    subject_type = Column(
        String(20),
        nullable=False,
        index=True,
    )

    display_name = Column(
        String(150),
        nullable=False,
    )

    operator_id = Column(
        String,
        ForeignKey(
            "operators.id",
            ondelete="SET NULL",
        ),
        nullable=True,
        index=True,
    )

    phone_number = Column(
        String(30),
        nullable=True,
        index=True,
    )

    external_reference = Column(
        String(100),
        nullable=True,
        index=True,
    )

    is_active = Column(
        Boolean,
        nullable=False,
        default=True,
    )

    created_by_operator_id = Column(
        String,
        ForeignKey(
            "operators.id",
            ondelete="SET NULL",
        ),
        nullable=True,
        index=True,
    )

    created_at = Column(
        DateTime(timezone=True),
        server_default=func.now(),
        nullable=False,
    )

    updated_at = Column(
        DateTime(timezone=True),
        server_default=func.now(),
        onupdate=func.now(),
        nullable=False,
    )


class MobileDevice(Base):
    """
    A registered smartphone running the GuardFlow
    mobile companion application.

    Only a SHA-256 authentication-token hash is stored.
    """

    __tablename__ = "mobile_devices"

    id = Column(
        String,
        primary_key=True,
        index=True,
        default=lambda: str(uuid.uuid4()),
    )

    device_id = Column(
        String(150),
        unique=True,
        nullable=False,
        index=True,
    )

    subject_id = Column(
        String,
        ForeignKey(
            "mobile_tracking_subjects.id",
            ondelete="CASCADE",
        ),
        nullable=False,
        index=True,
    )

    device_name = Column(
        String(150),
        nullable=True,
    )

    platform = Column(
        String(20),
        nullable=False,
    )

    app_version = Column(
        String(30),
        nullable=True,
    )

    token_hash = Column(
        String(64),
        nullable=False,
    )

    status = Column(
        String(20),
        nullable=False,
        default="pending",
    )

    is_active = Column(
        Boolean,
        nullable=False,
        default=True,
    )

    last_seen_at = Column(
        DateTime(timezone=True),
        nullable=True,
    )

    registered_by_operator_id = Column(
        String,
        ForeignKey(
            "operators.id",
            ondelete="SET NULL",
        ),
        nullable=True,
        index=True,
    )

    created_at = Column(
        DateTime(timezone=True),
        server_default=func.now(),
        nullable=False,
    )

    updated_at = Column(
        DateTime(timezone=True),
        server_default=func.now(),
        onupdate=func.now(),
        nullable=False,
    )


class MobileTrackingSession(Base):
    """
    A time-limited guard shift or client protection
    session.

    Location tracking is allowed only while a session
    is active.
    """

    __tablename__ = "mobile_tracking_sessions"

    id = Column(
        String,
        primary_key=True,
        index=True,
        default=lambda: str(uuid.uuid4()),
    )

    subject_id = Column(
        String,
        ForeignKey(
            "mobile_tracking_subjects.id",
            ondelete="CASCADE",
        ),
        nullable=False,
        index=True,
    )

    device_id = Column(
        String,
        ForeignKey(
            "mobile_devices.id",
            ondelete="CASCADE",
        ),
        nullable=False,
        index=True,
    )

    session_type = Column(
        String(30),
        nullable=False,
        index=True,
    )

    status = Column(
        String(20),
        nullable=False,
        default="pending",
        index=True,
    )

    case_id = Column(
        String,
        ForeignKey(
            "case_files.id",
            ondelete="SET NULL",
        ),
        nullable=True,
        index=True,
    )

    consent_given_at = Column(
        DateTime(timezone=True),
        nullable=True,
    )

    consent_reference = Column(
        String(150),
        nullable=True,
    )

    consent_revoked_at = Column(
        DateTime(timezone=True),
        nullable=True,
    )

    started_at = Column(
        DateTime(timezone=True),
        nullable=True,
    )

    expected_end_at = Column(
        DateTime(timezone=True),
        nullable=True,
    )

    ended_at = Column(
        DateTime(timezone=True),
        nullable=True,
    )

    started_by_operator_id = Column(
        String,
        ForeignKey(
            "operators.id",
            ondelete="SET NULL",
        ),
        nullable=True,
        index=True,
    )

    ended_by_operator_id = Column(
        String,
        ForeignKey(
            "operators.id",
            ondelete="SET NULL",
        ),
        nullable=True,
        index=True,
    )

    created_at = Column(
        DateTime(timezone=True),
        server_default=func.now(),
        nullable=False,
    )

    updated_at = Column(
        DateTime(timezone=True),
        server_default=func.now(),
        onupdate=func.now(),
        nullable=False,
    )


class MobileLocationLog(Base):
    """
    GPS telemetry submitted by an authorised mobile
    device during an active tracking session.
    """

    __tablename__ = "mobile_location_logs"

    id = Column(
        BigInteger,
        primary_key=True,
        autoincrement=True,
    )

    session_id = Column(
        String,
        ForeignKey(
            "mobile_tracking_sessions.id",
            ondelete="CASCADE",
        ),
        nullable=False,
        index=True,
    )

    subject_id = Column(
        String,
        ForeignKey(
            "mobile_tracking_subjects.id",
            ondelete="CASCADE",
        ),
        nullable=False,
        index=True,
    )

    device_id = Column(
        String,
        ForeignKey(
            "mobile_devices.id",
            ondelete="CASCADE",
        ),
        nullable=False,
        index=True,
    )

    latitude = Column(
        Float,
        nullable=False,
    )

    longitude = Column(
        Float,
        nullable=False,
    )

    accuracy_metres = Column(
        Float,
        nullable=True,
    )

    altitude_metres = Column(
        Float,
        nullable=True,
    )

    speed_kmh = Column(
        Float,
        nullable=True,
    )

    heading_degrees = Column(
        Float,
        nullable=True,
    )

    battery_percentage = Column(
        Integer,
        nullable=True,
    )

    recorded_at = Column(
        DateTime(timezone=True),
        nullable=False,
        index=True,
    )

    received_at = Column(
        DateTime(timezone=True),
        server_default=func.now(),
        nullable=False,
        index=True,
    )


class MobileSOSAlert(Base):
    """
    Panic/SOS event triggered from the mobile companion
    application.
    """

    __tablename__ = "mobile_sos_alerts"

    id = Column(
        String,
        primary_key=True,
        index=True,
        default=lambda: str(uuid.uuid4()),
    )

    session_id = Column(
        String,
        ForeignKey(
            "mobile_tracking_sessions.id",
            ondelete="CASCADE",
        ),
        nullable=False,
        index=True,
    )

    subject_id = Column(
        String,
        ForeignKey(
            "mobile_tracking_subjects.id",
            ondelete="CASCADE",
        ),
        nullable=False,
        index=True,
    )

    device_id = Column(
        String,
        ForeignKey(
            "mobile_devices.id",
            ondelete="CASCADE",
        ),
        nullable=False,
        index=True,
    )

    status = Column(
        String(20),
        nullable=False,
        default="active",
        index=True,
    )

    latitude = Column(
        Float,
        nullable=False,
    )

    longitude = Column(
        Float,
        nullable=False,
    )

    accuracy_metres = Column(
        Float,
        nullable=True,
    )

    message = Column(
        Text,
        nullable=True,
    )

    triggered_at = Column(
        DateTime(timezone=True),
        nullable=False,
        index=True,
    )

    acknowledged_at = Column(
        DateTime(timezone=True),
        nullable=True,
    )

    acknowledged_by_operator_id = Column(
        String,
        ForeignKey(
            "operators.id",
            ondelete="SET NULL",
        ),
        nullable=True,
        index=True,
    )

    resolved_at = Column(
        DateTime(timezone=True),
        nullable=True,
    )

    resolved_by_operator_id = Column(
        String,
        ForeignKey(
            "operators.id",
            ondelete="SET NULL",
        ),
        nullable=True,
        index=True,
    )

    created_at = Column(
        DateTime(timezone=True),
        server_default=func.now(),
        nullable=False,
    )

    updated_at = Column(
        DateTime(timezone=True),
        server_default=func.now(),
        onupdate=func.now(),
        nullable=False,
    )