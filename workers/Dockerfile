FROM python:3.12-slim

ENV PYTHONDONTWRITEBYTECODE=1
ENV PYTHONUNBUFFERED=1
ENV PIP_NO_CACHE_DIR=1

WORKDIR /app

COPY requirements.txt .

RUN pip install --no-cache-dir \
    --upgrade pip \
    && pip install --no-cache-dir \
    -r requirements.txt

COPY celery_app.py .
COPY visionflow_tasks.py .

RUN useradd \
    --create-home \
    --uid 10001 \
    guardflow \
    && chown -R guardflow:guardflow /app

USER guardflow

CMD [
    "celery",
    "-A",
    "celery_app:celery_app",
    "worker",
    "--loglevel=INFO",
    "--queues=guardflow,visionflow",
    "--concurrency=2"
]
