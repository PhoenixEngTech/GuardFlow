"""GuardFlow universal alarm, premises and response models.

This module is additive: it does not replace the existing MobileSOSAlert model.
Legacy mobile SOS rows are mirrored into Alarm by alarm_service.py.
"""

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


class AlarmSite(Base):
    __tablename__ = "alarm_sites"

    id = Column(String, primary_key=True, default=new_id, index=True)
    account_number = Column(String(60), unique=True, nullable=False, index=True)
    client_name = Column(String(180), nullable=False, index=True)
    site_name = Column(String(180), nullable=False)
    site_type = Column(String(30), nullable=False, default="household", index=True)
    status = Column(String(30), nullable=False, default="active", index=True)
    armed_state = Column(String(30), nullable=False, default="unknown", index=True)
    address_line_1 = Column(String(220), nullable=False)
    address_line_2 = Column(String(220), nullable=True)
    suburb = Column(String(120), nullable=True)
    city = Column(String(120), nullable=True, index=True)
    province = Column(String(120), nullable=True)
    postal_code = Column(String(20), nullable=True)
    latitude = Column(Float, nullable=True)
    longitude = Column(Float, nullable=True)
    case_id = Column(String, nullable=True, index=True)
    response_instructions = Column(Text, nullable=True)
    access_notes = Column(Text, nullable=True)
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


class AlarmPanel(Base):
    __tablename__ = "alarm_panels"

    id = Column(String, primary_key=True, default=new_id, index=True)
    site_id = Column(
        String,
        ForeignKey("alarm_sites.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    panel_identifier = Column(String(120), unique=True, nullable=False, index=True)
    manufacturer = Column(String(100), nullable=True)
    model = Column(String(100), nullable=True)
    serial_number = Column(String(120), nullable=True, index=True)
    protocol = Column(String(40), nullable=False, default="json", index=True)
    receiver_name = Column(String(120), nullable=True)
    status = Column(String(30), nullable=False, default="online", index=True)
    secret_hash = Column(String(64), nullable=False)
    last_seen_at = Column(DateTime(timezone=True), nullable=True, index=True)
    metadata_json = Column(JSON, nullable=False, default=dict)
    created_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)
    updated_at = Column(
        DateTime(timezone=True),
        server_default=func.now(),
        onupdate=func.now(),
        nullable=False,
    )


class AlarmZone(Base):
    __tablename__ = "alarm_zones"
    __table_args__ = (
        UniqueConstraint("panel_id", "zone_number", name="uq_alarm_panel_zone"),
    )

    id = Column(String, primary_key=True, default=new_id, index=True)
    panel_id = Column(
        String,
        ForeignKey("alarm_panels.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    zone_number = Column(String(30), nullable=False)
    name = Column(String(160), nullable=False)
    zone_type = Column(String(40), nullable=False, default="intrusion", index=True)
    partition = Column(String(30), nullable=True)
    severity_override = Column(String(20), nullable=True)
    is_enabled = Column(Boolean, nullable=False, default=True)
    is_bypassed = Column(Boolean, nullable=False, default=False)
    notes = Column(Text, nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)
    updated_at = Column(
        DateTime(timezone=True),
        server_default=func.now(),
        onupdate=func.now(),
        nullable=False,
    )


class AlarmSiteContact(Base):
    __tablename__ = "alarm_site_contacts"
    __table_args__ = (
        UniqueConstraint("site_id", "priority", name="uq_alarm_site_contact_priority"),
    )

    id = Column(String, primary_key=True, default=new_id, index=True)
    site_id = Column(
        String,
        ForeignKey("alarm_sites.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    full_name = Column(String(180), nullable=False)
    relationship = Column(String(100), nullable=True)
    phone_number = Column(String(40), nullable=False)
    alternative_phone = Column(String(40), nullable=True)
    email = Column(String(180), nullable=True)
    priority = Column(Integer, nullable=False, default=1)
    notify_by_sms = Column(Boolean, nullable=False, default=True)
    notify_by_email = Column(Boolean, nullable=False, default=False)
    is_keyholder = Column(Boolean, nullable=False, default=True)
    notes = Column(Text, nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)
    updated_at = Column(
        DateTime(timezone=True),
        server_default=func.now(),
        onupdate=func.now(),
        nullable=False,
    )


class AlarmResponseUnit(Base):
    __tablename__ = "alarm_response_units"

    id = Column(String, primary_key=True, default=new_id, index=True)
    unit_code = Column(String(60), unique=True, nullable=False, index=True)
    name = Column(String(160), nullable=False)
    phone_number = Column(String(40), nullable=True)
    vehicle_registration = Column(String(40), nullable=True)
    status = Column(String(30), nullable=False, default="available", index=True)
    latitude = Column(Float, nullable=True)
    longitude = Column(Float, nullable=True)
    last_seen_at = Column(DateTime(timezone=True), nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)
    updated_at = Column(
        DateTime(timezone=True),
        server_default=func.now(),
        onupdate=func.now(),
        nullable=False,
    )


class AlarmRule(Base):
    __tablename__ = "alarm_rules"
    __table_args__ = (
        UniqueConstraint("source_type", "event_type", name="uq_alarm_rule_source_event"),
    )

    id = Column(String, primary_key=True, default=new_id, index=True)
    name = Column(String(180), nullable=False)
    source_type = Column(String(40), nullable=False, index=True)
    event_type = Column(String(80), nullable=False, index=True)
    severity = Column(String(20), nullable=False, default="medium")
    enabled = Column(Boolean, nullable=False, default=True, index=True)
    cooldown_seconds = Column(Integer, nullable=False, default=300)
    conditions_json = Column(JSON, nullable=False, default=dict)
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


class Alarm(Base):
    __tablename__ = "alarms"
    __table_args__ = (
        UniqueConstraint(
            "source_type",
            "source_record_id",
            name="uq_alarm_source_record",
        ),
    )

    id = Column(String, primary_key=True, default=new_id, index=True)
    alarm_number = Column(String(40), unique=True, nullable=False, index=True)
    source_type = Column(String(40), nullable=False, index=True)
    source_record_id = Column(String(180), nullable=True, index=True)
    external_event_id = Column(String(180), nullable=True, index=True)
    site_id = Column(
        String,
        ForeignKey("alarm_sites.id", ondelete="SET NULL"),
        nullable=True,
        index=True,
    )
    panel_id = Column(
        String,
        ForeignKey("alarm_panels.id", ondelete="SET NULL"),
        nullable=True,
        index=True,
    )
    zone_id = Column(
        String,
        ForeignKey("alarm_zones.id", ondelete="SET NULL"),
        nullable=True,
        index=True,
    )
    vehicle_id = Column(String, nullable=True, index=True)
    case_id = Column(String, nullable=True, index=True)
    alarm_type = Column(String(80), nullable=False, index=True)
    event_code = Column(String(40), nullable=True)
    title = Column(String(220), nullable=False)
    description = Column(Text, nullable=True)
    severity = Column(String(20), nullable=False, default="medium", index=True)
    status = Column(String(30), nullable=False, default="active", index=True)
    latitude = Column(Float, nullable=True)
    longitude = Column(Float, nullable=True)
    triggered_at = Column(DateTime(timezone=True), nullable=False, index=True)
    received_at = Column(
        DateTime(timezone=True), server_default=func.now(), nullable=False, index=True
    )
    acknowledged_at = Column(DateTime(timezone=True), nullable=True)
    acknowledged_by_operator_id = Column(
        String,
        ForeignKey("operators.id", ondelete="SET NULL"),
        nullable=True,
        index=True,
    )
    dispatched_at = Column(DateTime(timezone=True), nullable=True)
    dispatched_by_operator_id = Column(
        String,
        ForeignKey("operators.id", ondelete="SET NULL"),
        nullable=True,
        index=True,
    )
    response_unit_id = Column(
        String,
        ForeignKey("alarm_response_units.id", ondelete="SET NULL"),
        nullable=True,
        index=True,
    )
    response_notes = Column(Text, nullable=True)
    responding_at = Column(DateTime(timezone=True), nullable=True)
    resolved_at = Column(DateTime(timezone=True), nullable=True)
    resolved_by_operator_id = Column(
        String,
        ForeignKey("operators.id", ondelete="SET NULL"),
        nullable=True,
        index=True,
    )
    resolution_notes = Column(Text, nullable=True)
    closed_at = Column(DateTime(timezone=True), nullable=True)
    closed_by_operator_id = Column(
        String,
        ForeignKey("operators.id", ondelete="SET NULL"),
        nullable=True,
        index=True,
    )
    metadata_json = Column(JSON, nullable=False, default=dict)
    created_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)
    updated_at = Column(
        DateTime(timezone=True),
        server_default=func.now(),
        onupdate=func.now(),
        nullable=False,
    )


class AlarmAudit(Base):
    __tablename__ = "alarm_audit"

    id = Column(String, primary_key=True, default=new_id, index=True)
    alarm_id = Column(
        String,
        ForeignKey("alarms.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    action = Column(String(80), nullable=False, index=True)
    from_status = Column(String(30), nullable=True)
    to_status = Column(String(30), nullable=True)
    operator_id = Column(
        String,
        ForeignKey("operators.id", ondelete="SET NULL"),
        nullable=True,
        index=True,
    )
    notes = Column(Text, nullable=True)
    details_json = Column(JSON, nullable=False, default=dict)
    created_at = Column(
        DateTime(timezone=True), server_default=func.now(), nullable=False, index=True
    )


class AlarmNotification(Base):
    __tablename__ = "alarm_notifications"

    id = Column(String, primary_key=True, default=new_id, index=True)
    alarm_id = Column(
        String,
        ForeignKey("alarms.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    channel = Column(String(30), nullable=False, index=True)
    recipient = Column(String(220), nullable=False, index=True)
    status = Column(String(30), nullable=False, default="queued", index=True)
    attempt_count = Column(Integer, nullable=False, default=0)
    subject = Column(String(240), nullable=True)
    message = Column(Text, nullable=False)
    payload_json = Column(JSON, nullable=False, default=dict)
    last_error = Column(Text, nullable=True)
    queued_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)
    sent_at = Column(DateTime(timezone=True), nullable=True)
    updated_at = Column(
        DateTime(timezone=True),
        server_default=func.now(),
        onupdate=func.now(),
        nullable=False,
    )


ALARM_TABLES = [
    AlarmSite.__table__,
    AlarmPanel.__table__,
    AlarmZone.__table__,
    AlarmSiteContact.__table__,
    AlarmResponseUnit.__table__,
    AlarmRule.__table__,
    Alarm.__table__,
    AlarmAudit.__table__,
    AlarmNotification.__table__,
]
