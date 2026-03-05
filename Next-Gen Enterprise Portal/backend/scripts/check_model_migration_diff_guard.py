#!/usr/bin/env python3
from __future__ import annotations

import argparse
import json
import re
import subprocess
from pathlib import Path
from typing import Any


MODEL_FILE_PATTERN = re.compile(
    r"^Next-Gen Enterprise Portal/backend/"
    r"(modules/models\.py|modules/.+/models\.py|iam/.+/models\.py|shared/base_models\.py)$"
)
MIGRATION_FILE_PATTERN = re.compile(
    r"^Next-Gen Enterprise Portal/backend/db_migrations/versions/.+\.py$"
)


def _run_git_diff(repo_root: Path, base: str, head: str) -> list[str]:
    cmd = ["git", "diff", "--name-only", base, head]
    proc = subprocess.run(
        cmd,
        cwd=str(repo_root),
        capture_output=True,
        text=True,
        check=False,
    )
    if proc.returncode != 0:
        stderr = proc.stderr.strip() or "unknown git diff error"
        raise RuntimeError(f"git diff failed: {stderr}")
    return [line.strip() for line in proc.stdout.splitlines() if line.strip()]


def check_guard(repo_root: Path, base: str, head: str) -> dict[str, Any]:
    changed_files = _run_git_diff(repo_root, base, head)

    model_changes = [p for p in changed_files if MODEL_FILE_PATTERN.match(p)]
    migration_changes = [p for p in changed_files if MIGRATION_FILE_PATTERN.match(p)]

    ok = True
    errors: list[str] = []
    if model_changes and not migration_changes:
        ok = False
        errors.append(
            "Detected ORM model changes but no Alembic revision file change under "
            "backend/db_migrations/versions/*.py."
        )

    return {
        "ok": ok,
        "base": base,
        "head": head,
        "changed_files_count": len(changed_files),
        "model_changes": model_changes,
        "migration_changes": migration_changes,
        "errors": errors,
    }


def main() -> int:
    parser = argparse.ArgumentParser(
        description="Require Alembic revision changes when model files change.",
    )
    parser.add_argument("--base", required=True, help="Git base commit SHA")
    parser.add_argument("--head", required=True, help="Git head commit SHA")
    parser.add_argument(
        "--repo-root",
        default=".",
        help="Repository root (where .git exists)",
    )
    parser.add_argument(
        "--output",
        choices=("plain", "json"),
        default="plain",
        help="Output format",
    )
    parser.add_argument(
        "--report-file",
        default="",
        help="Optional JSON report file path",
    )
    args = parser.parse_args()

    report = check_guard(Path(args.repo_root).resolve(), args.base, args.head)

    if args.report_file:
        report_path = Path(args.report_file).resolve()
        report_path.parent.mkdir(parents=True, exist_ok=True)
        report_path.write_text(json.dumps(report, ensure_ascii=False, indent=2), encoding="utf-8")

    if args.output == "json":
        print(json.dumps(report, ensure_ascii=False, indent=2))
    else:
        print("[model-migration-diff-guard] PASS" if report["ok"] else "[model-migration-diff-guard] FAIL")
        if report["model_changes"]:
            print(f"[info] model changes: {len(report['model_changes'])}")
            for item in report["model_changes"]:
                print(f"  - {item}")
        if report["migration_changes"]:
            print(f"[info] migration changes: {len(report['migration_changes'])}")
            for item in report["migration_changes"]:
                print(f"  - {item}")
        for msg in report["errors"]:
            print(f"[error] {msg}")

    return 0 if report["ok"] else 1


if __name__ == "__main__":
    raise SystemExit(main())
