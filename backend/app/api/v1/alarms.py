"""GuardFlow Universal Alarm System API.

Mount with:
    app.include_router(router, prefix="/api/v1")

The router creates only its own additive tables at startup. It does not change
or drop any existing GuardFlow table.
"""

from __future__ import annotations

from datetime import datetime
from typing import Any

from fastapi import APIRouter, BackgroundTasks, Depends, Header, HTTPException, Query, status
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.core.database import Base, engine, get_db
from app.core.permissions import (
    require_authenticated_operator,
    require_dispatch_operator,
    require_management_operator,
)
from app.models.alarm import (
    ALARM_TABLES,
    Alarm,
    AlarmAudit,
    AlarmNotification,
    AlarmPanel,
    AlarmResponseUnit,
    AlarmRule,
    AlarmSite,
    AlarmSiteContact,
    AlarmZone,
)
from app.models.case import CaseFile
from app.models.user import Operator
from app.schemas.alarm import (
    AlarmAction,
    AlarmAuditOut,
    AlarmDetailOut,
    AlarmMetrics,
    AlarmOut,
    ContactCreate,
    ContactOut,
    InternalAlarmEvent,
    ManualAlarmCreate,
    NotificationOut,
    NotificationProcessResult,
    PanelCreate,
    PanelEventIn,
    PanelEventResult,
    PanelOut,
    PanelRegistrationResult,
    ResponseUnitCreate,
    ResponseUnitOut,
    ResponseUnitUpdate,
    RuleCreate,
    RuleOut,
    RuleUpdate,
    SiteCreate,
    SiteOut,
    SiteUpdate,
    ZoneCreate,
    ZoneOut,
    ZoneUpdate,
)
from app.services.alarm_service import (
    OPEN_STATUSES,
    alarm_detail,
    count_metrics,
    create_alarm,
    generate_integration_key,
    get_alarm_or_404,
    hash_integration_key,
    ingest_panel_event,
    sync_legacy_mobile_sos,
    transition_alarm,
    trigger_internal_alarm,
    utc_now,
    verify_integration_key,
)

router = APIRouter(prefix="/alarms", tags=["Universal Alarm Centre"])

DEFAULT_RULES = [
    ("Vehicle tracker offline", "vehicle", "tracker_offline", "high", 600),
    ("Vehicle geofence exit", "vehicle", "geofence_exit", "high", 300),
    ("Restricted area entry", "vehicle", "geofence_entry", "high", 300),
    ("Vehicle overspeed", "vehicle", "overspeed", "high", 300),
    ("Route deviation", "vehicle", "route_deviation", "high", 600),
    ("Unauthorised vehicle movement", "vehicle", "unauthorised_movement", "critical", 300),
    ("Possible vehicle collision", "vehicle", "impact", "critical", 600),
    ("Tracker battery low", "vehicle", "low_battery", "medium", 3600),
    ("VisionFlow watchlist match", "vision", "watchlist_hit", "high", 300),
    ("Railway infrastructure panic", "railway", "panic", "critical", 300),
]


@router.on_event("startup")
def create_alarm_tables_and_rules() -> None:
    # Importing Operator and CaseFile above registers their referenced tables.
    Base.metadata.create_all(bind=engine, tables=ALARM_TABLES, checkfirst=True)
    db = next(get_db())
    try:
        for name, source_type, event_type, severity, cooldown in DEFAULT_RULES:
            exists = (
                db.query(AlarmRule)
                .filter(
                    AlarmRule.source_type == source_type,
                    AlarmRule.event_type == event_type,
                )
                .first()
            )
            if exists is None:
                db.add(
                    AlarmRule(
                        name=name,
                        source_type=source_type,
                        event_type=event_type,
                        severity=severity,
                        enabled=True,
                        cooldown_seconds=cooldown,
                        conditions_json={},
                    )
                )
        db.commit()
    finally:
        db.close()


def _site_or_404(db: Session, site_id: str) -> AlarmSite:
    site = db.query(AlarmSite).filter(AlarmSite.id == site_id).first()
    if site is None:
        raise HTTPException(status_code=404, detail="Alarm site not found.")
    return site


def _panel_or_404(db: Session, panel_id: str) -> AlarmPanel:
    panel = db.query(AlarmPanel).filter(AlarmPanel.id == panel_id).first()
    if panel is None:
        raise HTTPException(status_code=404, detail="Alarm panel not found.")
    return panel


def _zone_or_404(db: Session, zone_id: str) -> AlarmZone:
    zone = db.query(AlarmZone).filter(AlarmZone.id == zone_id).first()
    if zone is None:
        raise HTTPException(status_code=404, detail="Alarm zone not found.")
    return zone


def _unit_or_404(db: Session, unit_id: str) -> AlarmResponseUnit:
    unit = db.query(AlarmResponseUnit).filter(AlarmResponseUnit.id == unit_id).first()
    if unit is None:
        raise HTTPException(status_code=404, detail="Response unit not found.")
    return unit


def _alarm_query_for_operator(db: Session, operator: Operator):
    query = db.query(Alarm)
    if operator.role == "investigator":
        assigned_cases = select(CaseFile.id).where(
            CaseFile.assigned_operator_id == operator.id
        )
        query = query.filter(Alarm.case_id.in_(assigned_cases))
    return query


def _ensure_alarm_read_access(db: Session, alarm: Alarm, operator: Operator) -> None:
    if operator.role != "investigator":
        return
    if not alarm.case_id:
        raise HTTPException(
            status_code=403,
            detail="Investigators may view only alarms linked to their assigned cases.",
        )
    case_file = (
        db.query(CaseFile)
        .filter(
            CaseFile.id == alarm.case_id,
            CaseFile.assigned_operator_id == operator.id,
        )
        .first()
    )
    if case_file is None:
        raise HTTPException(status_code=403, detail="You do not have access to this alarm.")


# ---------------------------------------------------------------------------
# Premises, panels, zones and keyholders
# ---------------------------------------------------------------------------


@router.get("/sites", response_model=list[SiteOut])
def list_sites(
    site_type: str | None = Query(default=None),
    site_status: str | None = Query(default=None, alias="status"),
    search: str | None = Query(default=None, max_length=120),
    limit: int = Query(default=200, ge=1, le=1000),
    db: Session = Depends(get_db),
    _: Operator = Depends(require_authenticated_operator),
) -> Any:
    query = db.query(AlarmSite)
    if site_type:
        query = query.filter(AlarmSite.site_type == site_type)
    if site_status:
        query = query.filter(AlarmSite.status == site_status)
    if search:
        pattern = f"%{search.strip()}%"
        query = query.filter(
            AlarmSite.client_name.ilike(pattern)
            | AlarmSite.site_name.ilike(pattern)
            | AlarmSite.account_number.ilike(pattern)
            | AlarmSite.address_line_1.ilike(pattern)
        )
    return query.order_by(AlarmSite.created_at.desc()).limit(limit).all()


@router.post("/sites", response_model=SiteOut, status_code=status.HTTP_201_CREATED)
def create_site(
    payload: SiteCreate,
    db: Session = Depends(get_db),
    operator: Operator = Depends(require_management_operator),
) -> Any:
    site = AlarmSite(**payload.model_dump(), created_by_operator_id=operator.id)
    db.add(site)
    try:
        db.commit()
        db.refresh(site)
    except IntegrityError as exc:
        db.rollback()
        raise HTTPException(status_code=409, detail="That site account number already exists.") from exc
    return site


@router.patch("/sites/{site_id}", response_model=SiteOut)
def update_site(
    site_id: str,
    payload: SiteUpdate,
    db: Session = Depends(get_db),
    _: Operator = Depends(require_management_operator),
) -> Any:
    site = _site_or_404(db, site_id)
    for key, value in payload.model_dump(exclude_unset=True).items():
        setattr(site, key, value)
    db.commit()
    db.refresh(site)
    return site


@router.get("/sites/{site_id}/contacts", response_model=list[ContactOut])
def list_site_contacts(
    site_id: str,
    db: Session = Depends(get_db),
    _: Operator = Depends(require_authenticated_operator),
) -> Any:
    _site_or_404(db, site_id)
    return (
        db.query(AlarmSiteContact)
        .filter(AlarmSiteContact.site_id == site_id)
        .order_by(AlarmSiteContact.priority.asc())
        .all()
    )


@router.post("/contacts", response_model=ContactOut, status_code=status.HTTP_201_CREATED)
def create_site_contact(
    payload: ContactCreate,
    db: Session = Depends(get_db),
    _: Operator = Depends(require_management_operator),
) -> Any:
    _site_or_404(db, payload.site_id)
    contact = AlarmSiteContact(**payload.model_dump())
    db.add(contact)
    try:
        db.commit()
        db.refresh(contact)
    except IntegrityError as exc:
        db.rollback()
        raise HTTPException(
            status_code=409,
            detail="That keyholder priority is already used at this site.",
        ) from exc
    return contact


@router.get("/panels", response_model=list[PanelOut])
def list_panels(
    site_id: str | None = Query(default=None),
    panel_status: str | None = Query(default=None, alias="status"),
    db: Session = Depends(get_db),
    _: Operator = Depends(require_authenticated_operator),
) -> Any:
    query = db.query(AlarmPanel)
    if site_id:
        query = query.filter(AlarmPanel.site_id == site_id)
    if panel_status:
        query = query.filter(AlarmPanel.status == panel_status)
    return query.order_by(AlarmPanel.created_at.desc()).all()


@router.post(
    "/panels",
    response_model=PanelRegistrationResult,
    status_code=status.HTTP_201_CREATED,
)
def register_panel(
    payload: PanelCreate,
    db: Session = Depends(get_db),
    _: Operator = Depends(require_management_operator),
) -> Any:
    _site_or_404(db, payload.site_id)
    integration_key = generate_integration_key()
    panel = AlarmPanel(
        **payload.model_dump(),
        secret_hash=hash_integration_key(integration_key),
        status="online",
    )
    db.add(panel)
    try:
        db.commit()
        db.refresh(panel)
    except IntegrityError as exc:
        db.rollback()
        raise HTTPException(status_code=409, detail="That panel identifier already exists.") from exc
    return PanelRegistrationResult(panel=panel, integration_key=integration_key)


@router.post("/panels/{panel_id}/rotate-key", response_model=PanelRegistrationResult)
def rotate_panel_key(
    panel_id: str,
    db: Session = Depends(get_db),
    _: Operator = Depends(require_management_operator),
) -> Any:
    panel = _panel_or_404(db, panel_id)
    integration_key = generate_integration_key()
    panel.secret_hash = hash_integration_key(integration_key)
    db.commit()
    db.refresh(panel)
    return PanelRegistrationResult(panel=panel, integration_key=integration_key)


@router.get("/zones", response_model=list[ZoneOut])
def list_zones(
    panel_id: str | None = Query(default=None),
    db: Session = Depends(get_db),
    _: Operator = Depends(require_authenticated_operator),
) -> Any:
    query = db.query(AlarmZone)
    if panel_id:
        query = query.filter(AlarmZone.panel_id == panel_id)
    return query.order_by(AlarmZone.panel_id, AlarmZone.zone_number).all()


@router.post("/zones", response_model=ZoneOut, status_code=status.HTTP_201_CREATED)
def create_zone(
    payload: ZoneCreate,
    db: Session = Depends(get_db),
    _: Operator = Depends(require_management_operator),
) -> Any:
    _panel_or_404(db, payload.panel_id)
    zone = AlarmZone(**payload.model_dump())
    db.add(zone)
    try:
        db.commit()
        db.refresh(zone)
    except IntegrityError as exc:
        db.rollback()
        raise HTTPException(status_code=409, detail="That zone number already exists on the panel.") from exc
    return zone


@router.patch("/zones/{zone_id}", response_model=ZoneOut)
def update_zone(
    zone_id: str,
    payload: ZoneUpdate,
    db: Session = Depends(get_db),
    _: Operator = Depends(require_management_operator),
) -> Any:
    zone = _zone_or_404(db, zone_id)
    for key, value in payload.model_dump(exclude_unset=True).items():
        setattr(zone, key, value)
    db.commit()
    db.refresh(zone)
    return zone


# ---------------------------------------------------------------------------
# Response units and automatic rules
# ---------------------------------------------------------------------------


@router.get("/response-units", response_model=list[ResponseUnitOut])
def list_response_units(
    unit_status: str | None = Query(default=None, alias="status"),
    db: Session = Depends(get_db),
    _: Operator = Depends(require_authenticated_operator),
) -> Any:
    query = db.query(AlarmResponseUnit)
    if unit_status:
        query = query.filter(AlarmResponseUnit.status == unit_status)
    return query.order_by(AlarmResponseUnit.unit_code.asc()).all()


@router.post(
    "/response-units",
    response_model=ResponseUnitOut,
    status_code=status.HTTP_201_CREATED,
)
def create_response_unit(
    payload: ResponseUnitCreate,
    db: Session = Depends(get_db),
    _: Operator = Depends(require_management_operator),
) -> Any:
    unit = AlarmResponseUnit(**payload.model_dump())
    db.add(unit)
    try:
        db.commit()
        db.refresh(unit)
    except IntegrityError as exc:
        db.rollback()
        raise HTTPException(status_code=409, detail="That response unit code already exists.") from exc
    return unit


@router.patch("/response-units/{unit_id}", response_model=ResponseUnitOut)
def update_response_unit(
    unit_id: str,
    payload: ResponseUnitUpdate,
    db: Session = Depends(get_db),
    _: Operator = Depends(require_dispatch_operator),
) -> Any:
    unit = _unit_or_404(db, unit_id)
    changes = payload.model_dump(exclude_unset=True)
    for key, value in changes.items():
        setattr(unit, key, value)
    if "latitude" in changes or "longitude" in changes:
        unit.last_seen_at = utc_now()
    db.commit()
    db.refresh(unit)
    return unit


@router.get("/rules", response_model=list[RuleOut])
def list_rules(
    source_type: str | None = Query(default=None),
    db: Session = Depends(get_db),
    _: Operator = Depends(require_authenticated_operator),
) -> Any:
    query = db.query(AlarmRule)
    if source_type:
        query = query.filter(AlarmRule.source_type == source_type)
    return query.order_by(AlarmRule.source_type, AlarmRule.event_type).all()


@router.post("/rules", response_model=RuleOut, status_code=status.HTTP_201_CREATED)
def create_rule(
    payload: RuleCreate,
    db: Session = Depends(get_db),
    operator: Operator = Depends(require_management_operator),
) -> Any:
    rule = AlarmRule(**payload.model_dump(), created_by_operator_id=operator.id)
    db.add(rule)
    try:
        db.commit()
        db.refresh(rule)
    except IntegrityError as exc:
        db.rollback()
        raise HTTPException(status_code=409, detail="A rule already exists for that source and event.") from exc
    return rule


@router.patch("/rules/{rule_id}", response_model=RuleOut)
def update_rule(
    rule_id: str,
    payload: RuleUpdate,
    db: Session = Depends(get_db),
    _: Operator = Depends(require_management_operator),
) -> Any:
    rule = db.query(AlarmRule).filter(AlarmRule.id == rule_id).first()
    if rule is None:
        raise HTTPException(status_code=404, detail="Alarm rule not found.")
    for key, value in payload.model_dump(exclude_unset=True).items():
        setattr(rule, key, value)
    db.commit()
    db.refresh(rule)
    return rule


@router.get("/notifications", response_model=list[NotificationOut])
def list_notifications(
    notification_status: str | None = Query(default=None, alias="status"),
    limit: int = Query(default=200, ge=1, le=1000),
    db: Session = Depends(get_db),
    _: Operator = Depends(require_management_operator),
) -> Any:
    query = db.query(AlarmNotification)
    if notification_status:
        query = query.filter(AlarmNotification.status == notification_status)
    return query.order_by(AlarmNotification.queued_at.desc()).limit(limit).all()


@router.post("/notifications/process", response_model=NotificationProcessResult)
def process_notifications(
    limit: int = Query(default=100, ge=1, le=500),
    db: Session = Depends(get_db),
    _: Operator = Depends(require_management_operator),
) -> Any:
    from app.services.alarm_notifications import process_notification_outbox

    return process_notification_outbox(db, limit=limit)


# ---------------------------------------------------------------------------
# Event ingestion
# ---------------------------------------------------------------------------


@router.post("/ingest/panel/{panel_identifier}", response_model=PanelEventResult)
def ingest_alarm_panel_event(
    panel_identifier: str,
    payload: PanelEventIn,
    background_tasks: BackgroundTasks,
    x_guardflow_panel_key: str = Header(..., alias="X-GuardFlow-Panel-Key"),
    db: Session = Depends(get_db),
) -> Any:
    panel = (
        db.query(AlarmPanel)
        .filter(AlarmPanel.panel_identifier == panel_identifier.strip().upper())
        .first()
    )
    if panel is None or not verify_integration_key(x_guardflow_panel_key, panel.secret_hash):
        raise HTTPException(status_code=401, detail="Invalid panel identifier or integration key.")
    if panel.status == "disabled":
        raise HTTPException(status_code=403, detail="This alarm panel has been disabled.")
    action, alarm, site, detail = ingest_panel_event(db, panel=panel, payload=payload)
    if alarm is not None and action == "alarm_created":
        from app.services.alarm_notifications import process_notification_outbox_new_session

        background_tasks.add_task(process_notification_outbox_new_session, 50)
    return PanelEventResult(
        action=action,
        alarm=alarm,
        site_armed_state=site.armed_state,
        detail=detail,
    )


@router.post("/ingest/internal", response_model=AlarmOut)
def ingest_internal_event(
    payload: InternalAlarmEvent,
    background_tasks: BackgroundTasks,
    db: Session = Depends(get_db),
    operator: Operator = Depends(require_dispatch_operator),
) -> Any:
    alarm, duplicate = trigger_internal_alarm(db, payload, operator.id)
    if not duplicate:
        from app.services.alarm_notifications import process_notification_outbox_new_session

        background_tasks.add_task(process_notification_outbox_new_session, 50)
    return alarm


@router.post("/manual", response_model=AlarmOut, status_code=status.HTTP_201_CREATED)
def create_manual_alarm(
    payload: ManualAlarmCreate,
    background_tasks: BackgroundTasks,
    db: Session = Depends(get_db),
    operator: Operator = Depends(require_dispatch_operator),
) -> Any:
    if payload.site_id:
        _site_or_404(db, payload.site_id)
    alarm = create_alarm(
        db,
        **payload.model_dump(exclude={"metadata_json"}),
        metadata=payload.metadata_json,
        operator_id=operator.id,
    )
    from app.services.alarm_notifications import process_notification_outbox_new_session

    background_tasks.add_task(process_notification_outbox_new_session, 50)
    return alarm


# ---------------------------------------------------------------------------
# Alarm centre reads and workflow
# ---------------------------------------------------------------------------


@router.get("/metrics", response_model=AlarmMetrics)
def alarm_metrics(
    db: Session = Depends(get_db),
    operator: Operator = Depends(require_authenticated_operator),
) -> Any:
    sync_legacy_mobile_sos(db)
    return count_metrics(db, _alarm_query_for_operator(db, operator))


@router.get("/active", response_model=list[AlarmOut])
def list_active_alarms(
    severity: str | None = Query(default=None),
    source_type: str | None = Query(default=None),
    limit: int = Query(default=200, ge=1, le=1000),
    db: Session = Depends(get_db),
    operator: Operator = Depends(require_authenticated_operator),
) -> Any:
    sync_legacy_mobile_sos(db)
    query = _alarm_query_for_operator(db, operator).filter(Alarm.status.in_(OPEN_STATUSES))
    if severity:
        query = query.filter(Alarm.severity == severity)
    if source_type:
        query = query.filter(Alarm.source_type == source_type)
    severity_order = {"critical": 0, "high": 1, "medium": 2, "low": 3}
    rows = query.order_by(Alarm.triggered_at.desc()).limit(limit).all()
    return sorted(rows, key=lambda row: (severity_order.get(row.severity, 9), -row.triggered_at.timestamp()))


@router.get("/", response_model=list[AlarmOut])
def list_alarms(
    alarm_status: str | None = Query(default=None, alias="status"),
    severity: str | None = Query(default=None),
    source_type: str | None = Query(default=None),
    site_id: str | None = Query(default=None),
    case_id: str | None = Query(default=None),
    search: str | None = Query(default=None, max_length=120),
    limit: int = Query(default=250, ge=1, le=2000),
    db: Session = Depends(get_db),
    operator: Operator = Depends(require_authenticated_operator),
) -> Any:
    sync_legacy_mobile_sos(db)
    query = _alarm_query_for_operator(db, operator)
    if alarm_status:
        query = query.filter(Alarm.status == alarm_status)
    if severity:
        query = query.filter(Alarm.severity == severity)
    if source_type:
        query = query.filter(Alarm.source_type == source_type)
    if site_id:
        query = query.filter(Alarm.site_id == site_id)
    if case_id:
        query = query.filter(Alarm.case_id == case_id)
    if search:
        pattern = f"%{search.strip()}%"
        query = query.filter(
            Alarm.alarm_number.ilike(pattern)
            | Alarm.title.ilike(pattern)
            | Alarm.description.ilike(pattern)
            | Alarm.alarm_type.ilike(pattern)
        )
    return query.order_by(Alarm.triggered_at.desc()).limit(limit).all()


@router.get("/{alarm_id}", response_model=AlarmDetailOut)
def get_alarm(
    alarm_id: str,
    db: Session = Depends(get_db),
    operator: Operator = Depends(require_authenticated_operator),
) -> Any:
    sync_legacy_mobile_sos(db)
    alarm = get_alarm_or_404(db, alarm_id)
    _ensure_alarm_read_access(db, alarm, operator)
    return alarm_detail(db, alarm)


@router.get("/{alarm_id}/audit", response_model=list[AlarmAuditOut])
def get_alarm_audit(
    alarm_id: str,
    db: Session = Depends(get_db),
    operator: Operator = Depends(require_authenticated_operator),
) -> Any:
    alarm = get_alarm_or_404(db, alarm_id)
    _ensure_alarm_read_access(db, alarm, operator)
    return (
        db.query(AlarmAudit)
        .filter(AlarmAudit.alarm_id == alarm_id)
        .order_by(AlarmAudit.created_at.asc())
        .all()
    )


def _perform_action(
    alarm_id: str,
    payload: AlarmAction,
    new_status: str,
    db: Session,
    operator: Operator,
) -> Alarm:
    if payload.response_unit_id:
        _unit_or_404(db, payload.response_unit_id)
    alarm = transition_alarm(
        db,
        alarm_id,
        new_status=new_status,
        operator_id=operator.id,
        notes=payload.notes,
        response_unit_id=payload.response_unit_id,
    )
    if new_status == "dispatched" and alarm.response_unit_id:
        unit = _unit_or_404(db, alarm.response_unit_id)
        unit.status = "assigned"
        db.commit()
    elif new_status == "responding" and alarm.response_unit_id:
        unit = _unit_or_404(db, alarm.response_unit_id)
        unit.status = "responding"
        db.commit()
    elif new_status in {"resolved", "closed", "cancelled", "false_alarm"} and alarm.response_unit_id:
        unit = _unit_or_404(db, alarm.response_unit_id)
        unit.status = "available"
        db.commit()
    db.refresh(alarm)
    return alarm


@router.patch("/{alarm_id}/acknowledge", response_model=AlarmOut)
def acknowledge_alarm(
    alarm_id: str,
    payload: AlarmAction,
    db: Session = Depends(get_db),
    operator: Operator = Depends(require_dispatch_operator),
) -> Any:
    return _perform_action(alarm_id, payload, "acknowledged", db, operator)


@router.patch("/{alarm_id}/dispatch", response_model=AlarmOut)
def dispatch_alarm(
    alarm_id: str,
    payload: AlarmAction,
    db: Session = Depends(get_db),
    operator: Operator = Depends(require_dispatch_operator),
) -> Any:
    return _perform_action(alarm_id, payload, "dispatched", db, operator)


@router.patch("/{alarm_id}/respond", response_model=AlarmOut)
def mark_responding(
    alarm_id: str,
    payload: AlarmAction,
    db: Session = Depends(get_db),
    operator: Operator = Depends(require_dispatch_operator),
) -> Any:
    return _perform_action(alarm_id, payload, "responding", db, operator)


@router.patch("/{alarm_id}/resolve", response_model=AlarmOut)
def resolve_alarm(
    alarm_id: str,
    payload: AlarmAction,
    db: Session = Depends(get_db),
    operator: Operator = Depends(require_dispatch_operator),
) -> Any:
    return _perform_action(alarm_id, payload, "resolved", db, operator)


@router.patch("/{alarm_id}/close", response_model=AlarmOut)
def close_alarm(
    alarm_id: str,
    payload: AlarmAction,
    db: Session = Depends(get_db),
    operator: Operator = Depends(require_management_operator),
) -> Any:
    return _perform_action(alarm_id, payload, "closed", db, operator)


@router.patch("/{alarm_id}/cancel", response_model=AlarmOut)
def cancel_alarm(
    alarm_id: str,
    payload: AlarmAction,
    db: Session = Depends(get_db),
    operator: Operator = Depends(require_dispatch_operator),
) -> Any:
    return _perform_action(alarm_id, payload, "cancelled", db, operator)


@router.patch("/{alarm_id}/false-alarm", response_model=AlarmOut)
def mark_false_alarm(
    alarm_id: str,
    payload: AlarmAction,
    db: Session = Depends(get_db),
    operator: Operator = Depends(require_dispatch_operator),
) -> Any:
    return _perform_action(alarm_id, payload, "false_alarm", db, operator)
