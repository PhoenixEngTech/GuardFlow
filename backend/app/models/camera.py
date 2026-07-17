import uuid

from sqlalchemy import (
    Boolean,
    Column,
    DateTime,
    Float,
    ForeignKey,
    Integer,
    String,
)
from sqlalchemy.sql import func

from app.core.database import Base


class CameraSource(Base):
    __tablename__ = "camera_sources"

    id = Column(
        String,
        primary_key=True,
        index=True,
        default=lambda: str(uuid.uuid4()),
    )

    name = Column(
        String(100),
        nullable=False,
    )

    manufacturer = Column(
        String(50),
        nullable=True,
    )

    model = Column(
        String(100),
        nullable=True,
    )

    serial_number = Column(
        String(100),
        unique=True,
        nullable=True,
        index=True,
    )

    location_name = Column(
        String(150),
        nullable=False,
    )

    latitude = Column(
        Float,
        nullable=True,
    )

    longitude = Column(
        Float,
        nullable=True,
    )

    connection_type = Column(
        String(20),
        nullable=False,
        default="rtsp",
    )

    host = Column(
        String(255),
        nullable=False,
    )

    port = Column(
        Integer,
        nullable=False,
        default=554,
    )

    stream_path = Column(
        String(255),
        nullable=True,
    )

    credential_reference = Column(
        String(100),
        nullable=True,
    )

    gateway_stream_url = Column(
        String(500),
        nullable=True,
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

    created_by_operator_id = Column(
        String,
        ForeignKey("operators.id"),
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
