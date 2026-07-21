"""Drop-in hooks for vehicle, VisionFlow and railway modules.

Call these functions from the existing telemetry/camera ingestion paths after
saving the source event. They apply GuardFlow alarm rules and cooldown dedupe.
"""

from __future__ import annotations

from types import SimpleNamespace
from typing import Any

from sqlalchemy.orm import Session

from app.services.alarm_service import trigger_internal_alarm


def raise_automatic_alarm(
    db: Session,
    *,
    source_type: str,
    event_type: str,
    title: str,
    source_record_id: str | None = None,
    external_event_id: str | None = None,
    vehicle_id: str | None = None,
    case_id: str | None = None,
    latitude: float | None = None,
    longitude: float | None = None,
    description: str | None = None,
    severity: str | None = None,
    metadata: dict[str, Any] | None = None,
    dedupe_key: str | None = None,
):
    payload = SimpleNamespace(
        source_type=source_type,
        event_type=event_type,
        title=title,
        source_record_id=source_record_id,
        external_event_id=external_event_id,
        vehicle_id=vehicle_id,
        case_id=case_id,
        latitude=latitude,
        longitude=longitude,
        description=description,
        severity=severity,
        triggered_at=None,
        metadata_json=metadata or {},
        dedupe_key=dedupe_key,
    )
    return trigger_internal_alarm(db, payload, operator_id=None)


def process_vehicle_signals(
    db: Session,
    *,
    vehicle_id: str,
    case_id: str | None,
    latitude: float | None,
    longitude: float | None,
    speed_kmh: float | None = None,
    speed_limit_kmh: float | None = None,
    tracker_online: bool = True,
    low_battery: bool = False,
    unauthorised_movement: bool = False,
    impact_detected: bool = False,
    geofence_event: str | None = None,
    route_deviation: bool = False,
    ignition_after_hours: bool = False,
) -> list[Any]:
    events: list[tuple[str, str, str, dict[str, Any]]] = []
    if not tracker_online:
        events.append(("tracker_offline", "Vehicle tracker offline", "high", {}))
    if speed_kmh is not None and speed_limit_kmh is not None and speed_kmh > speed_limit_kmh:
        events.append(
            (
                "overspeed",
                f"Overspeed detected: {speed_kmh:.0f} km/h",
                "high",
                {"speed_kmh": speed_kmh, "speed_limit_kmh": speed_limit_kmh},
            )
        )
    if low_battery:
        events.append(("low_battery", "Vehicle tracker battery low", "medium", {}))
    if unauthorised_movement:
        events.append(("unauthorised_movement", "Unauthorised vehicle movement", "critical", {}))
    if impact_detected:
        events.append(("impact", "Possible vehicle collision", "critical", {}))
    if geofence_event in {"geofence_exit", "geofence_entry"}:
        events.append((geofence_event, geofence_event.replace("_", " ").title(), "high", {}))
    if route_deviation:
        events.append(("route_deviation", "Vehicle route deviation", "high", {}))
    if ignition_after_hours:
        events.append(("ignition_after_hours", "After-hours vehicle ignition", "high", {}))

    created = []
    for event_type, title, severity, metadata in events:
        alarm, duplicate = raise_automatic_alarm(
            db,
            source_type="vehicle",
            event_type=event_type,
            title=title,
            vehicle_id=vehicle_id,
            case_id=case_id,
            latitude=latitude,
            longitude=longitude,
            severity=severity,
            metadata=metadata,
            dedupe_key=f"vehicle:{vehicle_id}:{event_type}",
        )
        created.append((alarm, duplicate))
    return created


def process_vision_watchlist_hit(
    db: Session,
    *,
    hit_id: str,
    case_id: str | None,
    plate: str,
    latitude: float | None,
    longitude: float | None,
    confidence: float | None,
):
    return raise_automatic_alarm(
        db,
        source_type="vision",
        event_type="watchlist_hit",
        title=f"VisionFlow watchlist hit: {plate}",
        source_record_id=hit_id,
        case_id=case_id,
        latitude=latitude,
        longitude=longitude,
        metadata={"license_plate": plate, "confidence": confidence},
        dedupe_key=f"vision:{hit_id}",
    )
