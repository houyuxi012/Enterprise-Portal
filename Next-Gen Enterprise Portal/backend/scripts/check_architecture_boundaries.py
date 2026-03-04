#!/usr/bin/env python3
"""
Architecture boundary guard for backend.

Purpose:
- Block reintroduction of legacy import paths:
  - models / schemas / database / dependencies / routers
- Ensure compatibility shim files are not recreated:
  - backend/models.py, backend/schemas.py, backend/database.py, backend/dependencies.py
"""

from __future__ import annotations

import argparse
import json
import os
import re
import sys
from dataclasses import dataclass
from datetime import UTC, datetime
from pathlib import Path


DEFAULT_CONFIG_FILE = "backend/scripts/architecture-guard.config.json"
DEFAULT_MODE = "normal"
DEFAULT_OUTPUT = "plain"
DEFAULT_FORBIDDEN_IMPORT_PATTERNS = (
    r"^\s*from\s+models\s+import\s+",
    r"^\s*import\s+models(\s|$)",
    r"^\s*from\s+schemas\s+import\s+",
    r"^\s*import\s+schemas(\s|$)",
    r"^\s*from\s+database\s+import\s+",
    r"^\s*import\s+database(\s|$)",
    r"^\s*from\s+dependencies\s+import\s+",
    r"^\s*import\s+dependencies(\s|$)",
    r"^\s*from\s+routers\.[\w.]+\s+import\s+",
    r"^\s*import\s+routers(\s|$)",
)
DEFAULT_FORBIDDEN_FILES = (
    "backend/models.py",
    "backend/schemas.py",
    "backend/database.py",
    "backend/dependencies.py",
)
DEFAULT_SKIP_DIR_NAMES = {"__pycache__", ".pytest_cache", ".mypy_cache", ".ruff_cache", ".git"}


class GuardError(Exception):
    pass


@dataclass
class CliArgs:
    root: str
    extra: list[str]
    config: str | None
    mode: str | None
    output: str
    report_file: str | None


def _now_iso() -> str:
    return datetime.now(UTC).isoformat()


def _parse_cli() -> CliArgs:
    parser = argparse.ArgumentParser(description="Check architecture boundary violations.")
    parser.add_argument("--root", default="backend", help="Primary root to scan (default: backend)")
    parser.add_argument(
        "--extra",
        action="append",
        default=[],
        help="Extra roots to scan (can be used multiple times)",
    )
    parser.add_argument(
        "--config",
        default=None,
        help=f"Optional config json path (default: {DEFAULT_CONFIG_FILE} if present)",
    )
    parser.add_argument(
        "--mode",
        default=None,
        help='Guard mode to load from config.modes (e.g. "normal" / "strict")',
    )
    parser.add_argument(
        "--output",
        default=DEFAULT_OUTPUT,
        choices=["plain", "json"],
        help='Output format: "plain" (default) or "json"',
    )
    parser.add_argument(
        "--report-file",
        default=None,
        help="Optional path to write JSON report payload",
    )
    ns = parser.parse_args()
    return CliArgs(
        root=ns.root,
        extra=ns.extra,
        config=ns.config,
        mode=ns.mode,
        output=ns.output,
        report_file=ns.report_file,
    )


def _resolve_mode(config_obj: dict, mode_value: str | None) -> str:
    return (
        mode_value
        or str(os.environ.get("BACKEND_ARCH_GUARD_MODE") or os.environ.get("ARCH_GUARD_MODE") or DEFAULT_MODE).strip()
        or str(config_obj.get("defaultMode") or "").strip()
        or DEFAULT_MODE
    )


def _validate_mode_config(
    mode_config: dict, *, context: str
) -> tuple[list[re.Pattern[str]], tuple[str, ...], set[str]]:
    pattern_strings = tuple(mode_config.get("forbiddenImportPatterns", ()))
    forbidden_files = tuple(mode_config.get("forbiddenFiles", ()))
    skip_dirs = set(mode_config.get("skipDirNames", ()))

    if not pattern_strings or not all(isinstance(item, str) and item.strip() for item in pattern_strings):
        raise GuardError(f"{context}: forbiddenImportPatterns must be a non-empty string array")
    if not all(isinstance(item, str) and item.strip() for item in forbidden_files):
        raise GuardError(f"{context}: forbiddenFiles must be a string array")
    if not all(isinstance(item, str) and item.strip() for item in skip_dirs):
        raise GuardError(f"{context}: skipDirNames must be a string array")

    compiled_patterns: list[re.Pattern[str]] = []
    for pattern in pattern_strings:
        try:
            compiled_patterns.append(re.compile(pattern, re.MULTILINE))
        except re.error as exc:
            raise GuardError(f"{context}: invalid regex in forbiddenImportPatterns: {pattern!r} ({exc})") from exc
    return compiled_patterns, forbidden_files, skip_dirs


def _load_guard_config(
    cwd: Path, config_value: str | None, mode_value: str | None
) -> tuple[list[re.Pattern[str]], tuple[str, ...], set[str], str, str]:
    if config_value:
        config_path = Path(config_value)
        if not config_path.is_absolute():
            config_path = cwd / config_path
        if not config_path.exists():
            raise GuardError(f"config file not found: {config_path}")
    else:
        config_path = cwd / DEFAULT_CONFIG_FILE

    pattern_strings: tuple[str, ...] = DEFAULT_FORBIDDEN_IMPORT_PATTERNS
    forbidden_files: tuple[str, ...] = DEFAULT_FORBIDDEN_FILES
    skip_dirs: set[str] = set(DEFAULT_SKIP_DIR_NAMES)

    if config_path.exists():
        try:
            config_obj = json.loads(config_path.read_text(encoding="utf-8"))
        except Exception as exc:  # noqa: BLE001
            raise GuardError(f"invalid config file {config_path}: {exc}") from exc
        if not isinstance(config_obj, dict):
            raise GuardError(f"invalid config file {config_path}: root must be a JSON object")

        resolved_mode = _resolve_mode(config_obj, mode_value)
        modes = config_obj.get("modes")
        if modes is not None:
            if not isinstance(modes, dict):
                raise GuardError(f"invalid config file {config_path}: modes must be a JSON object")
            mode_config = modes.get(resolved_mode)
            if not isinstance(mode_config, dict):
                available = ", ".join(sorted(modes.keys())) or "(none)"
                raise GuardError(f'invalid config file {config_path}: mode "{resolved_mode}" not found, available: {available}')
            compiled, forbidden_files_t, skip_dirs_s = _validate_mode_config(
                mode_config, context=f"config {config_path} mode={resolved_mode}"
            )
            return compiled, forbidden_files_t, skip_dirs_s, resolved_mode, str(config_path)

        fallback_config = {
            "forbiddenImportPatterns": config_obj.get("forbiddenImportPatterns", DEFAULT_FORBIDDEN_IMPORT_PATTERNS),
            "forbiddenFiles": config_obj.get("forbiddenFiles", DEFAULT_FORBIDDEN_FILES),
            "skipDirNames": config_obj.get("skipDirNames", sorted(DEFAULT_SKIP_DIR_NAMES)),
        }
        compiled, forbidden_files_t, skip_dirs_s = _validate_mode_config(
            fallback_config, context=f"config {config_path} (legacy)"
        )
        return compiled, forbidden_files_t, skip_dirs_s, resolved_mode, str(config_path)

    if config_value:
        raise GuardError(f"config file not found: {config_path}")

    compiled_patterns, forbidden_files_t, skip_dirs_s = _validate_mode_config(
        {
            "forbiddenImportPatterns": pattern_strings,
            "forbiddenFiles": forbidden_files,
            "skipDirNames": sorted(skip_dirs),
        },
        context="default config",
    )
    return compiled_patterns, forbidden_files_t, skip_dirs_s, DEFAULT_MODE, str(config_path)


def _iter_py_files(root: Path, skip_dir_names: set[str]):
    for path in root.rglob("*.py"):
        if any(part in skip_dir_names for part in path.parts):
            continue
        yield path


def _check_file(path: Path, forbidden_import_patterns: list[re.Pattern[str]]) -> list[dict]:
    violations: list[dict] = []
    try:
        content = path.read_text(encoding="utf-8")
    except UnicodeDecodeError:
        content = path.read_text(encoding="utf-8", errors="ignore")

    for pattern in forbidden_import_patterns:
        for match in pattern.finditer(content):
            line_no = content.count("\n", 0, match.start()) + 1
            snippet = match.group(0).strip()
            violations.append(
                {
                    "type": "forbidden_import",
                    "file": str(path),
                    "line": line_no,
                    "message": f"forbidden import: {snippet}",
                }
            )
    return violations


def _write_report_if_needed(report_file: str | None, payload: dict) -> None:
    if not report_file:
        return
    report_path = Path(report_file)
    if not report_path.is_absolute():
        report_path = Path.cwd() / report_path
    report_path.parent.mkdir(parents=True, exist_ok=True)
    report_path.write_text(json.dumps(payload, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")


def _emit(payload: dict, output: str, report_file: str | None) -> None:
    _write_report_if_needed(report_file, payload)
    if output == "json":
        print(json.dumps(payload, ensure_ascii=False, indent=2))
        return
    if payload["status"] == "pass":
        print(f'Architecture boundary check passed (mode={payload["mode"]}).')
        return
    if payload.get("error"):
        print(f'Architecture boundary check failed: {payload["error"]}', file=sys.stderr)
        return
    print("Architecture boundary check failed:")
    for item in payload.get("violations", []):
        if item["type"] == "forbidden_file":
            print(f'  - {item["file"]}: {item["message"]}')
        else:
            print(f'  - {item["file"]}:{item["line"]}: {item["message"]}')


def run(args: CliArgs) -> tuple[int, dict]:
    cwd = Path.cwd()
    roots = [cwd / args.root] + [cwd / p for p in args.extra]
    forbidden_import_patterns, forbidden_files, skip_dir_names, resolved_mode, resolved_config = _load_guard_config(
        cwd, args.config, args.mode
    )

    violations: list[dict] = []
    for rel_file in forbidden_files:
        path = cwd / rel_file
        if path.exists():
            violations.append(
                {
                    "type": "forbidden_file",
                    "file": str(path),
                    "line": None,
                    "message": "forbidden compatibility file exists",
                }
            )

    scanned_roots: list[str] = []
    for root in roots:
        if not root.exists():
            continue
        scanned_roots.append(str(root))
        for py in _iter_py_files(root, skip_dir_names):
            violations.extend(_check_file(py, forbidden_import_patterns))

    payload = {
        "tool": "backend-architecture-guard",
        "status": "fail" if violations else "pass",
        "mode": resolved_mode,
        "configPath": resolved_config,
        "checkedAt": _now_iso(),
        "roots": scanned_roots,
        "violations": violations,
    }
    return (1 if violations else 0), payload


def main() -> int:
    args = _parse_cli()
    try:
        code, payload = run(args)
        _emit(payload, args.output, args.report_file)
        return code
    except GuardError as exc:
        payload = {
            "tool": "backend-architecture-guard",
            "status": "fail",
            "mode": args.mode or DEFAULT_MODE,
            "configPath": str((Path.cwd() / (args.config or DEFAULT_CONFIG_FILE)).resolve()),
            "checkedAt": _now_iso(),
            "roots": [str((Path.cwd() / args.root).resolve())],
            "violations": [],
            "error": str(exc),
        }
        _emit(payload, args.output, args.report_file)
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
