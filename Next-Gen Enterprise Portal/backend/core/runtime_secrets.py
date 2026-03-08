from __future__ import annotations

import os
from pathlib import Path
from typing import Iterable

_FILE_SUFFIX = "_FILE"
_BOOTSTRAPPED = False


def _read_secret_file(path: str) -> str:
    file_path = Path(path).expanduser()
    if not file_path.exists():
        raise RuntimeError(f"Secret file does not exist: {file_path}")
    if not file_path.is_file():
        raise RuntimeError(f"Secret file path is not a regular file: {file_path}")
    return file_path.read_text(encoding="utf-8").rstrip("\r\n")


def bootstrap_process_secrets() -> None:
    global _BOOTSTRAPPED

    if _BOOTSTRAPPED:
        return

    for env_name in list(os.environ):
        if not env_name.endswith(_FILE_SUFFIX):
            continue
        base_name = env_name[: -len(_FILE_SUFFIX)]
        if os.environ.get(base_name):
            continue

        file_path = str(os.environ.get(env_name) or "").strip()
        if not file_path:
            raise RuntimeError(f"{env_name} is set but empty.")
        os.environ[base_name] = _read_secret_file(file_path)

    _BOOTSTRAPPED = True


def get_env(name: str, *, default: str | None = None, allow_blank: bool = False) -> str:
    bootstrap_process_secrets()

    value = os.getenv(name)
    if value is None:
        return "" if default is None else default
    if value == "" and not allow_blank:
        return "" if default is None else default
    return value


def get_required_env(name: str) -> str:
    value = str(get_env(name)).strip()
    if not value:
        file_name = f"{name}{_FILE_SUFFIX}"
        raise RuntimeError(
            f"{name} is required. Configure {name} or {file_name} before starting the service."
        )
    return value


def validate_required_envs(names: Iterable[str]) -> None:
    missing = [name for name in names if not str(get_env(name)).strip()]
    if missing:
        formatted = ", ".join(sorted(missing))
        raise RuntimeError(
            f"Missing required environment variables or secret files: {formatted}."
        )
