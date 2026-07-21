"""Core GuardFlow radio event normalisation and dispatch services."""

from __future__ import annotations

import hashlib
import hmac
import secrets
from datetime import datetime, timezone
from typing import Any

from fastapi import HTTPException, status
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.models.radio import (
    RadioCommand,
    RadioDevice,
    RadioDispatch,
    RadioEvent,
    RadioGateway,
    RadioTalkGroup,
)

OPEN_DISPATCH_STATUSES = {"queued", "sent", "accepted", "en_route", "on_scene"}
DISPATCH_TRANSITIONS: dict[str, set[str]] = {
    "queued": {"sent", "cancelled", "failed"},
    "sent": {"accepted", "en_route", "on_scene", "clear", "cancelled", "failed"},
    "accepted": {"en_route", "on_scene", "clear", "cancelled", "failed"},
    "en_route": {"on_scene", "clear", "cancelled", "failed"},
    "on_scene": {"clear", "cancelled", "failed"},
    "clear": set(),
    "cancelled": set(),
    "failed": set(),
}


def utc_now() -> datetime:
    return datetime.now(timezone.utc)


def generate_gateway_key() -> str:
    return secrets.token_urlsafe(48)


def hash_gateway_key(value: str) -> str:
    return hashlib.sha256(value.encode("utf-8")).hexdigest()


def verify_gateway_key(value: str, expected_hash: str) -> bool:
    return hmac.compare_digest(hash_gateway_key(value), expected_hash)


def generate_dispatch_number(now: datetime | None = None) -> str:
    moment = now or utc_now()
    return f"GF-RD-{moment:%Y%m%d}-{secrets.token_hex(3).upper()}"


def get_gateway_by_identifier(db: Session, gateway_identifier: str) -> RadioGateway:
    gateway = (
        db.query(RadioGateway)
        .filter(RadioGateway.gateway_identifier == gateway_identifier.strip().upper())
        .first()
    )
    if gateway is None:
        raise HTTPException(status_code=404, detail="Radio gateway not found.")
    return gateway


def get_radio_or_404(db: Session, radio_id: str) -> RadioDevice:
    radio = db.query(RadioDevice).filter(RadioDevice.id == radio_id).first()
    if radio is None:
        raise HTTPException(status_code=404, detail="Radio device not found.")
    return radio


def get_radio_by_identifier(db: Session, radio_identifier: str) -> RadioDevice:
    radio = (
        db.query(RadioDevice)
        .filter(RadioDevice.radio_identifier == radio_identifier.strip().upper())
        .first()
    )
    if radio is None:
        raise HTTPException(
            status_code=404,
            detail="Radio device is not registered in GuardFlow.",
        )
    return radio


def get_talkgroup_or_404(db: Session, talkgroup_id: str) -> RadioTalkGroup:
    talkgroup = (
        db.query(RadioTalkGroup).filter(RadioTalkGroup.id == talkgroup_id).first()
    )
    if talkgroup is None:
        raise HTTPException(status_code=404, detail="Radio talk group not found.")
    return talkgroup


def get_dispatch_or_404(db: Session, dispatch_id: str, *, lock: bool = False) -> RadioDispatch:
    query = db.query(RadioDispatch).filter(RadioDispatch.id == dispatch_id)
    if lock:
        query = query.with_for_update()
    dispatch = query.first()
    if dispatch is None:
        raise HTTPException(status_code=404, detail="Radio dispatch not found.")
    return dispatch


def resolve_destination_gateway(
    db: Session,
    *,
    radio_id: str | None,
    talkgroup_id: str | None,
) -> RadioGateway:
    if radio_id:
        radio = get_radio_or_404(db, radio_id)
        if not radio.gateway_id:
            raise HTTPException(
                status_code=422,
                detail="The selected radio is not linked to a gateway.",
            )
        gateway = db.query(RadioGateway).filter(RadioGateway.id == radio.gateway_id).first()
        if gateway is None:
            raise HTTPException(status_code=422, detail="The radio gateway no longer exists.")
        return gateway

    talkgroup = get_talkgroup_or_404(db, str(talkgroup_id))
    query = (
        db.query(RadioGateway)
        .join(RadioDevice, RadioDevice.gateway_id == RadioGateway.id)
        .filter(RadioDevice.primary_talkgroup_id == talkgroup.id)
        .order_by(RadioGateway.last_seen_at.desc().nullslast())
    )
    gateway = query.first()
    if gateway is None:
        raise HTTPException(
            status_code=422,
            detail="No gateway is linked to a radio in the selected talk group.",
        )
    return gateway


def create_dispatch(
    db: Session,
    payload: Any,
    *,
    operator_id: str,
) -> RadioDispatch:
    gateway = resolve_destination_gateway(
        db,
        radio_id=payload.radio_id,
        talkgroup_id=payload.talkgroup_id,
    )
    dispatch = RadioDispatch(
        dispatch_number=generate_dispatch_number(),
        alarm_id=payload.alarm_id,
        case_id=payload.case_id,
        title=payload.title.strip(),
        message=payload.message.strip(),
        priority=payload.priority,
        status="queued",
        radio_id=payload.radio_id,
        talkgroup_id=payload.talkgroup_id,
        response_unit_id=payload.response_unit_id,
        latitude=payload.latitude,
        longitude=payload.longitude,
        created_by_operator_id=operator_id,
    )
    db.add(dispatch)
    db.flush()

    command = RadioCommand(
        gateway_id=gateway.id,
        dispatch_id=dispatch.id,
        radio_id=dispatch.radio_id,
        talkgroup_id=dispatch.talkgroup_id,
        command_type="dispatch",
        payload_json={
            "dispatch_id": dispatch.id,
            "dispatch_number": dispatch.dispatch_number,
            "title": dispatch.title,
            "message": dispatch.message,
            "priority": dispatch.priority,
            "alarm_id": dispatch.alarm_id,
            "case_id": dispatch.case_id,
            "latitude": dispatch.latitude,
            "longitude": dispatch.longitude,
        },
    )
    db.add(command)
    db.commit()
    db.refresh(dispatch)
    return dispatch


def transition_dispatch(
    db: Session,
    dispatch: RadioDispatch,
    new_status: str,
    *,
    radio_id: str | None = None,
) -> RadioDispatch:
    current = dispatch.status
    if new_status == current:
        return dispatch
    if new_status not in DISPATCH_TRANSITIONS.get(current, set()):
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=f"Radio dispatch cannot move from {current} to {new_status}.",
        )

    now = utc_now()
    dispatch.status = new_status
    if radio_id:
        dispatch.accepted_by_radio_id = radio_id
    if new_status == "sent":
        dispatch.sent_at = now
    elif new_status == "accepted":
        dispatch.accepted_at = now
    elif new_status == "en_route":
        dispatch.en_route_at = now
    elif new_status == "on_scene":
        dispatch.on_scene_at = now
    elif new_status == "clear":
        dispatch.cleared_at = now

    db.commit()
    db.refresh(dispatch)
    return dispatch


def _create_radio_alarm(
    db: Session,
    *,
    event: RadioEvent,
    radio: RadioDevice,
) -> str | None:
    try:
        from app.services.alarm_service import create_alarm
    except Exception:
        return None

    emergency_type = (event.emergency_type or "radio_emergency").strip().lower()
    title = f"Radio emergency — {radio.callsign}"
    description = event.message or (
        f"Emergency button activated on {radio.network_type.upper()} radio "
        f"{radio.radio_identifier}."
    )
    alarm = create_alarm(
        db,
        source_type="radio",
        source_record_id=f"radio-event:{event.id}",
        external_event_id=event.external_event_id,
        alarm_type=emergency_type,
        title=title,
        description=description,
        severity="critical",
        latitude=event.latitude if event.latitude is not None else radio.latitude,
        longitude=event.longitude if event.longitude is not None else radio.longitude,
        metadata={
            "radio_id": radio.id,
            "radio_identifier": radio.radio_identifier,
            "callsign": radio.callsign,
            "network_type": radio.network_type,
            "gateway_id": event.gateway_id,
        },
        commit=False,
    )
    return alarm.id


def process_gateway_event(
    db: Session,
    *,
    gateway: RadioGateway,
    payload: Any,
) -> dict[str, Any]:
    existing = (
        db.query(RadioEvent)
        .filter(
            RadioEvent.gateway_id == gateway.id,
            RadioEvent.external_event_id == payload.external_event_id,
        )
        .first()
    )
    if existing is not None:
        return {
            "accepted": True,
            "duplicate": True,
            "radio_id": existing.radio_id,
            "event_id": existing.id,
            "dispatch_id": existing.dispatch_id,
        }

    radio = get_radio_by_identifier(db, payload.radio_identifier)
    if radio.gateway_id and radio.gateway_id != gateway.id:
        raise HTTPException(
            status_code=403,
            detail="This radio is registered to a different gateway.",
        )
    if not radio.gateway_id:
        radio.gateway_id = gateway.id

    now = utc_now()
    occurred_at = payload.occurred_at or now
    gateway.status = "online"
    gateway.last_seen_at = now
    radio.last_seen_at = now
    if radio.status != "disabled":
        radio.status = "online"

    for name in (
        "latitude",
        "longitude",
        "accuracy_metres",
        "speed_kmh",
        "heading_degrees",
        "battery_percentage",
        "signal_strength",
    ):
        value = getattr(payload, name, None)
        if value is not None:
            setattr(radio, name, value)

    dispatch_id = payload.dispatch_id
    dispatch = None
    if dispatch_id:
        dispatch = db.query(RadioDispatch).filter(RadioDispatch.id == dispatch_id).first()

    event = RadioEvent(
        gateway_id=gateway.id,
        radio_id=radio.id,
        dispatch_id=dispatch.id if dispatch else None,
        external_event_id=payload.external_event_id,
        event_type=payload.event_type,
        emergency_type=payload.emergency_type,
        message=payload.message,
        latitude=payload.latitude,
        longitude=payload.longitude,
        battery_percentage=payload.battery_percentage,
        occurred_at=occurred_at,
        payload_json=payload.model_dump(mode="json"),
    )
    db.add(event)
    db.flush()

    alarm_id = None
    if payload.event_type == "emergency":
        radio.status = "emergency"
        radio.emergency_state = "active"
        alarm_id = _create_radio_alarm(db, event=event, radio=radio)
    elif payload.event_type == "emergency_clear":
        radio.emergency_state = "clear"
        if radio.status == "emergency":
            radio.status = "online"
    elif payload.event_type == "battery_low":
        try:
            from app.services.alarm_service import create_alarm

            alarm = create_alarm(
                db,
                source_type="radio",
                source_record_id=f"radio-event:{event.id}",
                external_event_id=event.external_event_id,
                alarm_type="low_battery",
                title=f"Radio battery low — {radio.callsign}",
                description=payload.message or "Field radio battery requires attention.",
                severity="medium",
                latitude=radio.latitude,
                longitude=radio.longitude,
                metadata={"radio_id": radio.id, "battery_percentage": radio.battery_percentage},
                commit=False,
            )
            alarm_id = alarm.id
        except Exception:
            alarm_id = None

    if dispatch and payload.event_type == "dispatch_status" and payload.dispatch_status:
        transition_target = payload.dispatch_status
        if transition_target != dispatch.status:
            allowed = DISPATCH_TRANSITIONS.get(dispatch.status, set())
            if transition_target in allowed:
                dispatch.status = transition_target
                dispatch.accepted_by_radio_id = radio.id
                if transition_target == "accepted":
                    dispatch.accepted_at = now
                elif transition_target == "en_route":
                    dispatch.en_route_at = now
                elif transition_target == "on_scene":
                    dispatch.on_scene_at = now
                elif transition_target == "clear":
                    dispatch.cleared_at = now

    try:
        db.commit()
    except IntegrityError:
        db.rollback()
        duplicate = (
            db.query(RadioEvent)
            .filter(
                RadioEvent.gateway_id == gateway.id,
                RadioEvent.external_event_id == payload.external_event_id,
            )
            .first()
        )
        if duplicate is not None:
            return {
                "accepted": True,
                "duplicate": True,
                "radio_id": duplicate.radio_id,
                "event_id": duplicate.id,
                "dispatch_id": duplicate.dispatch_id,
            }
        raise

    return {
        "accepted": True,
        "duplicate": False,
        "radio_id": radio.id,
        "event_id": event.id,
        "alarm_id": alarm_id,
        "dispatch_id": dispatch.id if dispatch else None,
    }
