#!/usr/bin/env python3
from __future__ import annotations

import argparse
import ast
import configparser
import json
from pathlib import Path
from typing import Any


def _as_jsonable(value: Any) -> Any:
    if isinstance(value, (str, int, float, bool)) or value is None:
        return value
    if isinstance(value, (list, tuple)):
        return [_as_jsonable(v) for v in value]
    if isinstance(value, dict):
        return {str(k): _as_jsonable(v) for k, v in value.items()}
    return str(value)


def _literal(node: ast.AST) -> Any:
    try:
        return ast.literal_eval(node)
    except Exception:
        return None


def _extract_revision_fields(module: ast.Module) -> tuple[Any, Any]:
    revision = None
    down_revision = None
    for stmt in module.body:
        if not isinstance(stmt, ast.Assign):
            continue
        if len(stmt.targets) != 1:
            continue
        target = stmt.targets[0]
        if not isinstance(target, ast.Name):
            continue
        if target.id == "revision":
            revision = _literal(stmt.value)
        elif target.id == "down_revision":
            down_revision = _literal(stmt.value)
    return revision, down_revision


def _normalize_down_revision(value: Any) -> list[str]:
    if value is None:
        return []
    if isinstance(value, str):
        return [value]
    if isinstance(value, (list, tuple)):
        return [str(v) for v in value if v]
    return []


def run_guard(backend_root: Path) -> dict[str, Any]:
    errors: list[str] = []
    warnings: list[str] = []
    details: dict[str, Any] = {}

    migrations_dir = backend_root / "db_migrations" / "versions"
    alembic_ini = backend_root / "alembic.ini"
    startup_file = backend_root / "core" / "startup.py"
    database_file = backend_root / "core" / "database.py"
    migrations_runner = backend_root / "core" / "migrations.py"

    if not migrations_dir.exists():
        errors.append(f"Missing migrations directory: {migrations_dir}")
        return {"ok": False, "errors": errors, "warnings": warnings, "details": details}

    revision_files = sorted(
        p for p in migrations_dir.glob("*.py") if p.name != "__init__.py"
    )
    details["revision_files"] = [str(p) for p in revision_files]

    if not revision_files:
        errors.append("No Alembic revision files found under db_migrations/versions")

    revisions: dict[str, Path] = {}
    down_refs: dict[str, list[str]] = {}

    for file_path in revision_files:
        source = file_path.read_text(encoding="utf-8")
        try:
            tree = ast.parse(source)
        except SyntaxError as exc:
            errors.append(f"Syntax error in migration file {file_path}: {exc}")
            continue

        revision, down_revision = _extract_revision_fields(tree)
        if not isinstance(revision, str) or not revision.strip():
            errors.append(f"Missing/invalid revision id in {file_path}")
            continue

        if revision in revisions:
            errors.append(
                f"Duplicate revision id '{revision}' in {file_path} and {revisions[revision]}"
            )
        revisions[revision] = file_path
        down_refs[revision] = _normalize_down_revision(down_revision)

    for revision, parents in down_refs.items():
        for parent in parents:
            if parent not in revisions:
                errors.append(
                    f"Revision '{revision}' references unknown down_revision '{parent}'"
                )

    referenced = {parent for parents in down_refs.values() for parent in parents}
    heads = sorted(set(revisions.keys()) - referenced)
    details["heads"] = heads
    if revisions and len(heads) != 1:
        errors.append(f"Expected exactly 1 migration head, found {len(heads)}: {heads}")

    if not alembic_ini.exists():
        errors.append(f"Missing alembic.ini: {alembic_ini}")
    else:
        parser = configparser.ConfigParser()
        parser.read(alembic_ini, encoding="utf-8")
        script_location = parser.get("alembic", "script_location", fallback="").strip()
        details["script_location"] = script_location
        if script_location != "db_migrations":
            errors.append(
                "alembic.ini [alembic].script_location must be 'db_migrations'"
            )

    if not migrations_runner.exists():
        errors.append(f"Missing migration runner: {migrations_runner}")
    else:
        runner_text = migrations_runner.read_text(encoding="utf-8")
        if "command.upgrade" not in runner_text:
            errors.append("core/migrations.py must execute Alembic command.upgrade")

    if not startup_file.exists():
        errors.append(f"Missing startup file: {startup_file}")
    else:
        startup_text = startup_file.read_text(encoding="utf-8")
        if "run_db_migrations()" not in startup_text:
            errors.append("core/startup.py must call run_db_migrations() during startup")

    if not database_file.exists():
        errors.append(f"Missing database file: {database_file}")
    else:
        db_text = database_file.read_text(encoding="utf-8")
        if "apply_startup_migrations" in db_text:
            errors.append("core/database.py still contains apply_startup_migrations")
        if "ALTER TABLE " in db_text or "CREATE TABLE " in db_text:
            warnings.append(
                "core/database.py contains raw schema SQL; verify it is not startup migration logic"
            )

    return {
        "ok": not errors,
        "errors": errors,
        "warnings": warnings,
        "details": _as_jsonable(details),
    }


def main() -> int:
    parser = argparse.ArgumentParser(description="Guard Alembic migration integrity.")
    parser.add_argument(
        "--backend-root",
        default="backend",
        help="Backend root path containing alembic.ini and db_migrations/",
    )
    parser.add_argument(
        "--output",
        choices=("plain", "json"),
        default="plain",
        help="Output format.",
    )
    parser.add_argument(
        "--report-file",
        default="",
        help="Optional path to write JSON report.",
    )
    args = parser.parse_args()

    backend_root = Path(args.backend_root).resolve()
    report = run_guard(backend_root)

    if args.report_file:
        report_path = Path(args.report_file).resolve()
        report_path.parent.mkdir(parents=True, exist_ok=True)
        report_path.write_text(json.dumps(report, ensure_ascii=False, indent=2), encoding="utf-8")

    if args.output == "json":
        print(json.dumps(report, ensure_ascii=False, indent=2))
    else:
        status = "PASS" if report["ok"] else "FAIL"
        print(f"[migration-guard] {status}")
        for msg in report["errors"]:
            print(f"[error] {msg}")
        for msg in report["warnings"]:
            print(f"[warn] {msg}")
        heads = report["details"].get("heads", [])
        if heads:
            print(f"[info] migration head: {heads[0]}")

    return 0 if report["ok"] else 1


if __name__ == "__main__":
    raise SystemExit(main())
