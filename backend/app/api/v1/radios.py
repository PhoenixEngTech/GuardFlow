"""GuardFlow Radio Dispatch API.

Mount with:
    app.include_router(router, prefix="/api/v1")
"""

from __future__ import annotations

from datetime import timedelta
from typing import Any

from fastapi import APIRouter, Depends, Header, HTTPException, Query, status
from sqlalchemy import func
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.core.database import Base, engine, get_db
from app.core.permissions import (
    require_authenticated_operator,
    require_dispatch_operator,
    require_management_operator,
)
from app.models.radio import (
    RadioCommand,
    RadioDevice,
    RadioDispatch,
    RadioEvent,
    RadioGateway,
    RadioTalkGroup,
    RadioTalkGroupMember,
)
from app.models.user import Operator
from app.schemas.radio import (
    CommandOut,
    CommandResult,
    DeviceCreate,
    DeviceOut,
    DeviceUpdate,
    DispatchCreate,
    DispatchOut,
    DispatchStatusUpdate,
    EventOut,
    GatewayCreate,
    GatewayEventIn,
    GatewayEventResult,
    GatewayOut,
    GatewayRegistrationResult,
    LocationUpdate,
    RadioMetrics,
    TalkGroupCreate,
    TalkGroupMemberCreate,
    TalkGroupOut,
)
from app.services.radio_service import (
    create_dispatch,
    generate_gateway_key,
    get_dispatch_or_404,
    get_gateway_by_identifier,
    get_radio_or_404,
    get_talkgroup_or_404,
    hash_gateway_key,
    process_gateway_event,
    transition_dispatch,
    utc_now,
    verify_gateway_key,
)

router = APIRouter(prefix="/radios", tags=["Radio Dispatch"])

RADIO_TABLES = [
    RadioGateway.__table__,
    RadioTalkGroup.__table__,
    RadioDevice.__table__,
    RadioTalkGroupMember.__table__,
    RadioDispatch.__table__,
    RadioCommand.__table__,
    RadioEvent.__table__,
]


@router.on_event("startup")
def create_radio_tables() -> None:
    Base.metadata.create_all(bind=engine, tables=RADIO_TABLES, checkfirst=True)


def _gateway_auth(
    gateway_identifier: str,
    supplied_key: str | None,
    db: Session,
) -> RadioGateway:
    gateway = get_gateway_by_identifier(db, gateway_identifier)
    if not supplied_key or not verify_gateway_key(supplied_key, gateway.secret_hash):
        raise HTTPException(status_code=401, detail="Invalid radio gateway credentials.")
    return gateway


@router.get("/metrics", response_model=RadioMetrics)
def radio_metrics(
    db: Session = Depends(get_db),
    _: Operator = Depends(require_authenticated_operator),
) -> Any:
    offline_threshold = utc_now() - timedelta(minutes=5)
    total = db.query(func.count(RadioDevice.id)).scalar() or 0
    online = (
        db.query(func.count(RadioDevice.id))
        .filter(
            RadioDevice.status.in_(["online", "busy", "emergency"]),
            RadioDevice.last_seen_at.isnot(None),
            RadioDevice.last_seen_at >= offline_threshold,
        )
        .scalar()
        or 0
    )
    emergencies = (
        db.query(func.count(RadioDevice.id))
        .filter(RadioDevice.emergency_state == "active")
        .scalar()
        or 0
    )
    open_dispatches = (
        db.query(func.count(RadioDispatch.id))
        .filter(RadioDispatch.status.in_(["queued", "sent", "accepted", "en_route", "on_scene"]))
        .scalar()
        or 0
    )
    online_gateways = (
        db.query(func.count(RadioGateway.id))
        .filter(
            RadioGateway.status == "online",
            RadioGateway.last_seen_at.isnot(None),
            RadioGateway.last_seen_at >= offline_threshold,
        )
        .scalar()
        or 0
    )
    return RadioMetrics(
        total_radios=total,
        online_radios=online,
        offline_radios=max(total - online, 0),
        emergency_radios=emergencies,
        open_dispatches=open_dispatches,
        online_gateways=online_gateways,
    )


@router.get("/devices", response_model=list[DeviceOut])
def list_devices(
    network_type: str | None = Query(default=None),
    device_status: str | None = Query(default=None, alias="status"),
    search: str | None = Query(default=None, max_length=120),
    limit: int = Query(default=500, ge=1, le=2000),
    db: Session = Depends(get_db),
    _: Operator = Depends(require_authenticated_operator),
) -> Any:
    query = db.query(RadioDevice)
    if network_type:
        query = query.filter(RadioDevice.network_type == network_type)
    if device_status:
        query = query.filter(RadioDevice.status == device_status)
    if search:
        pattern = f"%{search.strip()}%"
        query = query.filter(
            RadioDevice.callsign.ilike(pattern)
            | RadioDevice.radio_identifier.ilike(pattern)
            | RadioDevice.vehicle_registration.ilike(pattern)
        )
    return query.order_by(RadioDevice.callsign.asc()).limit(limit).all()


@router.post("/devices", response_model=DeviceOut, status_code=201)
def create_device(
    payload: DeviceCreate,
    db: Session = Depends(get_db),
    _: Operator = Depends(require_management_operator),
) -> Any:
    if payload.gateway_id:
        gateway = db.query(RadioGateway).filter(RadioGateway.id == payload.gateway_id).first()
        if gateway is None:
            raise HTTPException(status_code=422, detail="Selected gateway does not exist.")
    if payload.primary_talkgroup_id:
        get_talkgroup_or_404(db, payload.primary_talkgroup_id)
    device = RadioDevice(**payload.model_dump())
    db.add(device)
    try:
        db.commit()
    except IntegrityError as exc:
        db.rollback()
        raise HTTPException(
            status_code=409,
            detail="That radio identifier or callsign already exists.",
        ) from exc
    db.refresh(device)
    return device


@router.patch("/devices/{radio_id}", response_model=DeviceOut)
def update_device(
    radio_id: str,
    payload: DeviceUpdate,
    db: Session = Depends(get_db),
    _: Operator = Depends(require_management_operator),
) -> Any:
    device = get_radio_or_404(db, radio_id)
    for name, value in payload.model_dump(exclude_unset=True).items():
        if name == "callsign" and value:
            value = value.strip().upper()
        setattr(device, name, value)
    db.commit()
    db.refresh(device)
    return device


@router.post("/devices/{radio_id}/location", response_model=DeviceOut)
def update_device_location(
    radio_id: str,
    payload: LocationUpdate,
    db: Session = Depends(get_db),
    _: Operator = Depends(require_dispatch_operator),
) -> Any:
    device = get_radio_or_404(db, radio_id)
    for name, value in payload.model_dump(exclude_none=True).items():
        if name != "occurred_at":
            setattr(device, name, value)
    device.last_seen_at = payload.occurred_at or utc_now()
    if device.status == "offline":
        device.status = "online"
    db.commit()
    db.refresh(device)
    return device


@router.get("/talkgroups", response_model=list[TalkGroupOut])
def list_talkgroups(
    db: Session = Depends(get_db),
    _: Operator = Depends(require_authenticated_operator),
) -> Any:
    return db.query(RadioTalkGroup).order_by(RadioTalkGroup.code.asc()).all()


@router.post("/talkgroups", response_model=TalkGroupOut, status_code=201)
def create_talkgroup(
    payload: TalkGroupCreate,
    db: Session = Depends(get_db),
    operator: Operator = Depends(require_management_operator),
) -> Any:
    talkgroup = RadioTalkGroup(
        **payload.model_dump(),
        created_by_operator_id=operator.id,
    )
    db.add(talkgroup)
    try:
        db.commit()
    except IntegrityError as exc:
        db.rollback()
        raise HTTPException(status_code=409, detail="That talk group code already exists.") from exc
    db.refresh(talkgroup)
    return talkgroup


@router.post("/talkgroups/{talkgroup_id}/members", status_code=201)
def add_talkgroup_member(
    talkgroup_id: str,
    payload: TalkGroupMemberCreate,
    db: Session = Depends(get_db),
    _: Operator = Depends(require_management_operator),
) -> Any:
    get_talkgroup_or_404(db, talkgroup_id)
    get_radio_or_404(db, payload.radio_id)
    member = RadioTalkGroupMember(talkgroup_id=talkgroup_id, radio_id=payload.radio_id)
    db.add(member)
    try:
        db.commit()
    except IntegrityError:
        db.rollback()
    return {"ok": True}


@router.get("/gateways", response_model=list[GatewayOut])
def list_gateways(
    db: Session = Depends(get_db),
    _: Operator = Depends(require_authenticated_operator),
) -> Any:
    return db.query(RadioGateway).order_by(RadioGateway.name.asc()).all()


@router.post("/gateways", response_model=GatewayRegistrationResult, status_code=201)
def create_gateway(
    payload: GatewayCreate,
    db: Session = Depends(get_db),
    operator: Operator = Depends(require_management_operator),
) -> Any:
    integration_key = generate_gateway_key()
    gateway = RadioGateway(
        **payload.model_dump(),
        secret_hash=hash_gateway_key(integration_key),
        created_by_operator_id=operator.id,
    )
    db.add(gateway)
    try:
        db.commit()
    except IntegrityError as exc:
        db.rollback()
        raise HTTPException(status_code=409, detail="That gateway identifier already exists.") from exc
    db.refresh(gateway)
    return GatewayRegistrationResult(gateway=gateway, integration_key=integration_key)


@router.post(
    "/gateways/{gateway_identifier}/events",
    response_model=GatewayEventResult,
)
def ingest_gateway_event(
    gateway_identifier: str,
    payload: GatewayEventIn,
    x_guardflow_radio_key: str | None = Header(default=None, alias="X-GuardFlow-Radio-Key"),
    db: Session = Depends(get_db),
) -> Any:
    gateway = _gateway_auth(gateway_identifier, x_guardflow_radio_key, db)
    return process_gateway_event(db, gateway=gateway, payload=payload)


@router.get(
    "/gateways/{gateway_identifier}/commands",
    response_model=list[CommandOut],
)
def poll_gateway_commands(
    gateway_identifier: str,
    limit: int = Query(default=50, ge=1, le=200),
    x_guardflow_radio_key: str | None = Header(default=None, alias="X-GuardFlow-Radio-Key"),
    db: Session = Depends(get_db),
) -> Any:
    gateway = _gateway_auth(gateway_identifier, x_guardflow_radio_key, db)
    now = utc_now()
    commands = (
        db.query(RadioCommand)
        .filter(RadioCommand.gateway_id == gateway.id, RadioCommand.status == "pending")
        .order_by(RadioCommand.created_at.asc())
        .limit(limit)
        .all()
    )
    for command in commands:
        command.status = "delivered"
        command.delivered_at = now
        command.attempt_count += 1
    gateway.status = "online"
    gateway.last_seen_at = now
    db.commit()
    return commands


@router.patch(
    "/gateways/{gateway_identifier}/commands/{command_id}",
    response_model=CommandOut,
)
def complete_gateway_command(
    gateway_identifier: str,
    command_id: str,
    payload: CommandResult,
    x_guardflow_radio_key: str | None = Header(default=None, alias="X-GuardFlow-Radio-Key"),
    db: Session = Depends(get_db),
) -> Any:
    gateway = _gateway_auth(gateway_identifier, x_guardflow_radio_key, db)
    command = (
        db.query(RadioCommand)
        .filter(RadioCommand.id == command_id, RadioCommand.gateway_id == gateway.id)
        .first()
    )
    if command is None:
        raise HTTPException(status_code=404, detail="Radio command not found.")
    command.status = payload.status
    command.result_json = payload.result_json
    command.completed_at = utc_now()
    if command.dispatch_id:
        dispatch = db.query(RadioDispatch).filter(RadioDispatch.id == command.dispatch_id).first()
        if dispatch and dispatch.status == "queued":
            dispatch.status = "sent" if payload.status == "completed" else "failed"
            if payload.status == "completed":
                dispatch.sent_at = utc_now()
    db.commit()
    db.refresh(command)
    return command


@router.get("/dispatches", response_model=list[DispatchOut])
def list_dispatches(
    dispatch_status: str | None = Query(default=None, alias="status"),
    open_only: bool = Query(default=False),
    limit: int = Query(default=300, ge=1, le=2000),
    db: Session = Depends(get_db),
    _: Operator = Depends(require_authenticated_operator),
) -> Any:
    query = db.query(RadioDispatch)
    if dispatch_status:
        query = query.filter(RadioDispatch.status == dispatch_status)
    elif open_only:
        query = query.filter(
            RadioDispatch.status.in_(["queued", "sent", "accepted", "en_route", "on_scene"])
        )
    return query.order_by(RadioDispatch.created_at.desc()).limit(limit).all()


@router.post("/dispatches", response_model=DispatchOut, status_code=201)
def dispatch_radio_message(
    payload: DispatchCreate,
    db: Session = Depends(get_db),
    operator: Operator = Depends(require_dispatch_operator),
) -> Any:
    return create_dispatch(db, payload, operator_id=operator.id)


@router.patch("/dispatches/{dispatch_id}/status", response_model=DispatchOut)
def update_dispatch_status(
    dispatch_id: str,
    payload: DispatchStatusUpdate,
    db: Session = Depends(get_db),
    _: Operator = Depends(require_dispatch_operator),
) -> Any:
    dispatch = get_dispatch_or_404(db, dispatch_id, lock=True)
    radio_id = None
    if payload.radio_identifier:
        radio = (
            db.query(RadioDevice)
            .filter(RadioDevice.radio_identifier == payload.radio_identifier.strip().upper())
            .first()
        )
        radio_id = radio.id if radio else None
    return transition_dispatch(db, dispatch, payload.status, radio_id=radio_id)


@router.get("/events", response_model=list[EventOut])
def list_radio_events(
    event_type: str | None = Query(default=None),
    radio_id: str | None = Query(default=None),
    limit: int = Query(default=300, ge=1, le=2000),
    db: Session = Depends(get_db),
    _: Operator = Depends(require_authenticated_operator),
) -> Any:
    query = db.query(RadioEvent)
    if event_type:
        query = query.filter(RadioEvent.event_type == event_type)
    if radio_id:
        query = query.filter(RadioEvent.radio_id == radio_id)
    return query.order_by(RadioEvent.occurred_at.desc()).limit(limit).all()
