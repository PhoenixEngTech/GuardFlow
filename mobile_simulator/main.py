import argparse
import json
import sys
from datetime import datetime, timezone
from typing import Any

from cloud_client import (
    GuardFlowMobileCloudClient,
    GuardFlowMobileCloudError,
)
from schemas import (
    MobileLocationSubmission,
    MobileSOSSubmission,
)


def print_response(
    heading: str,
    response: Any,
) -> None:
    print(heading)

    if response is None:
        print("No response body.")
        return

    print(
        json.dumps(
            response,
            indent=2,
            default=str,
        )
    )


def build_argument_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(
        description=(
            "GuardFlow secure mobile companion "
            "simulator."
        )
    )

    commands = parser.add_subparsers(
        dest="command",
        required=True,
    )

    commands.add_parser(
        "heartbeat",
        help="Send an authenticated device heartbeat.",
    )

    location_parser = commands.add_parser(
        "location",
        help=(
            "Submit a GPS location during an active "
            "tracking session."
        ),
    )

    location_parser.add_argument(
        "--session-id",
        required=True,
    )

    location_parser.add_argument(
        "--latitude",
        required=True,
        type=float,
    )

    location_parser.add_argument(
        "--longitude",
        required=True,
        type=float,
    )

    location_parser.add_argument(
        "--accuracy",
        type=float,
        default=None,
    )

    location_parser.add_argument(
        "--altitude",
        type=float,
        default=None,
    )

    location_parser.add_argument(
        "--speed",
        type=float,
        default=None,
    )

    location_parser.add_argument(
        "--heading",
        type=float,
        default=None,
    )

    location_parser.add_argument(
        "--battery",
        type=int,
        default=None,
    )

    sos_parser = commands.add_parser(
        "sos",
        help=(
            "Trigger an SOS alert during an active "
            "tracking session."
        ),
    )

    sos_parser.add_argument(
        "--session-id",
        required=True,
    )

    sos_parser.add_argument(
        "--latitude",
        required=True,
        type=float,
    )

    sos_parser.add_argument(
        "--longitude",
        required=True,
        type=float,
    )

    sos_parser.add_argument(
        "--accuracy",
        type=float,
        default=None,
    )

    sos_parser.add_argument(
        "--message",
        default="GuardFlow mobile simulator SOS test.",
    )

    return parser


def run_command(
    arguments: argparse.Namespace,
) -> None:
    with GuardFlowMobileCloudClient() as client:
        if arguments.command == "heartbeat":
            response = client.send_heartbeat()

            print_response(
                "Heartbeat accepted:",
                response,
            )

            return

        if arguments.command == "location":
            location = MobileLocationSubmission(
                session_id=arguments.session_id,
                latitude=arguments.latitude,
                longitude=arguments.longitude,
                accuracy_metres=arguments.accuracy,
                altitude_metres=arguments.altitude,
                speed_kmh=arguments.speed,
                heading_degrees=arguments.heading,
                battery_percentage=arguments.battery,
                recorded_at=datetime.now(
                    timezone.utc
                ),
            )

            response = client.submit_location(
                location
            )

            print_response(
                "Location accepted:",
                response,
            )

            return

        if arguments.command == "sos":
            sos_alert = MobileSOSSubmission(
                session_id=arguments.session_id,
                latitude=arguments.latitude,
                longitude=arguments.longitude,
                accuracy_metres=arguments.accuracy,
                message=arguments.message,
                triggered_at=datetime.now(
                    timezone.utc
                ),
            )

            response = client.trigger_sos(
                sos_alert
            )

            print_response(
                "SOS alert accepted:",
                response,
            )

            return

        raise RuntimeError(
            "Unknown simulator command."
        )


def main() -> int:
    parser = build_argument_parser()
    arguments = parser.parse_args()

    try:
        run_command(arguments)
        return 0

    except GuardFlowMobileCloudError as exc:
        print(
            f"GuardFlow request failed: {exc}",
            file=sys.stderr,
        )
        return 1

    except ValueError as exc:
        print(
            f"Simulator input is invalid: {exc}",
            file=sys.stderr,
        )
        return 1

    except KeyboardInterrupt:
        print(
            "\nSimulator stopped.",
            file=sys.stderr,
        )
        return 130


if __name__ == "__main__":
    raise SystemExit(main())