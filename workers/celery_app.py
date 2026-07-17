import os

from celery import Celery


def get_environment_value(
    primary_name: str,
    fallback_name: str | None = None,
    default: str | None = None,
) -> str:
    value = os.getenv(primary_name)

    if not value and fallback_name:
        value = os.getenv(fallback_name)

    if not value:
        value = default

    if not value:
        raise RuntimeError(
            f"Required environment variable "
            f"{primary_name} is not configured."
        )

    return value


BROKER_URL = get_environment_value(
    "CELERY_BROKER_URL",
    fallback_name="REDIS_URL",
    default="redis://localhost:6379/0",
)

RESULT_BACKEND = get_environment_value(
    "CELERY_RESULT_BACKEND",
    fallback_name="REDIS_URL",
    default=BROKER_URL,
)


celery_app = Celery(
    "guardflow_workers",
    broker=BROKER_URL,
    backend=RESULT_BACKEND,
)


celery_app.conf.update(
    timezone=os.getenv(
        "CELERY_TIMEZONE",
        "Africa/Johannesburg",
    ),
    enable_utc=True,

    task_serializer="json",
    result_serializer="json",
    accept_content=["json"],

    task_track_started=True,
    task_acks_late=True,
    task_reject_on_worker_lost=True,

    worker_prefetch_multiplier=1,
    worker_send_task_events=True,

    broker_connection_retry=True,
    broker_connection_retry_on_startup=True,
    broker_connection_max_retries=None,
    broker_connection_timeout=10,

    result_expires=3600,

    task_soft_time_limit=50,
    task_time_limit=60,

    task_default_queue="guardflow",
    task_default_exchange="guardflow",
    task_default_routing_key="guardflow.default",
)


@celery_app.task(
    name="guardflow.worker.ping",
    bind=True,
)
def worker_ping(self) -> dict:
    """
    Lightweight task used to verify that Redis and the
    GuardFlow Celery worker are operating correctly.
    """

    return {
        "status": "online",
        "service": "GuardFlow VisionFlow Worker",
        "task_id": self.request.id,
    }


if __name__ == "__main__":
    celery_app.start()
