"""Notification outbox for GuardFlow alarms.

Browser alerts are delivered by AlarmBanner.jsx. This module queues and sends
email, SMS and WhatsApp through administrator-configured providers. SMS and
WhatsApp use a generic JSON webhook so GuardFlow is not locked to one vendor.
"""

from __future__ import annotations

import json
import os
import smtplib
import urllib.request
from datetime import datetime, timezone
from email.message import EmailMessage
from typing import Any

from sqlalchemy.orm import Session

from app.models.alarm import Alarm, AlarmNotification, AlarmSite, AlarmSiteContact


def _message_for_alarm(alarm: Alarm, site: AlarmSite | None) -> tuple[str, str]:
    site_label = site.site_name if site else (alarm.vehicle_id or alarm.source_type)
    subject = f"[{alarm.severity.upper()}] GuardFlow {alarm.alarm_number}"
    location = ""
    if alarm.latitude is not None and alarm.longitude is not None:
        location = f" GPS: {alarm.latitude:.6f}, {alarm.longitude:.6f}."
    message = (
        f"{alarm.title} at {site_label}. "
        f"Status: {alarm.status}. Triggered: {alarm.triggered_at.isoformat()}."
        f"{location} Ref: {alarm.alarm_number}."
    )
    return subject, message


def queue_site_notifications(db: Session, alarm: Alarm) -> int:
    if not alarm.site_id:
        return 0
    site = db.query(AlarmSite).filter(AlarmSite.id == alarm.site_id).first()
    contacts = (
        db.query(AlarmSiteContact)
        .filter(AlarmSiteContact.site_id == alarm.site_id)
        .order_by(AlarmSiteContact.priority.asc())
        .all()
    )
    subject, message = _message_for_alarm(alarm, site)
    count = 0
    for contact in contacts:
        channels: list[tuple[str, str]] = []
        if contact.notify_by_email and contact.email:
            channels.append(("email", contact.email))
        if contact.notify_by_sms and contact.phone_number:
            channels.append(("sms", contact.phone_number))
        for channel, recipient in channels:
            exists = (
                db.query(AlarmNotification)
                .filter(
                    AlarmNotification.alarm_id == alarm.id,
                    AlarmNotification.channel == channel,
                    AlarmNotification.recipient == recipient,
                )
                .first()
            )
            if exists:
                continue
            db.add(
                AlarmNotification(
                    alarm_id=alarm.id,
                    channel=channel,
                    recipient=recipient,
                    status="queued",
                    subject=subject,
                    message=message,
                    payload_json={
                        "alarm_id": alarm.id,
                        "alarm_number": alarm.alarm_number,
                        "severity": alarm.severity,
                        "site_id": alarm.site_id,
                    },
                )
            )
            count += 1
    return count


def _post_webhook(url: str, notification: AlarmNotification) -> None:
    body = json.dumps(
        {
            "to": notification.recipient,
            "subject": notification.subject,
            "message": notification.message,
            "metadata": notification.payload_json,
        }
    ).encode("utf-8")
    request = urllib.request.Request(
        url,
        data=body,
        headers={"Content-Type": "application/json"},
        method="POST",
    )
    with urllib.request.urlopen(request, timeout=15) as response:  # nosec B310
        if response.status >= 300:
            raise RuntimeError(f"Notification webhook returned HTTP {response.status}.")


def _send_email(notification: AlarmNotification) -> None:
    host = os.getenv("GUARDFLOW_SMTP_HOST")
    if not host:
        raise RuntimeError("GUARDFLOW_SMTP_HOST is not configured.")
    port = int(os.getenv("GUARDFLOW_SMTP_PORT", "587"))
    username = os.getenv("GUARDFLOW_SMTP_USERNAME")
    password = os.getenv("GUARDFLOW_SMTP_PASSWORD")
    sender = os.getenv("GUARDFLOW_EMAIL_FROM", username or "guardflow@localhost")
    message = EmailMessage()
    message["From"] = sender
    message["To"] = notification.recipient
    message["Subject"] = notification.subject or "GuardFlow alarm"
    message.set_content(notification.message)
    with smtplib.SMTP(host, port, timeout=15) as smtp:
        if os.getenv("GUARDFLOW_SMTP_STARTTLS", "true").lower() == "true":
            smtp.starttls()
        if username:
            smtp.login(username, password or "")
        smtp.send_message(message)


def process_notification_outbox(db: Session, limit: int = 100) -> dict[str, int]:
    queued = (
        db.query(AlarmNotification)
        .filter(AlarmNotification.status.in_(["queued", "retry"]))
        .order_by(AlarmNotification.queued_at.asc())
        .limit(limit)
        .all()
    )
    sent = failed = 0
    for item in queued:
        item.attempt_count += 1
        try:
            if item.channel == "email":
                _send_email(item)
            elif item.channel == "sms":
                url = os.getenv("GUARDFLOW_SMS_WEBHOOK_URL")
                if not url:
                    raise RuntimeError("GUARDFLOW_SMS_WEBHOOK_URL is not configured.")
                _post_webhook(url, item)
            elif item.channel == "whatsapp":
                url = os.getenv("GUARDFLOW_WHATSAPP_WEBHOOK_URL")
                if not url:
                    raise RuntimeError("GUARDFLOW_WHATSAPP_WEBHOOK_URL is not configured.")
                _post_webhook(url, item)
            else:
                raise RuntimeError(f"Unsupported notification channel: {item.channel}")
            item.status = "sent"
            item.sent_at = datetime.now(timezone.utc)
            item.last_error = None
            sent += 1
        except Exception as exc:  # provider/network errors are retained for audit
            item.status = "retry" if item.attempt_count < 5 else "failed"
            item.last_error = str(exc)[:2000]
            failed += 1
    db.commit()
    return {"processed": len(queued), "sent": sent, "failed": failed}


def process_notification_outbox_new_session(limit: int = 100) -> dict[str, int]:
    """Background-task entry point that owns its database session."""
    from app.core.database import SessionLocal

    db = SessionLocal()
    try:
        return process_notification_outbox(db, limit=limit)
    finally:
        db.close()
