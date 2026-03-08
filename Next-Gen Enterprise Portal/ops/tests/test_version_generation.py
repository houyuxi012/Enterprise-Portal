from __future__ import annotations

import ast
import json
import os
import re
import subprocess
import tempfile
from datetime import datetime, timezone
from pathlib import Path
from unittest import TestCase


PROJECT_ROOT = Path(__file__).resolve().parents[2]
SCRIPT_PATH = PROJECT_ROOT / "ops" / "scripts" / "gen_version.sh"
BACKEND_VERSION_FILE = PROJECT_ROOT / "backend" / "VERSION.json"
MIGRATIONS_DIR = PROJECT_ROOT / "backend" / "db_migrations" / "versions"


def _detect_db_schema_version() -> str:
    revision_re = re.compile(r"^\s*revision\s*=\s*(.+?)\s*$")
    down_re = re.compile(r"^\s*down_revision\s*=\s*(.+?)\s*$")

    revisions: set[str] = set()
    down_revisions: set[str] = set()

    for path in sorted(MIGRATIONS_DIR.glob("*.py")):
        revision = None
        down_revision = None
        for raw_line in path.read_text(encoding="utf-8").splitlines():
            if revision is None:
                match = revision_re.match(raw_line)
                if match:
                    revision = ast.literal_eval(match.group(1))
                    continue
            if down_revision is None:
                match = down_re.match(raw_line)
                if match:
                    down_revision = ast.literal_eval(match.group(1))

        if revision:
            revisions.add(str(revision))
        if isinstance(down_revision, tuple):
            down_revisions.update(str(item) for item in down_revision if item)
        elif down_revision:
            down_revisions.add(str(down_revision))

    heads = sorted(revisions - down_revisions)
    return ",".join(heads) if heads else "unknown"


def _expected_version(semver: str, channel: str, build_id: str) -> str:
    if channel == "stable":
        return semver
    if channel == "beta":
        return f"{semver}-beta.{build_id}"
    if channel == "nightly":
        nightly_date = datetime.now(timezone.utc).strftime("%Y%m%d")
        return f"{semver}-nightly.{nightly_date}"
    return f"{semver}-dev.{build_id}"


class VersionGenerationTests(TestCase):
    def _run_gen_version(self, cwd: Path, **env_overrides: str) -> dict[str, object]:
        with tempfile.TemporaryDirectory() as tmp_dir:
            output_path = Path(tmp_dir) / "VERSION.generated.json"
            env = os.environ.copy()
            env.update(env_overrides)
            env["OUTPUT_FILE"] = str(output_path)

            subprocess.run(
                ["bash", str(SCRIPT_PATH)],
                cwd=str(cwd),
                env=env,
                check=True,
                capture_output=True,
                text=True,
            )

            return json.loads(output_path.read_text(encoding="utf-8"))

    def test_script_reuses_existing_backend_version_metadata_by_default(self):
        current_version = json.loads(BACKEND_VERSION_FILE.read_text(encoding="utf-8"))
        build_id = "20260306153045"

        generated = self._run_gen_version(
            PROJECT_ROOT,
            BUILD_ID=build_id,
            BUILD_NUMBER="42",
        )

        self.assertEqual(generated["product"], current_version["product"])
        self.assertEqual(generated["product_id"], current_version["product_id"])
        self.assertEqual(generated["semver"], current_version["semver"])
        self.assertEqual(generated["channel"], current_version["channel"])
        self.assertEqual(generated["api_version"], current_version["api_version"])
        self.assertEqual(
            generated["version"],
            _expected_version(current_version["semver"], current_version["channel"], build_id),
        )
        self.assertEqual(
            generated["git_ref"],
            subprocess.check_output(
                ["git", "-C", str(PROJECT_ROOT), "rev-parse", "--abbrev-ref", "HEAD"],
                text=True,
            ).strip(),
        )
        self.assertEqual(generated["db_schema_version"], _detect_db_schema_version())

    def test_script_accepts_explicit_overrides_from_scripts_directory(self):
        generated = self._run_gen_version(
            SCRIPT_PATH.parent,
            VERSION="2.5.0",
            CHANNEL="stable",
            API_VERSION="v9",
            BUILD_ID="20260306160000",
            BUILD_NUMBER="7",
            RELEASE_ID="R20260306-20260306160000",
            DB_SCHEMA_VERSION="schema-head-42",
            PRODUCT_NAME="Portal X",
            PRODUCT_ID="portal-x",
        )

        self.assertEqual(generated["product"], "Portal X")
        self.assertEqual(generated["product_id"], "portal-x")
        self.assertEqual(generated["semver"], "2.5.0")
        self.assertEqual(generated["channel"], "stable")
        self.assertEqual(generated["version"], "2.5.0")
        self.assertEqual(generated["api_version"], "v9")
        self.assertEqual(generated["build_number"], "7")
        self.assertEqual(generated["build_id"], "20260306160000")
        self.assertEqual(generated["release_id"], "R20260306-20260306160000")
        self.assertEqual(generated["db_schema_version"], "schema-head-42")
