"""Core alarm normalization, ingestion, workflow and legacy SOS mirroring."""

from __future__ import annotations

import hashlib
import hmac
import secrets
from datetime import datetime, timedelta, timezone
from typing import Any

from fastapi import HTTPException, status
from sqlalchemy import and_, func, or_
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.models.alarm import (
    Alarm,
    AlarmAudit,
    AlarmPanel,
    AlarmRule,
    AlarmSite,
    AlarmSiteContact,
    AlarmZone,
)

OPEN_STATUSES = {"active", "acknowledged", "dispatched", "responding"}
FINAL_STATUSES = {"closed", "cancelled", "false_alarm"}

ALLOWED_TRANSITIONS: dict[str, set[str]] = {
    "active": {"acknowledged", "resolved", "cancelled", "false_alarm"},
    "acknowledged": {"dispatched", "responding", "resolved", "cancelled", "false_alarm"},
    "dispatched": {"responding", "resolved", "cancelled", "false_alarm"},
    "responding": {"resolved", "cancelled", "false_alarm"},
    "resolved": {"closed"},
    "closed": set(),
    "cancelled": set(),
    "false_alarm": set(),
}

CONTACT_ID_CODES: dict[str, tuple[str, str, str]] = {
    "100": ("medical", "Medical emergency", "critical"),
    "110": ("fire", "Fire alarm", "critical"),
    "111": ("smoke", "Smoke detector alarm", "critical"),
    "120": ("panic", "Panic alarm", "critical"),
    "121": ("duress", "Duress alarm", "critical"),
    "122": ("silent_panic", "Silent panic alarm", "critical"),
    "123": ("audible_panic", "Audible panic alarm", "critical"),
    "130": ("burglary", "Burglary alarm", "high"),
    "131": ("perimeter", "Perimeter intrusion", "high"),
    "132": ("interior", "Interior intrusion", "high"),
    "133": ("24_hour_burglary", "24-hour intrusion", "high"),
    "134": ("entry_exit", "Entry/exit intrusion", "high"),
    "137": ("tamper", "Alarm tamper detected", "high"),
    "138": ("near_alarm", "Near alarm condition", "medium"),
    "140": ("general_alarm", "General alarm", "high"),
    "145": ("expansion_tamper", "Expansion module tamper", "high"),
    "150": ("24_hour_non_burglary", "24-hour alarm", "high"),
    "301": ("ac_failure", "Mains power failure", "medium"),
    "302": ("low_battery", "Panel battery low", "medium"),
    "305": ("system_reset", "Alarm panel reset", "low"),
    "306": ("program_changed", "Panel programming changed", "medium"),
    "350": ("communications_failure", "Panel communication failure", "high"),
    "351": ("telephone_line_failure", "Telephone line failure", "medium"),
    "354": ("failure_to_communicate", "Panel failed to communicate", "high"),
    "401": ("arm_disarm", "Open/close event", "low"),
    "406": ("cancel", "Alarm cancelled by user", "low"),
    "407": ("remote_arm_disarm", "Remote open/close event", "low"),
    "570": ("zone_bypass", "Zone bypassed", "medium"),
    "602": ("periodic_test", "Periodic panel test", "low"),
}

SIA_CODES: dict[str, tuple[str, str, str]] = {
    "MA": ("medical", "Medical emergency", "critical"),
    "FA": ("fire", "Fire alarm", "critical"),
    "PA": ("panic", "Panic alarm", "critical"),
    "HA": ("hold_up", "Hold-up alarm", "critical"),
    "DA": ("duress", "Duress alarm", "critical"),
    "BA": ("burglary", "Burglary alarm", "high"),
    "BV": ("burglary_verified", "Verified burglary alarm", "critical"),
    "TA": ("tamper", "Tamper alarm", "high"),
    "GA": ("gas", "Gas alarm", "critical"),
    "KA": ("heat", "Heat alarm", "critical"),
    "WA": ("water", "Water alarm", "medium"),
    "AT": ("ac_failure", "Mains power failure", "medium"),
    "YT": ("low_battery", "Panel battery trouble", "medium"),
    "LT": ("communications_failure", "Communication trouble", "high"),
    "OP": ("disarm", "Premises disarmed", "low"),
    "CL": ("arm", "Premises armed", "low"),
    "RP": ("automatic_test", "Automatic panel test", "low"),
}

EVENT_DEFAULTS: dict[str, tuple[str, str]] = {
    "medical": ("Medical emergency", "critical"),
    "fire": ("Fire alarm", "critical"),
    "smoke": ("Smoke alarm", "critical"),
    "panic": ("Panic alarm", "critical"),
    "silent_panic": ("Silent panic alarm", "critical"),
    "duress": ("Duress alarm", "critical"),
    "hold_up": ("Hold-up alarm", "critical"),
    "burglary": ("Burglary alarm", "high"),
    "intrusion": ("Intrusion alarm", "high"),
    "door": ("Door alarm", "high"),
    "window": ("Window alarm", "high"),
    "motion": ("Motion alarm", "high"),
    "glass_break": ("Glass-break alarm", "high"),
    "tamper": ("Tamper alarm", "high"),
    "communications_failure": ("Communication failure", "high"),
    "tracker_offline": ("Tracker offline", "high"),
    "geofence_exit": ("Geofence exit", "high"),
    "geofence_entry": ("Restricted-area entry", "high"),
    "route_deviation": ("Route deviation", "high"),
    "unauthorised_movement": ("Unauthorised movement", "critical"),
    "impact": ("Possible collision", "critical"),
    "overspeed": ("Overspeed detected", "high"),
    "ignition_after_hours": ("After-hours ignition", "high"),
    "low_battery": ("Low battery", "medium"),
    "ac_failure": ("Mains power failure", "medium"),
    "stationary_too_long": ("Unexpected stationary period", "medium"),
    "watchlist_hit": ("VisionFlow watchlist hit", "high"),
}


def utc_now() -> datetime:
    return datetime.now(timezone.utc)


def generate_alarm_number(now: datetime | None = None) -> str:
    moment = now or utc_now()
    random_part = secrets.token_hex(3).upper()
    return f"GF-A-{moment:%Y%m%d}-{random_part}"


def generate_integration_key() -> str:
    return secrets.token_urlsafe(48)


def hash_integration_key(value: str) -> str:
    return hashlib.sha256(value.encode("utf-8")).hexdigest()


def verify_integration_key(value: str, expected_hash: str) -> bool:
    supplied_hash = hash_integration_key(value)
    return hmac.compare_digest(supplied_hash, expected_hash)


def get_alarm_or_404(db: Session, alarm_id: str, *, lock: bool = False) -> Alarm:
    query = db.query(Alarm).filter(Alarm.id == alarm_id)
    if lock:
        query = query.with_for_update()
    alarm = query.first()
    if alarm is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Alarm not found.")
    return alarm


def audit(
    db: Session,
    alarm: Alarm,
    action: str,
    *,
    operator_id: str | None = None,
    from_status: str | None = None,
    to_status: str | None = None,
    notes: str | None = None,
    details: dict[str, Any] | None = None,
) -> AlarmAudit:
    entry = AlarmAudit(
        alarm_id=alarm.id,
        action=action,
        from_status=from_status,
        to_status=to_status,
        operator_id=operator_id,
        notes=notes,
        details_json=details or {},
    )
    db.add(entry)
    return entry


def create_alarm(
    db: Session,
    *,
    source_type: str,
    alarm_type: str,
    title: str,
    severity: str,
    triggered_at: datetime | None = None,
    source_record_id: str | None = None,
    external_event_id: str | None = None,
    site_id: str | None = None,
    panel_id: str | None = None,
    zone_id: str | None = None,
    vehicle_id: str | None = None,
    case_id: str | None = None,
    event_code: str | None = None,
    description: str | None = None,
    latitude: float | None = None,
    longitude: float | None = None,
    metadata: dict[str, Any] | None = None,
    operator_id: str | None = None,
    commit: bool = True,
) -> Alarm:
    if source_record_id:
        existing = (
            db.query(Alarm)
            .filter(
                Alarm.source_type == source_type,
                Alarm.source_record_id == source_record_id,
            )
            .first()
        )
        if existing is not None:
            return existing

    alarm = Alarm(
        alarm_number=generate_alarm_number(),
        source_type=source_type,
        source_record_id=source_record_id,
        external_event_id=external_event_id,
        site_id=site_id,
        panel_id=panel_id,
        zone_id=zone_id,
        vehicle_id=vehicle_id,
        case_id=case_id,
        alarm_type=alarm_type,
        event_code=event_code,
        title=title,
        description=description,
        severity=severity,
        status="active",
        latitude=latitude,
        longitude=longitude,
        triggered_at=triggered_at or utc_now(),
        metadata_json=metadata or {},
    )
    db.add(alarm)
    db.flush()
    audit(
        db,
        alarm,
        "alarm_created",
        operator_id=operator_id,
        to_status="active",
        details={"source_type": source_type, "alarm_type": alarm_type},
    )
    if site_id:
        from app.services.alarm_notifications import queue_site_notifications

        queue_site_notifications(db, alarm)

    if commit:
        try:
            db.commit()
            db.refresh(alarm)
        except IntegrityError:
            db.rollback()
            if source_record_id:
                existing = (
                    db.query(Alarm)
                    .filter(
                        Alarm.source_type == source_type,
                        Alarm.source_record_id == source_record_id,
                    )
                    .first()
                )
                if existing is not None:
                    return existing
            raise
    return alarm


def _mobile_status_for_unified(status_value: str) -> str:
    value = str(status_value or "active").lower()
    return {
        "active": "active",
        "acknowledged": "acknowledged",
        "resolved": "resolved",
        "cancelled": "cancelled",
    }.get(value, "active")


def sync_legacy_mobile_sos(db: Session) -> int:
    """Mirror working MobileSOSAlert rows into the unified Alarm table.

    This deliberately imports the legacy model lazily. Deployments without the
    mobile module continue to work, while current GuardFlow deployments keep the
    mobile app and command-centre endpoints unchanged.
    """

    try:
        from app.models.mobile_tracking import (  # pylint: disable=import-outside-toplevel
            MobileSOSAlert,
            MobileTrackingSession,
            MobileTrackingSubject,
        )
    except (ImportError, ModuleNotFoundError):
        return 0

    legacy_rows = db.query(MobileSOSAlert).order_by(MobileSOSAlert.triggered_at.asc()).all()
    changed = 0
    for row in legacy_rows:
        alarm = (
            db.query(Alarm)
            .filter(
                Alarm.source_type == "mobile_sos",
                Alarm.source_record_id == row.id,
            )
            .first()
        )
        session = (
            db.query(MobileTrackingSession)
            .filter(MobileTrackingSession.id == row.session_id)
            .first()
        )
        subject = None
        if session is not None:
            subject = (
                db.query(MobileTrackingSubject)
                .filter(MobileTrackingSubject.id == session.subject_id)
                .first()
            )
        subject_name = (
            getattr(subject, "display_name", None)
            or getattr(subject, "full_name", None)
            or getattr(subject, "name", None)
            or getattr(subject, "client_name", None)
            or "Mobile user"
        )
        unified_status = _mobile_status_for_unified(row.status)
        if alarm is None:
            alarm = create_alarm(
                db,
                source_type="mobile_sos",
                source_record_id=row.id,
                alarm_type="panic",
                title=f"Emergency SOS — {subject_name}",
                description=getattr(row, "message", None) or "Emergency SOS from GuardFlow Mobile.",
                severity="critical",
                triggered_at=row.triggered_at,
                case_id=getattr(session, "case_id", None) if session else None,
                latitude=row.latitude,
                longitude=row.longitude,
                metadata={
                    "legacy_mobile_sos_id": row.id,
                    "mobile_session_id": row.session_id,
                    "mobile_subject_id": row.subject_id,
                    "mobile_device_id": row.device_id,
                },
                commit=False,
            )
            alarm.status = unified_status
            alarm.acknowledged_at = getattr(row, "acknowledged_at", None)
            alarm.acknowledged_by_operator_id = getattr(
                row, "acknowledged_by_operator_id", None
            )
            alarm.resolved_at = getattr(row, "resolved_at", None)
            alarm.resolved_by_operator_id = getattr(row, "resolved_by_operator_id", None)
            changed += 1
        else:
            updates = {
                "status": unified_status,
                "latitude": row.latitude,
                "longitude": row.longitude,
                "acknowledged_at": getattr(row, "acknowledged_at", None),
                "acknowledged_by_operator_id": getattr(
                    row, "acknowledged_by_operator_id", None
                ),
                "resolved_at": getattr(row, "resolved_at", None),
                "resolved_by_operator_id": getattr(row, "resolved_by_operator_id", None),
            }
            for field_name, field_value in updates.items():
                if getattr(alarm, field_name) != field_value:
                    setattr(alarm, field_name, field_value)
                    changed += 1

    if changed:
        db.commit()
    return changed


def _mirror_to_legacy_mobile_sos(
    db: Session,
    alarm: Alarm,
    new_status: str,
    operator_id: str | None,
    now: datetime,
) -> None:
    if alarm.source_type != "mobile_sos" or not alarm.source_record_id:
        return
    try:
        from app.models.mobile_tracking import MobileSOSAlert  # pylint: disable=import-outside-toplevel
    except (ImportError, ModuleNotFoundError):
        return
    row = (
        db.query(MobileSOSAlert)
        .filter(MobileSOSAlert.id == alarm.source_record_id)
        .with_for_update()
        .first()
    )
    if row is None:
        return
    if new_status == "acknowledged":
        row.status = "acknowledged"
        row.acknowledged_at = now
        row.acknowledged_by_operator_id = operator_id
    elif new_status in {"resolved", "closed", "false_alarm"}:
        row.status = "resolved"
        row.resolved_at = now
        row.resolved_by_operator_id = operator_id
    elif new_status == "cancelled":
        row.status = "cancelled"
        if hasattr(row, "resolved_at"):
            row.resolved_at = now
        if hasattr(row, "resolved_by_operator_id"):
            row.resolved_by_operator_id = operator_id


def transition_alarm(
    db: Session,
    alarm_id: str,
    *,
    new_status: str,
    operator_id: str | None,
    notes: str | None = None,
    response_unit_id: str | None = None,
) -> Alarm:
    alarm = get_alarm_or_404(db, alarm_id, lock=True)
    old_status = alarm.status
    if old_status == new_status:
        return alarm
    if new_status not in ALLOWED_TRANSITIONS.get(old_status, set()):
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=f"Alarm cannot move from {old_status} to {new_status}.",
        )

    now = utc_now()
    alarm.status = new_status
    if new_status == "acknowledged":
        alarm.acknowledged_at = now
        alarm.acknowledged_by_operator_id = operator_id
    elif new_status == "dispatched":
        if not response_unit_id:
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail="A response unit is required before dispatch.",
            )
        alarm.dispatched_at = now
        alarm.dispatched_by_operator_id = operator_id
        alarm.response_unit_id = response_unit_id
        alarm.response_notes = notes
    elif new_status == "responding":
        alarm.responding_at = now
        if response_unit_id:
            alarm.response_unit_id = response_unit_id
        if notes:
            alarm.response_notes = notes
    elif new_status in {"resolved", "false_alarm", "cancelled"}:
        alarm.resolved_at = now
        alarm.resolved_by_operator_id = operator_id
        alarm.resolution_notes = notes
    elif new_status == "closed":
        alarm.closed_at = now
        alarm.closed_by_operator_id = operator_id
        if notes:
            alarm.resolution_notes = notes

    audit(
        db,
        alarm,
        f"alarm_{new_status}",
        operator_id=operator_id,
        from_status=old_status,
        to_status=new_status,
        notes=notes,
        details={"response_unit_id": response_unit_id} if response_unit_id else {},
    )
    _mirror_to_legacy_mobile_sos(db, alarm, new_status, operator_id, now)
    db.commit()
    db.refresh(alarm)
    return alarm


def normalize_panel_event(
    *,
    event_type: str | None,
    event_code: str | None,
    qualifier: str | None,
    description: str | None,
) -> dict[str, str | bool | None]:
    clean_type = str(event_type or "").strip().lower().replace(" ", "_")
    clean_code = str(event_code or "").strip().upper()
    clean_qualifier = str(qualifier or "").strip().upper()

    is_restore = clean_qualifier in {"R", "RESTORE", "3", "CLOSE"}
    if clean_type in {"restore", "restored", "alarm_restore"}:
        is_restore = True

    if clean_code in CONTACT_ID_CODES:
        alarm_type, default_title, severity = CONTACT_ID_CODES[clean_code]
    elif clean_code in SIA_CODES:
        alarm_type, default_title, severity = SIA_CODES[clean_code]
    elif clean_type:
        default_title, severity = EVENT_DEFAULTS.get(
            clean_type,
            (clean_type.replace("_", " ").title(), "medium"),
        )
        alarm_type = clean_type
    else:
        alarm_type, default_title, severity = ("general_alarm", "General alarm", "high")

    # Explicit SIA open/close and common text events are operational state events.
    if clean_code == "OP" or clean_type in {"disarm", "disarmed", "open"}:
        alarm_type, default_title, severity = "disarm", "Premises disarmed", "low"
    elif clean_code == "CL" or clean_type in {"arm", "armed", "close"}:
        alarm_type, default_title, severity = "arm", "Premises armed", "low"

    return {
        "alarm_type": alarm_type,
        "title": description.strip() if description and description.strip() else default_title,
        "severity": severity,
        "is_restore": is_restore,
        "is_state_event": alarm_type in {"arm", "disarm", "arm_disarm", "remote_arm_disarm"},
    }


def _resolve_zone(db: Session, panel_id: str, zone_number: str | None) -> AlarmZone | None:
    if not zone_number:
        return None
    return (
        db.query(AlarmZone)
        .filter(
            AlarmZone.panel_id == panel_id,
            AlarmZone.zone_number == str(zone_number),
        )
        .first()
    )


def ingest_panel_event(
    db: Session,
    *,
    panel: AlarmPanel,
    payload: Any,
) -> tuple[str, Alarm | None, AlarmSite, str]:
    site = db.query(AlarmSite).filter(AlarmSite.id == panel.site_id).first()
    if site is None:
        raise HTTPException(status_code=404, detail="The panel site no longer exists.")
    if site.status != "active":
        raise HTTPException(status_code=409, detail="This alarm site is not active.")

    panel.last_seen_at = utc_now()
    panel.status = "online"

    if payload.event_id:
        duplicate = (
            db.query(Alarm)
            .filter(
                Alarm.panel_id == panel.id,
                Alarm.external_event_id == payload.event_id,
            )
            .first()
        )
        if duplicate is not None:
            db.commit()
            return "duplicate", duplicate, site, "This panel event was already received."

    normalized = normalize_panel_event(
        event_type=payload.event_type,
        event_code=payload.event_code,
        qualifier=payload.qualifier,
        description=payload.description,
    )
    zone = _resolve_zone(db, panel.id, payload.zone_number)
    alarm_type = str(normalized["alarm_type"])

    if normalized["is_state_event"]:
        if alarm_type == "disarm" or str(payload.qualifier or "").upper() in {"OP", "OPEN", "DISARM"}:
            site.armed_state = "disarmed"
        else:
            requested_mode = str(payload.raw_payload.get("armed_mode", "armed_away"))
            site.armed_state = requested_mode if requested_mode in {"armed_away", "armed_stay"} else "armed_away"
        db.commit()
        return "state_updated", None, site, f"Site state updated to {site.armed_state}."

    if normalized["is_restore"]:
        query = db.query(Alarm).filter(
            Alarm.site_id == site.id,
            Alarm.alarm_type == alarm_type,
            Alarm.status.in_(OPEN_STATUSES),
        )
        if zone is not None:
            query = query.filter(Alarm.zone_id == zone.id)
        existing = query.order_by(Alarm.triggered_at.desc()).first()
        if existing is not None:
            old_status = existing.status
            existing.status = "resolved"
            existing.resolved_at = payload.occurred_at or utc_now()
            existing.resolution_notes = "Automatic restore received from alarm panel."
            audit(
                db,
                existing,
                "panel_restore",
                from_status=old_status,
                to_status="resolved",
                notes=existing.resolution_notes,
                details={"panel_event_id": payload.event_id},
            )
            db.commit()
            db.refresh(existing)
            return "alarm_restored", existing, site, "Matching alarm automatically resolved."
        db.commit()
        return "state_updated", None, site, "Restore received; no matching open alarm was found."

    severity = zone.severity_override if zone and zone.severity_override else str(normalized["severity"])
    title = str(normalized["title"])
    if zone is not None:
        title = f"{title} — {zone.name}"
    source_type = "business" if site.site_type in {"business", "industrial"} else site.site_type
    alarm = create_alarm(
        db,
        source_type=source_type,
        source_record_id=(f"{panel.id}:{payload.event_id}" if payload.event_id else None),
        external_event_id=payload.event_id,
        site_id=site.id,
        panel_id=panel.id,
        zone_id=zone.id if zone else None,
        case_id=site.case_id,
        alarm_type=alarm_type,
        event_code=payload.event_code,
        title=title,
        description=payload.description,
        severity=severity,
        triggered_at=payload.occurred_at,
        latitude=payload.latitude if payload.latitude is not None else site.latitude,
        longitude=payload.longitude if payload.longitude is not None else site.longitude,
        metadata={
            "qualifier": payload.qualifier,
            "partition": payload.partition,
            "zone_number": payload.zone_number,
            "raw_payload": payload.raw_payload,
            "panel_protocol": panel.protocol,
        },
        commit=False,
    )
    db.commit()
    db.refresh(alarm)
    return "alarm_created", alarm, site, "Alarm accepted by the GuardFlow control room."


def trigger_internal_alarm(db: Session, payload: Any, operator_id: str | None) -> tuple[Alarm, bool]:
    rule = (
        db.query(AlarmRule)
        .filter(
            AlarmRule.source_type == payload.source_type,
            AlarmRule.event_type == payload.event_type,
        )
        .first()
    )
    if rule is not None and not rule.enabled:
        raise HTTPException(status_code=409, detail="This automatic alarm rule is disabled.")

    severity = payload.severity or (rule.severity if rule else None)
    if not severity:
        severity = EVENT_DEFAULTS.get(payload.event_type, ("", "medium"))[1]

    dedupe_key = payload.dedupe_key or payload.external_event_id
    if dedupe_key:
        cooldown = rule.cooldown_seconds if rule else 300
        cutoff = utc_now() - timedelta(seconds=cooldown)
        duplicate = (
            db.query(Alarm)
            .filter(
                Alarm.source_type == payload.source_type,
                Alarm.external_event_id == dedupe_key,
                Alarm.triggered_at >= cutoff,
                Alarm.status.in_(OPEN_STATUSES),
            )
            .first()
        )
        if duplicate is not None:
            return duplicate, True

    alarm = create_alarm(
        db,
        source_type=payload.source_type,
        source_record_id=payload.source_record_id,
        external_event_id=dedupe_key,
        vehicle_id=payload.vehicle_id,
        case_id=payload.case_id,
        alarm_type=payload.event_type,
        title=payload.title,
        description=payload.description,
        severity=severity,
        triggered_at=payload.triggered_at,
        latitude=payload.latitude,
        longitude=payload.longitude,
        metadata={
            **payload.metadata_json,
            "rule_id": rule.id if rule else None,
            "automatic": True,
        },
        operator_id=operator_id,
    )
    return alarm, False


def alarm_detail(db: Session, alarm: Alarm) -> dict[str, Any]:
    site = db.query(AlarmSite).filter(AlarmSite.id == alarm.site_id).first() if alarm.site_id else None
    panel = db.query(AlarmPanel).filter(AlarmPanel.id == alarm.panel_id).first() if alarm.panel_id else None
    zone = db.query(AlarmZone).filter(AlarmZone.id == alarm.zone_id).first() if alarm.zone_id else None
    contacts = (
        db.query(AlarmSiteContact)
        .filter(AlarmSiteContact.site_id == alarm.site_id)
        .order_by(AlarmSiteContact.priority.asc())
        .all()
        if alarm.site_id
        else []
    )
    from app.models.alarm import AlarmResponseUnit  # local to keep import list compact

    response_unit = (
        db.query(AlarmResponseUnit).filter(AlarmResponseUnit.id == alarm.response_unit_id).first()
        if alarm.response_unit_id
        else None
    )
    data = {column.name: getattr(alarm, column.name) for column in Alarm.__table__.columns}
    data.update(
        {
            "site": site,
            "panel": panel,
            "zone": zone,
            "response_unit": response_unit,
            "site_contacts": contacts,
        }
    )
    return data


def count_metrics(db: Session, scoped_query=None) -> dict[str, int]:
    query = scoped_query if scoped_query is not None else db.query(Alarm)
    open_query = query.filter(Alarm.status.in_(OPEN_STATUSES))
    total_open = open_query.count()
    by_severity = {
        severity: open_query.filter(Alarm.severity == severity).count()
        for severity in ("critical", "high", "medium", "low")
    }
    sites_online = db.query(AlarmPanel).filter(AlarmPanel.status == "online").count()
    panels_offline = db.query(AlarmPanel).filter(AlarmPanel.status != "online").count()
    return {
        "total_open": total_open,
        **by_severity,
        "unacknowledged": open_query.filter(Alarm.status == "active").count(),
        "dispatched": open_query.filter(Alarm.status == "dispatched").count(),
        "responding": open_query.filter(Alarm.status == "responding").count(),
        "sites_online": sites_online,
        "panels_offline": panels_offline,
    }
