"""GuardFlow radio dispatch, gateway and field communications models."""

from __future__ import annotations

import uuid

from sqlalchemy import (
    Boolean,
    Column,
    DateTime,
    Float,
    ForeignKey,
    Integer,
    JSON,
    String,
    Text,
    UniqueConstraint,
    func,
)

from app.core.database import Base


def new_id() -> str:
    return str(uuid.uuid4())


class RadioGateway(Base):
    __tablename__ = "radio_gateways"

    id = Column(String, primary_key=True, default=new_id, index=True)
    gateway_identifier = Column(String(120), unique=True, nullable=False, index=True)
    name = Column(String(180), nullable=False)
    gateway_type = Column(String(40), nullable=False, default="poc", index=True)
    vendor = Column(String(120), nullable=True)
    model = Column(String(120), nullable=True)
    status = Column(String(30), nullable=False, default="offline", index=True)
    secret_hash = Column(String(64), nullable=False)
    last_seen_at = Column(DateTime(timezone=True), nullable=True, index=True)
    capabilities_json = Column(JSON, nullable=False, default=dict)
    metadata_json = Column(JSON, nullable=False, default=dict)
    created_by_operator_id = Column(
        String,
        ForeignKey("operators.id", ondelete="SET NULL"),
        nullable=True,
        index=True,
    )
    created_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)
    updated_at = Column(
        DateTime(timezone=True),
        server_default=func.now(),
        onupdate=func.now(),
        nullable=False,
    )


class RadioTalkGroup(Base):
    __tablename__ = "radio_talkgroups"

    id = Column(String, primary_key=True, default=new_id, index=True)
    code = Column(String(80), unique=True, nullable=False, index=True)
    name = Column(String(180), nullable=False)
    network_type = Column(String(40), nullable=False, default="poc", index=True)
    external_group_id = Column(String(180), nullable=True, index=True)
    priority = Column(Integer, nullable=False, default=5)
    is_active = Column(Boolean, nullable=False, default=True, index=True)
    description = Column(Text, nullable=True)
    created_by_operator_id = Column(
        String,
        ForeignKey("operators.id", ondelete="SET NULL"),
        nullable=True,
    )
    created_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)
    updated_at = Column(
        DateTime(timezone=True),
        server_default=func.now(),
        onupdate=func.now(),
        nullable=False,
    )


class RadioDevice(Base):
    __tablename__ = "radio_devices"

    id = Column(String, primary_key=True, default=new_id, index=True)
    radio_identifier = Column(String(120), unique=True, nullable=False, index=True)
    callsign = Column(String(100), unique=True, nullable=False, index=True)
    network_type = Column(String(40), nullable=False, default="poc", index=True)
    vendor = Column(String(120), nullable=True)
    model = Column(String(120), nullable=True)
    serial_number = Column(String(160), nullable=True, index=True)
    imei = Column(String(40), nullable=True, index=True)
    gateway_id = Column(
        String,
        ForeignKey("radio_gateways.id", ondelete="SET NULL"),
        nullable=True,
        index=True,
    )
    primary_talkgroup_id = Column(
        String,
        ForeignKey("radio_talkgroups.id", ondelete="SET NULL"),
        nullable=True,
        index=True,
    )
    assigned_operator_id = Column(
        String,
        ForeignKey("operators.id", ondelete="SET NULL"),
        nullable=True,
        index=True,
    )
    assigned_response_unit_id = Column(String, nullable=True, index=True)
    vehicle_registration = Column(String(50), nullable=True)
    status = Column(String(30), nullable=False, default="offline", index=True)
    emergency_state = Column(String(30), nullable=False, default="clear", index=True)
    latitude = Column(Float, nullable=True)
    longitude = Column(Float, nullable=True)
    accuracy_metres = Column(Float, nullable=True)
    speed_kmh = Column(Float, nullable=True)
    heading_degrees = Column(Float, nullable=True)
    battery_percentage = Column(Integer, nullable=True)
    signal_strength = Column(Integer, nullable=True)
    last_seen_at = Column(DateTime(timezone=True), nullable=True, index=True)
    capabilities_json = Column(JSON, nullable=False, default=dict)
    metadata_json = Column(JSON, nullable=False, default=dict)
    created_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)
    updated_at = Column(
        DateTime(timezone=True),
        server_default=func.now(),
        onupdate=func.now(),
        nullable=False,
    )


class RadioTalkGroupMember(Base):
    __tablename__ = "radio_talkgroup_members"
    __table_args__ = (
        UniqueConstraint("talkgroup_id", "radio_id", name="uq_radio_talkgroup_member"),
    )

    id = Column(String, primary_key=True, default=new_id, index=True)
    talkgroup_id = Column(
        String,
        ForeignKey("radio_talkgroups.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    radio_id = Column(
        String,
        ForeignKey("radio_devices.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    created_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)


class RadioDispatch(Base):
    __tablename__ = "radio_dispatches"

    id = Column(String, primary_key=True, default=new_id, index=True)
    dispatch_number = Column(String(50), unique=True, nullable=False, index=True)
    alarm_id = Column(String, nullable=True, index=True)
    case_id = Column(String, nullable=True, index=True)
    title = Column(String(220), nullable=False)
    message = Column(Text, nullable=False)
    priority = Column(String(20), nullable=False, default="high", index=True)
    status = Column(String(30), nullable=False, default="queued", index=True)
    radio_id = Column(
        String,
        ForeignKey("radio_devices.id", ondelete="SET NULL"),
        nullable=True,
        index=True,
    )
    talkgroup_id = Column(
        String,
        ForeignKey("radio_talkgroups.id", ondelete="SET NULL"),
        nullable=True,
        index=True,
    )
    response_unit_id = Column(String, nullable=True, index=True)
    latitude = Column(Float, nullable=True)
    longitude = Column(Float, nullable=True)
    created_by_operator_id = Column(
        String,
        ForeignKey("operators.id", ondelete="SET NULL"),
        nullable=True,
        index=True,
    )
    accepted_by_radio_id = Column(String, nullable=True, index=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)
    sent_at = Column(DateTime(timezone=True), nullable=True)
    accepted_at = Column(DateTime(timezone=True), nullable=True)
    en_route_at = Column(DateTime(timezone=True), nullable=True)
    on_scene_at = Column(DateTime(timezone=True), nullable=True)
    cleared_at = Column(DateTime(timezone=True), nullable=True)
    updated_at = Column(
        DateTime(timezone=True),
        server_default=func.now(),
        onupdate=func.now(),
        nullable=False,
    )


class RadioCommand(Base):
    __tablename__ = "radio_commands"

    id = Column(String, primary_key=True, default=new_id, index=True)
    gateway_id = Column(
        String,
        ForeignKey("radio_gateways.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    dispatch_id = Column(
        String,
        ForeignKey("radio_dispatches.id", ondelete="SET NULL"),
        nullable=True,
        index=True,
    )
    radio_id = Column(
        String,
        ForeignKey("radio_devices.id", ondelete="SET NULL"),
        nullable=True,
        index=True,
    )
    talkgroup_id = Column(
        String,
        ForeignKey("radio_talkgroups.id", ondelete="SET NULL"),
        nullable=True,
        index=True,
    )
    command_type = Column(String(60), nullable=False, index=True)
    status = Column(String(30), nullable=False, default="pending", index=True)
    payload_json = Column(JSON, nullable=False, default=dict)
    result_json = Column(JSON, nullable=False, default=dict)
    attempt_count = Column(Integer, nullable=False, default=0)
    created_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)
    delivered_at = Column(DateTime(timezone=True), nullable=True)
    completed_at = Column(DateTime(timezone=True), nullable=True)
    updated_at = Column(
        DateTime(timezone=True),
        server_default=func.now(),
        onupdate=func.now(),
        nullable=False,
    )


class RadioEvent(Base):
    __tablename__ = "radio_events"
    __table_args__ = (
        UniqueConstraint("gateway_id", "external_event_id", name="uq_radio_gateway_event"),
    )

    id = Column(String, primary_key=True, default=new_id, index=True)
    gateway_id = Column(
        String,
        ForeignKey("radio_gateways.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    radio_id = Column(
        String,
        ForeignKey("radio_devices.id", ondelete="SET NULL"),
        nullable=True,
        index=True,
    )
    dispatch_id = Column(
        String,
        ForeignKey("radio_dispatches.id", ondelete="SET NULL"),
        nullable=True,
        index=True,
    )
    external_event_id = Column(String(180), nullable=False)
    event_type = Column(String(60), nullable=False, index=True)
    emergency_type = Column(String(60), nullable=True)
    message = Column(Text, nullable=True)
    latitude = Column(Float, nullable=True)
    longitude = Column(Float, nullable=True)
    battery_percentage = Column(Integer, nullable=True)
    occurred_at = Column(DateTime(timezone=True), nullable=False, index=True)
    received_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)
    payload_json = Column(JSON, nullable=False, default=dict)
