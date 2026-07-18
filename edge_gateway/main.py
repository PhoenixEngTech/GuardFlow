import argparse
import logging
import time
from typing import Sequence

from camera_store import load_camera_configuration
from cloud_client import (
    GuardFlowCloudClient,
    GuardFlowCloudError,
)
from config import settings
from health_monitor import check_all_cameras
from schemas import CameraHealthResult


logger = logging.getLogger(
    "guardflow-edge-gateway"
)


def configure_logging() -> None:
    """
    Configure safe console logging.

    Gateway tokens and camera credentials must never
    be written to logs.
    """

    logging.basicConfig(
        level=getattr(
            logging,
            settings.LOG_LEVEL.upper(),
            logging.INFO,
        ),
        format=(
            "%(asctime)s | %(levelname)s | "
            "%(name)s | %(message)s"
        ),
    )


def calculate_camera_counts(
    health_results: Sequence[
        CameraHealthResult
    ],
) -> tuple[int, int]:
    """
    Calculate online and offline camera totals.

    Cameras reporting an error are included in the
    offline total because they require attention.

    Disabled cameras are not counted as offline.
    """

    online_count = sum(
        1
        for result in health_results
        if result.status == "online"
    )

    offline_count = sum(
        1
        for result in health_results
        if result.status in {
            "offline",
            "error",
        }
    )

    return (
        online_count,
        offline_count,
    )


def report_camera_results(
    client: GuardFlowCloudClient,
    health_results: Sequence[
        CameraHealthResult
    ],
) -> None:
    """
    Submit each local camera health result to the
    GuardFlow cloud service.

    One failed camera report must not stop the entire
    gateway heartbeat cycle.
    """

    for health_result in health_results:
        try:
            client.report_camera_health(
                health_result
            )

            logger.info(
                "Camera health submitted: "
                "camera_id=%s status=%s",
                health_result.camera_id,
                health_result.status,
            )

        except GuardFlowCloudError as exc:
            logger.warning(
                "Camera health submission failed: "
                "camera_id=%s error=%s",
                health_result.camera_id,
                exc,
            )


def run_gateway_cycle() -> None:
    """
    Run one complete Edge Gateway monitoring cycle:

    1. Load the local camera configuration.
    2. Check camera connectivity.
    3. Submit camera health results.
    4. Send the secure gateway heartbeat.
    """

    cameras = load_camera_configuration(
        settings.CAMERA_CONFIGURATION_FILE
    )

    logger.info(
        "Loaded %s local camera configuration(s).",
        len(cameras),
    )

    health_results = check_all_cameras(
        cameras=cameras,
        timeout_seconds=(
            settings.HTTP_TIMEOUT_SECONDS
        ),
    )

    (
        online_camera_count,
        offline_camera_count,
    ) = calculate_camera_counts(
        health_results
    )

    client = GuardFlowCloudClient()

    try:
        report_camera_results(
            client,
            health_results,
        )

        heartbeat_response = (
            client.send_heartbeat(
                registered_camera_count=len(
                    cameras
                ),
                online_camera_count=(
                    online_camera_count
                ),
                offline_camera_count=(
                    offline_camera_count
                ),
            )
        )

        logger.info(
            "Cloud heartbeat successful: "
            "gateway_id=%s status=%s "
            "registered=%s online=%s offline=%s",
            heartbeat_response.get(
                "gateway_id",
                settings.GATEWAY_ID,
            ),
            heartbeat_response.get(
                "status",
                "unknown",
            ),
            len(cameras),
            online_camera_count,
            offline_camera_count,
        )

    finally:
        client.close()


def run_forever() -> None:
    """
    Keep the Edge Gateway running continuously.

    The cycle interval is controlled through:

    HEALTH_CHECK_INTERVAL_SECONDS
    """

    logger.info(
        "GuardFlow Edge Gateway starting: "
        "gateway_id=%s gateway_name=%s",
        settings.GATEWAY_ID,
        settings.GATEWAY_NAME,
    )

    logger.info(
        "Health monitoring interval: %s seconds.",
        settings.HEALTH_CHECK_INTERVAL_SECONDS,
    )

    while True:
        cycle_started_at = time.monotonic()

        try:
            run_gateway_cycle()

        except KeyboardInterrupt:
            raise

        except Exception:
            logger.exception(
                "The Edge Gateway monitoring cycle "
                "failed."
            )

        elapsed_seconds = (
            time.monotonic()
            - cycle_started_at
        )

        wait_seconds = max(
            (
                settings
                .HEALTH_CHECK_INTERVAL_SECONDS
                - elapsed_seconds
            ),
            1,
        )

        logger.info(
            "Next monitoring cycle in %.1f seconds.",
            wait_seconds,
        )

        time.sleep(wait_seconds)


def parse_arguments() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description=(
            "GuardFlow VisionFlow Edge Gateway"
        )
    )

    parser.add_argument(
        "--once",
        action="store_true",
        help=(
            "Run one monitoring and heartbeat "
            "cycle, then exit."
        ),
    )

    return parser.parse_args()


def main() -> None:
    configure_logging()

    arguments = parse_arguments()

    try:
        if arguments.once:
            logger.info(
                "Running one Edge Gateway cycle."
            )

            run_gateway_cycle()

            logger.info(
                "One-time Edge Gateway cycle "
                "completed."
            )

            return

        run_forever()

    except KeyboardInterrupt:
        logger.info(
            "GuardFlow Edge Gateway stopped safely."
        )


if __name__ == "__main__":
    main()
