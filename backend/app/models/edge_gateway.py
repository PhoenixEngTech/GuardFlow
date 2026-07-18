import uuid

from sqlalchemy import (
    Boolean,
    Column,
    DateTime,
    ForeignKey,
    Integer,
    String,
)
from sqlalchemy.sql import func

from app.core.database import Base


class EdgeGateway(Base):
    __tablename__ = "edge_gateways"

    id = Column(
        String,
        primary_key=True,
        index=True,
        default=lambda: str(uuid.uuid4()),
    )

    gateway_id = Column(
        String(100),
        unique=True,
        nullable=False,
        index=True,
    )

    name = Column(
        String(100),
        nullable=False,
    )

    site_name = Column(
        String(150),
        nullable=True,
    )

    customer_name = Column(
        String(150),
        nullable=True,
    )

    # SHA-256 hash only. The plaintext edge token
    # must never be stored in PostgreSQL.
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

    registered_camera_count = Column(
        Integer,
        nullable=False,
        default=0,
    )

    online_camera_count = Column(
        Integer,
        nullable=False,
        default=0,
    )

    offline_camera_count = Column(
        Integer,
        nullable=False,
        default=0,
    )

    last_seen_at = Column(
        DateTime(timezone=True),
        nullable=True,
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
