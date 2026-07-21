"""Pydantic schemas for GuardFlow Universal Alarm System."""

from __future__ import annotations

from datetime import datetime
from typing import Any, Literal

from pydantic import BaseModel, ConfigDict, Field, field_validator

Severity = Literal["low", "medium", "high", "critical"]
SiteType = Literal["household", "business", "industrial", "railway", "other"]
AlarmSource = Literal[
    "vehicle",
    "mobile_sos",
    "household",
    "business",
    "railway",
    "vision",
    "manual",
    "system",
    "radio",
]
AlarmStatus = Literal[
    "active",
    "acknowledged",
    "dispatched",
    "responding",
    "resolved",
    "closed",
    "cancelled",
    "false_alarm",
]


class ORMModel(BaseModel):
    model_config = ConfigDict(from_attributes=True)


class SiteCreate(BaseModel):
    account_number: str = Field(min_length=2, max_length=60)
    client_name: str = Field(min_length=2, max_length=180)
    site_name: str = Field(min_length=2, max_length=180)
    site_type: SiteType = "household"
    address_line_1: str = Field(min_length=2, max_length=220)
    address_line_2: str | None = Field(default=None, max_length=220)
    suburb: str | None = Field(default=None, max_length=120)
    city: str | None = Field(default=None, max_length=120)
    province: str | None = Field(default=None, max_length=120)
    postal_code: str | None = Field(default=None, max_length=20)
    latitude: float | None = Field(default=None, ge=-90, le=90)
    longitude: float | None = Field(default=None, ge=-180, le=180)
    case_id: str | None = None
    response_instructions: str | None = Field(default=None, max_length=4000)
    access_notes: str | None = Field(default=None, max_length=4000)

    @field_validator(
        "account_number",
        "client_name",
        "site_name",
        "address_line_1",
        mode="before",
    )
    @classmethod
    def strip_required(cls, value: Any) -> str:
        clean = str(value or "").strip()
        if not clean:
            raise ValueError("This field cannot be empty.")
        return clean


class SiteUpdate(BaseModel):
    client_name: str | None = Field(default=None, min_length=2, max_length=180)
    site_name: str | None = Field(default=None, min_length=2, max_length=180)
    site_type: SiteType | None = None
    status: Literal["active", "suspended", "closed"] | None = None
    armed_state: Literal["armed_away", "armed_stay", "disarmed", "unknown"] | None = None
    address_line_1: str | None = Field(default=None, min_length=2, max_length=220)
    address_line_2: str | None = Field(default=None, max_length=220)
    suburb: str | None = Field(default=None, max_length=120)
    city: str | None = Field(default=None, max_length=120)
    province: str | None = Field(default=None, max_length=120)
    postal_code: str | None = Field(default=None, max_length=20)
    latitude: float | None = Field(default=None, ge=-90, le=90)
    longitude: float | None = Field(default=None, ge=-180, le=180)
    case_id: str | None = None
    response_instructions: str | None = Field(default=None, max_length=4000)
    access_notes: str | None = Field(default=None, max_length=4000)


class SiteOut(ORMModel):
    id: str
    account_number: str
    client_name: str
    site_name: str
    site_type: str
    status: str
    armed_state: str
    address_line_1: str
    address_line_2: str | None = None
    suburb: str | None = None
    city: str | None = None
    province: str | None = None
    postal_code: str | None = None
    latitude: float | None = None
    longitude: float | None = None
    case_id: str | None = None
    response_instructions: str | None = None
    access_notes: str | None = None
    created_by_operator_id: str | None = None
    created_at: datetime
    updated_at: datetime


class PanelCreate(BaseModel):
    site_id: str
    panel_identifier: str = Field(min_length=3, max_length=120)
    manufacturer: str | None = Field(default=None, max_length=100)
    model: str | None = Field(default=None, max_length=100)
    serial_number: str | None = Field(default=None, max_length=120)
    protocol: Literal["json", "contact_id", "sia_dc09", "mqtt", "manual"] = "json"
    receiver_name: str | None = Field(default=None, max_length=120)
    metadata_json: dict[str, Any] = Field(default_factory=dict)

    @field_validator("panel_identifier")
    @classmethod
    def normalise_identifier(cls, value: str) -> str:
        return value.strip().upper()


class PanelOut(ORMModel):
    id: str
    site_id: str
    panel_identifier: str
    manufacturer: str | None = None
    model: str | None = None
    serial_number: str | None = None
    protocol: str
    receiver_name: str | None = None
    status: str
    last_seen_at: datetime | None = None
    metadata_json: dict[str, Any] = Field(default_factory=dict)
    created_at: datetime
    updated_at: datetime


class PanelRegistrationResult(BaseModel):
    panel: PanelOut
    integration_key: str
    warning: str = (
        "Store this key in the approved panel receiver or gateway now. "
        "GuardFlow stores only its SHA-256 hash and cannot show it again."
    )


class ZoneCreate(BaseModel):
    panel_id: str
    zone_number: str = Field(min_length=1, max_length=30)
    name: str = Field(min_length=1, max_length=160)
    zone_type: Literal[
        "intrusion",
        "door",
        "window",
        "motion",
        "glass_break",
        "panic",
        "duress",
        "fire",
        "smoke",
        "heat",
        "medical",
        "tamper",
        "power",
        "battery",
        "communications",
        "other",
    ] = "intrusion"
    partition: str | None = Field(default=None, max_length=30)
    severity_override: Severity | None = None
    notes: str | None = Field(default=None, max_length=2000)


class ZoneUpdate(BaseModel):
    name: str | None = Field(default=None, min_length=1, max_length=160)
    zone_type: str | None = Field(default=None, max_length=40)
    partition: str | None = Field(default=None, max_length=30)
    severity_override: Severity | None = None
    is_enabled: bool | None = None
    is_bypassed: bool | None = None
    notes: str | None = Field(default=None, max_length=2000)


class ZoneOut(ORMModel):
    id: str
    panel_id: str
    zone_number: str
    name: str
    zone_type: str
    partition: str | None = None
    severity_override: str | None = None
    is_enabled: bool
    is_bypassed: bool
    notes: str | None = None
    created_at: datetime
    updated_at: datetime


class ContactCreate(BaseModel):
    site_id: str
    full_name: str = Field(min_length=2, max_length=180)
    relationship: str | None = Field(default=None, max_length=100)
    phone_number: str = Field(min_length=5, max_length=40)
    alternative_phone: str | None = Field(default=None, max_length=40)
    email: str | None = Field(default=None, max_length=180)
    priority: int = Field(default=1, ge=1, le=20)
    notify_by_sms: bool = True
    notify_by_email: bool = False
    is_keyholder: bool = True
    notes: str | None = Field(default=None, max_length=2000)


class ContactOut(ORMModel):
    id: str
    site_id: str
    full_name: str
    relationship: str | None = None
    phone_number: str
    alternative_phone: str | None = None
    email: str | None = None
    priority: int
    notify_by_sms: bool
    notify_by_email: bool
    is_keyholder: bool
    notes: str | None = None
    created_at: datetime
    updated_at: datetime


class ResponseUnitCreate(BaseModel):
    unit_code: str = Field(min_length=2, max_length=60)
    name: str = Field(min_length=2, max_length=160)
    phone_number: str | None = Field(default=None, max_length=40)
    vehicle_registration: str | None = Field(default=None, max_length=40)

    @field_validator("unit_code")
    @classmethod
    def normalise_code(cls, value: str) -> str:
        return value.strip().upper()


class ResponseUnitUpdate(BaseModel):
    name: str | None = Field(default=None, min_length=2, max_length=160)
    phone_number: str | None = Field(default=None, max_length=40)
    vehicle_registration: str | None = Field(default=None, max_length=40)
    status: Literal["available", "assigned", "responding", "offline"] | None = None
    latitude: float | None = Field(default=None, ge=-90, le=90)
    longitude: float | None = Field(default=None, ge=-180, le=180)


class ResponseUnitOut(ORMModel):
    id: str
    unit_code: str
    name: str
    phone_number: str | None = None
    vehicle_registration: str | None = None
    status: str
    latitude: float | None = None
    longitude: float | None = None
    last_seen_at: datetime | None = None
    created_at: datetime
    updated_at: datetime


class RuleCreate(BaseModel):
    name: str = Field(min_length=2, max_length=180)
    source_type: str = Field(min_length=2, max_length=40)
    event_type: str = Field(min_length=2, max_length=80)
    severity: Severity = "medium"
    enabled: bool = True
    cooldown_seconds: int = Field(default=300, ge=0, le=86400)
    conditions_json: dict[str, Any] = Field(default_factory=dict)


class RuleUpdate(BaseModel):
    name: str | None = Field(default=None, min_length=2, max_length=180)
    severity: Severity | None = None
    enabled: bool | None = None
    cooldown_seconds: int | None = Field(default=None, ge=0, le=86400)
    conditions_json: dict[str, Any] | None = None


class RuleOut(ORMModel):
    id: str
    name: str
    source_type: str
    event_type: str
    severity: str
    enabled: bool
    cooldown_seconds: int
    conditions_json: dict[str, Any] = Field(default_factory=dict)
    created_by_operator_id: str | None = None
    created_at: datetime
    updated_at: datetime


class ManualAlarmCreate(BaseModel):
    source_type: AlarmSource = "manual"
    alarm_type: str = Field(min_length=2, max_length=80)
    title: str = Field(min_length=2, max_length=220)
    description: str | None = Field(default=None, max_length=4000)
    severity: Severity = "high"
    site_id: str | None = None
    panel_id: str | None = None
    zone_id: str | None = None
    vehicle_id: str | None = None
    case_id: str | None = None
    latitude: float | None = Field(default=None, ge=-90, le=90)
    longitude: float | None = Field(default=None, ge=-180, le=180)
    triggered_at: datetime | None = None
    metadata_json: dict[str, Any] = Field(default_factory=dict)


class InternalAlarmEvent(BaseModel):
    source_type: Literal["vehicle", "railway", "vision", "system"]
    source_record_id: str | None = Field(default=None, max_length=180)
    external_event_id: str | None = Field(default=None, max_length=180)
    event_type: str = Field(min_length=2, max_length=80)
    title: str = Field(min_length=2, max_length=220)
    description: str | None = Field(default=None, max_length=4000)
    severity: Severity | None = None
    vehicle_id: str | None = None
    case_id: str | None = None
    latitude: float | None = Field(default=None, ge=-90, le=90)
    longitude: float | None = Field(default=None, ge=-180, le=180)
    triggered_at: datetime | None = None
    dedupe_key: str | None = Field(default=None, max_length=240)
    metadata_json: dict[str, Any] = Field(default_factory=dict)


class PanelEventIn(BaseModel):
    event_id: str | None = Field(default=None, max_length=180)
    event_type: str | None = Field(default=None, max_length=80)
    event_code: str | None = Field(default=None, max_length=40)
    qualifier: str | None = Field(default=None, max_length=40)
    zone_number: str | None = Field(default=None, max_length=30)
    partition: str | None = Field(default=None, max_length=30)
    description: str | None = Field(default=None, max_length=4000)
    occurred_at: datetime | None = None
    latitude: float | None = Field(default=None, ge=-90, le=90)
    longitude: float | None = Field(default=None, ge=-180, le=180)
    raw_payload: dict[str, Any] = Field(default_factory=dict)


class AlarmAction(BaseModel):
    notes: str | None = Field(default=None, max_length=4000)
    response_unit_id: str | None = None


class AlarmOut(ORMModel):
    id: str
    alarm_number: str
    source_type: str
    source_record_id: str | None = None
    external_event_id: str | None = None
    site_id: str | None = None
    panel_id: str | None = None
    zone_id: str | None = None
    vehicle_id: str | None = None
    case_id: str | None = None
    alarm_type: str
    event_code: str | None = None
    title: str
    description: str | None = None
    severity: str
    status: str
    latitude: float | None = None
    longitude: float | None = None
    triggered_at: datetime
    received_at: datetime
    acknowledged_at: datetime | None = None
    acknowledged_by_operator_id: str | None = None
    dispatched_at: datetime | None = None
    dispatched_by_operator_id: str | None = None
    response_unit_id: str | None = None
    response_notes: str | None = None
    responding_at: datetime | None = None
    resolved_at: datetime | None = None
    resolved_by_operator_id: str | None = None
    resolution_notes: str | None = None
    closed_at: datetime | None = None
    closed_by_operator_id: str | None = None
    metadata_json: dict[str, Any] = Field(default_factory=dict)
    created_at: datetime
    updated_at: datetime


class AlarmDetailOut(AlarmOut):
    site: SiteOut | None = None
    panel: PanelOut | None = None
    zone: ZoneOut | None = None
    response_unit: ResponseUnitOut | None = None
    site_contacts: list[ContactOut] = Field(default_factory=list)


class AlarmAuditOut(ORMModel):
    id: str
    alarm_id: str
    action: str
    from_status: str | None = None
    to_status: str | None = None
    operator_id: str | None = None
    notes: str | None = None
    details_json: dict[str, Any] = Field(default_factory=dict)
    created_at: datetime


class AlarmMetrics(BaseModel):
    total_open: int
    critical: int
    high: int
    medium: int
    low: int
    unacknowledged: int
    dispatched: int
    responding: int
    sites_online: int
    panels_offline: int


class PanelEventResult(BaseModel):
    accepted: bool = True
    action: Literal["alarm_created", "state_updated", "alarm_restored", "duplicate"]
    alarm: AlarmOut | None = None
    site_armed_state: str | None = None
    detail: str


class NotificationOut(ORMModel):
    id: str
    alarm_id: str
    channel: str
    recipient: str
    status: str
    attempt_count: int
    subject: str | None = None
    message: str
    payload_json: dict[str, Any] = Field(default_factory=dict)
    last_error: str | None = None
    queued_at: datetime
    sent_at: datetime | None = None
    updated_at: datetime


class NotificationProcessResult(BaseModel):
    processed: int
    sent: int
    failed: int
