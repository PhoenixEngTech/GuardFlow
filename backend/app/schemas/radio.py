"""Pydantic schemas for GuardFlow Radio Dispatch."""

from __future__ import annotations

from datetime import datetime
from typing import Any, Literal

from pydantic import BaseModel, ConfigDict, Field, field_validator, model_validator

NetworkType = Literal["poc", "dmr", "tetra", "mcx", "analog_roip", "other"]
RadioStatus = Literal["online", "offline", "busy", "emergency", "disabled"]
DispatchStatus = Literal[
    "queued", "sent", "accepted", "en_route", "on_scene", "clear", "cancelled", "failed"
]
Priority = Literal["low", "medium", "high", "critical"]


class ORMModel(BaseModel):
    model_config = ConfigDict(from_attributes=True)


class GatewayCreate(BaseModel):
    gateway_identifier: str = Field(min_length=3, max_length=120)
    name: str = Field(min_length=2, max_length=180)
    gateway_type: NetworkType = "poc"
    vendor: str | None = Field(default=None, max_length=120)
    model: str | None = Field(default=None, max_length=120)
    capabilities_json: dict[str, Any] = Field(default_factory=dict)
    metadata_json: dict[str, Any] = Field(default_factory=dict)

    @field_validator("gateway_identifier")
    @classmethod
    def normalise_identifier(cls, value: str) -> str:
        return value.strip().upper()


class GatewayOut(ORMModel):
    id: str
    gateway_identifier: str
    name: str
    gateway_type: str
    vendor: str | None = None
    model: str | None = None
    status: str
    last_seen_at: datetime | None = None
    capabilities_json: dict[str, Any]
    metadata_json: dict[str, Any]
    created_by_operator_id: str | None = None
    created_at: datetime
    updated_at: datetime


class GatewayRegistrationResult(BaseModel):
    gateway: GatewayOut
    integration_key: str
    warning: str = (
        "Store this key in the approved radio gateway now. GuardFlow stores only "
        "its SHA-256 hash and cannot display it again."
    )


class TalkGroupCreate(BaseModel):
    code: str = Field(min_length=2, max_length=80)
    name: str = Field(min_length=2, max_length=180)
    network_type: NetworkType = "poc"
    external_group_id: str | None = Field(default=None, max_length=180)
    priority: int = Field(default=5, ge=1, le=10)
    description: str | None = Field(default=None, max_length=2000)

    @field_validator("code")
    @classmethod
    def normalise_code(cls, value: str) -> str:
        return value.strip().upper()


class TalkGroupOut(ORMModel):
    id: str
    code: str
    name: str
    network_type: str
    external_group_id: str | None = None
    priority: int
    is_active: bool
    description: str | None = None
    created_by_operator_id: str | None = None
    created_at: datetime
    updated_at: datetime


class DeviceCreate(BaseModel):
    radio_identifier: str = Field(min_length=2, max_length=120)
    callsign: str = Field(min_length=2, max_length=100)
    network_type: NetworkType = "poc"
    vendor: str | None = Field(default=None, max_length=120)
    model: str | None = Field(default=None, max_length=120)
    serial_number: str | None = Field(default=None, max_length=160)
    imei: str | None = Field(default=None, max_length=40)
    gateway_id: str | None = None
    primary_talkgroup_id: str | None = None
    assigned_operator_id: str | None = None
    assigned_response_unit_id: str | None = None
    vehicle_registration: str | None = Field(default=None, max_length=50)
    capabilities_json: dict[str, Any] = Field(default_factory=dict)
    metadata_json: dict[str, Any] = Field(default_factory=dict)

    @field_validator("radio_identifier", "callsign")
    @classmethod
    def normalise_identity(cls, value: str) -> str:
        return value.strip().upper()


class DeviceUpdate(BaseModel):
    callsign: str | None = Field(default=None, min_length=2, max_length=100)
    status: RadioStatus | None = None
    gateway_id: str | None = None
    primary_talkgroup_id: str | None = None
    assigned_operator_id: str | None = None
    assigned_response_unit_id: str | None = None
    vehicle_registration: str | None = Field(default=None, max_length=50)
    capabilities_json: dict[str, Any] | None = None
    metadata_json: dict[str, Any] | None = None


class DeviceOut(ORMModel):
    id: str
    radio_identifier: str
    callsign: str
    network_type: str
    vendor: str | None = None
    model: str | None = None
    serial_number: str | None = None
    imei: str | None = None
    gateway_id: str | None = None
    primary_talkgroup_id: str | None = None
    assigned_operator_id: str | None = None
    assigned_response_unit_id: str | None = None
    vehicle_registration: str | None = None
    status: str
    emergency_state: str
    latitude: float | None = None
    longitude: float | None = None
    accuracy_metres: float | None = None
    speed_kmh: float | None = None
    heading_degrees: float | None = None
    battery_percentage: int | None = None
    signal_strength: int | None = None
    last_seen_at: datetime | None = None
    capabilities_json: dict[str, Any]
    metadata_json: dict[str, Any]
    created_at: datetime
    updated_at: datetime


class TalkGroupMemberCreate(BaseModel):
    radio_id: str


class LocationUpdate(BaseModel):
    latitude: float = Field(ge=-90, le=90)
    longitude: float = Field(ge=-180, le=180)
    accuracy_metres: float | None = Field(default=None, ge=0)
    speed_kmh: float | None = Field(default=None, ge=0)
    heading_degrees: float | None = Field(default=None, ge=0, le=360)
    battery_percentage: int | None = Field(default=None, ge=0, le=100)
    signal_strength: int | None = Field(default=None, ge=0, le=100)
    occurred_at: datetime | None = None


class DispatchCreate(BaseModel):
    alarm_id: str | None = None
    case_id: str | None = None
    title: str = Field(min_length=2, max_length=220)
    message: str = Field(min_length=2, max_length=4000)
    priority: Priority = "high"
    radio_id: str | None = None
    talkgroup_id: str | None = None
    response_unit_id: str | None = None
    latitude: float | None = Field(default=None, ge=-90, le=90)
    longitude: float | None = Field(default=None, ge=-180, le=180)

    @model_validator(mode="after")
    def require_destination(self):
        if not self.radio_id and not self.talkgroup_id:
            raise ValueError("Select a radio or talk group destination.")
        return self


class DispatchOut(ORMModel):
    id: str
    dispatch_number: str
    alarm_id: str | None = None
    case_id: str | None = None
    title: str
    message: str
    priority: str
    status: str
    radio_id: str | None = None
    talkgroup_id: str | None = None
    response_unit_id: str | None = None
    latitude: float | None = None
    longitude: float | None = None
    created_by_operator_id: str | None = None
    accepted_by_radio_id: str | None = None
    created_at: datetime
    sent_at: datetime | None = None
    accepted_at: datetime | None = None
    en_route_at: datetime | None = None
    on_scene_at: datetime | None = None
    cleared_at: datetime | None = None
    updated_at: datetime


class DispatchStatusUpdate(BaseModel):
    status: DispatchStatus
    radio_identifier: str | None = Field(default=None, max_length=120)
    notes: str | None = Field(default=None, max_length=2000)


class GatewayEventIn(BaseModel):
    external_event_id: str = Field(min_length=2, max_length=180)
    radio_identifier: str = Field(min_length=2, max_length=120)
    event_type: Literal[
        "heartbeat", "location", "emergency", "emergency_clear", "status",
        "ptt_start", "ptt_end", "message", "dispatch_status", "battery_low"
    ]
    occurred_at: datetime | None = None
    emergency_type: str | None = Field(default=None, max_length=60)
    message: str | None = Field(default=None, max_length=4000)
    dispatch_id: str | None = None
    dispatch_status: DispatchStatus | None = None
    latitude: float | None = Field(default=None, ge=-90, le=90)
    longitude: float | None = Field(default=None, ge=-180, le=180)
    accuracy_metres: float | None = Field(default=None, ge=0)
    speed_kmh: float | None = Field(default=None, ge=0)
    heading_degrees: float | None = Field(default=None, ge=0, le=360)
    battery_percentage: int | None = Field(default=None, ge=0, le=100)
    signal_strength: int | None = Field(default=None, ge=0, le=100)
    metadata: dict[str, Any] = Field(default_factory=dict)

    @field_validator("radio_identifier")
    @classmethod
    def normalise_radio_id(cls, value: str) -> str:
        return value.strip().upper()


class GatewayEventResult(BaseModel):
    accepted: bool
    duplicate: bool = False
    radio_id: str | None = None
    event_id: str | None = None
    alarm_id: str | None = None
    dispatch_id: str | None = None


class CommandOut(ORMModel):
    id: str
    gateway_id: str
    dispatch_id: str | None = None
    radio_id: str | None = None
    talkgroup_id: str | None = None
    command_type: str
    status: str
    payload_json: dict[str, Any]
    result_json: dict[str, Any]
    attempt_count: int
    created_at: datetime
    delivered_at: datetime | None = None
    completed_at: datetime | None = None
    updated_at: datetime


class CommandResult(BaseModel):
    status: Literal["completed", "failed"]
    result_json: dict[str, Any] = Field(default_factory=dict)


class EventOut(ORMModel):
    id: str
    gateway_id: str
    radio_id: str | None = None
    dispatch_id: str | None = None
    external_event_id: str
    event_type: str
    emergency_type: str | None = None
    message: str | None = None
    latitude: float | None = None
    longitude: float | None = None
    battery_percentage: int | None = None
    occurred_at: datetime
    received_at: datetime
    payload_json: dict[str, Any]


class RadioMetrics(BaseModel):
    total_radios: int
    online_radios: int
    offline_radios: int
    emergency_radios: int
    open_dispatches: int
    online_gateways: int
