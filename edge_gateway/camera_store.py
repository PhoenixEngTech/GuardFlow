import json
import os
import re
from pathlib import Path
from typing import Optional

from pydantic import BaseModel, SecretStr, ValidationError

from config import settings
from schemas import EdgeCameraCollection, EdgeCameraConfig


ENVIRONMENT_VARIABLE_PATTERN = re.compile(
    r"^[A-Z_][A-Z0-9_]*$"
)

FORBIDDEN_CREDENTIAL_FIELDS = {
    "username",
    "password",
    "camera_username",
    "camera_password",
    "credentials",
    "credential",
    "rtsp_url",
    "connection_url",
}


class CameraCredentials(BaseModel):
    username: SecretStr
    password: SecretStr


def get_configuration_path(
    configuration_path: Optional[Path] = None,
) -> Path:
    path = (
        configuration_path
        or settings.CAMERA_CONFIGURATION_FILE
    )

    return path.expanduser().resolve()


def initialise_camera_configuration(
    configuration_path: Optional[Path] = None,
) -> Path:
    """
    Create an empty local camera configuration file when
    the gateway is starting for the first time.
    """

    path = get_configuration_path(
        configuration_path
    )

    path.parent.mkdir(
        parents=True,
        exist_ok=True,
    )

    if not path.exists():
        path.write_text(
            json.dumps(
                {
                    "cameras": [],
                },
                indent=2,
            ),
            encoding="utf-8",
        )

    return path


def reject_plaintext_credentials(
    raw_camera: object,
    camera_index: int,
) -> None:
    """
    Prevent usernames, passwords or complete camera URLs
    from being stored inside cameras.json.
    """

    if not isinstance(raw_camera, dict):
        return

    supplied_fields = {
        str(field_name).strip().lower()
        for field_name in raw_camera
    }

    forbidden_fields = (
        supplied_fields
        & FORBIDDEN_CREDENTIAL_FIELDS
    )

    if forbidden_fields:
        raise RuntimeError(
            "Camera configuration entry "
            f"{camera_index + 1} contains forbidden "
            "credential fields. Store credentials in "
            "environment variables only."
        )


def validate_environment_variable_name(
    variable_name: str,
    camera_name: str,
) -> None:
    if not ENVIRONMENT_VARIABLE_PATTERN.fullmatch(
        variable_name
    ):
        raise RuntimeError(
            f"Camera '{camera_name}' contains an invalid "
            f"environment variable reference."
        )


def load_camera_configuration(
    configuration_path: Optional[Path] = None,
) -> list[EdgeCameraConfig]:
    """
    Load and validate local camera records.

    Missing configuration files are safely initialised
    with an empty camera collection.
    """

    path = initialise_camera_configuration(
        configuration_path
    )

    try:
        raw_data = json.loads(
            path.read_text(
                encoding="utf-8"
            )
        )

    except json.JSONDecodeError as exc:
        raise RuntimeError(
            "The edge gateway camera configuration "
            "contains invalid JSON."
        ) from exc

    except OSError as exc:
        raise RuntimeError(
            "The edge gateway could not read its "
            "camera configuration file."
        ) from exc

    raw_cameras = (
        raw_data.get("cameras", [])
        if isinstance(raw_data, dict)
        else []
    )

    if not isinstance(raw_cameras, list):
        raise RuntimeError(
            "The camera configuration must contain "
            "a cameras list."
        )

    for camera_index, raw_camera in enumerate(
        raw_cameras
    ):
        reject_plaintext_credentials(
            raw_camera,
            camera_index,
        )

    try:
        camera_collection = (
            EdgeCameraCollection.model_validate(
                raw_data
            )
        )

    except ValidationError as exc:
        raise RuntimeError(
            "The edge gateway camera configuration "
            "failed validation."
        ) from exc

    camera_ids: set[str] = set()
    connection_sources: set[
        tuple[str, int, str]
    ] = set()

    for camera in camera_collection.cameras:
        if camera.camera_id in camera_ids:
            raise RuntimeError(
                "Duplicate camera_id detected: "
                f"{camera.camera_id}"
            )

        camera_ids.add(
            camera.camera_id
        )

        source_key = (
            camera.host.lower(),
            camera.port,
            camera.stream_path or "",
        )

        if source_key in connection_sources:
            raise RuntimeError(
                "Multiple cameras use the same host, "
                "port and stream path."
            )

        connection_sources.add(
            source_key
        )

        username_variable = (
            camera.username_environment_variable
        )

        password_variable = (
            camera.password_environment_variable
        )

        if bool(username_variable) != bool(
            password_variable
        ):
            raise RuntimeError(
                f"Camera '{camera.name}' must define "
                "both username and password environment "
                "variable references, or neither."
            )

        if username_variable:
            validate_environment_variable_name(
                username_variable,
                camera.name,
            )

        if password_variable:
            validate_environment_variable_name(
                password_variable,
                camera.name,
            )

    return camera_collection.cameras


def get_camera_credentials(
    camera: EdgeCameraConfig,
) -> Optional[CameraCredentials]:
    """
    Resolve credentials from the local gateway environment.

    Secret values are wrapped with SecretStr so accidental
    logging does not reveal them.
    """

    username_variable = (
        camera.username_environment_variable
    )

    password_variable = (
        camera.password_environment_variable
    )

    if not username_variable and not password_variable:
        return None

    if not username_variable or not password_variable:
        raise RuntimeError(
            f"Camera '{camera.name}' has incomplete "
            "credential references."
        )

    username = os.getenv(
        username_variable
    )

    password = os.getenv(
        password_variable
    )

    if username is None or username == "":
        raise RuntimeError(
            f"The username secret required by camera "
            f"'{camera.name}' is not configured."
        )

    if password is None or password == "":
        raise RuntimeError(
            f"The password secret required by camera "
            f"'{camera.name}' is not configured."
        )

    return CameraCredentials(
        username=SecretStr(username),
        password=SecretStr(password),
    )
