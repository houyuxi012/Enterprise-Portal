#!/usr/bin/env bash
set -euo pipefail

# Usage:
#   VERSION=2.5.0 CHANNEL=stable BUILD_NUMBER=123 ./ops/scripts/gen_version.sh
#   ./ops/scripts/gen_version.sh
#
# Notes:
# - Safe to run from any working directory.
# - Writes the authoritative backend metadata file at backend/VERSION.json by default.
# - If VERSION/CHANNEL/API_VERSION are omitted, the script reuses backend/VERSION.json first,
#   then falls back to git tag / sensible defaults.

SCRIPT_DIR="$(CDPATH= cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(CDPATH= cd -- "${SCRIPT_DIR}/../.." && pwd)"
BACKEND_DIR="${PROJECT_ROOT}/backend"
VERSION_FILE_DEFAULT="${BACKEND_DIR}/VERSION.json"
OUTPUT_FILE="${OUTPUT_FILE:-${VERSION_FILE_DEFAULT}}"

PRODUCT_NAME_DEFAULT="Next-Gen Enterprise Portal"
PRODUCT_ID_DEFAULT="HYX-NGEP"
API_VERSION_DEFAULT="v1"

mkdir -p "$(dirname "${OUTPUT_FILE}")"

json_get() {
  local file="$1"
  local key="$2"
  python3 - "$file" "$key" <<'PY'
import json
import sys
from pathlib import Path

path = Path(sys.argv[1])
key = sys.argv[2]
if not path.exists():
    raise SystemExit(0)
try:
    data = json.loads(path.read_text(encoding="utf-8"))
except Exception:
    raise SystemExit(0)
value = data.get(key, "")
if isinstance(value, bool):
    print("true" if value else "false")
elif value is None:
    print("")
else:
    print(str(value))
PY
}

detect_git_tag_version() {
  local raw_tag
  raw_tag="$(git -C "${PROJECT_ROOT}" describe --tags --abbrev=0 2>/dev/null || true)"
  raw_tag="${raw_tag#v}"
  printf '%s' "${raw_tag}"
}

detect_db_schema_version() {
  python3 - "${BACKEND_DIR}/db_migrations/versions" <<'PY'
import ast
import re
import sys
from pathlib import Path

versions_dir = Path(sys.argv[1])
if not versions_dir.exists():
    print("unknown")
    raise SystemExit(0)

revision_re = re.compile(r"^\s*revision\s*=\s*(.+?)\s*$")
down_re = re.compile(r"^\s*down_revision\s*=\s*(.+?)\s*$")

revisions = set()
down_revisions = set()

for path in sorted(versions_dir.glob("*.py")):
    revision = None
    down_revision = None
    for raw_line in path.read_text(encoding="utf-8").splitlines():
        if revision is None:
            match = revision_re.match(raw_line)
            if match:
                try:
                    revision = ast.literal_eval(match.group(1))
                except Exception:
                    revision = None
                continue
        if down_revision is None:
            match = down_re.match(raw_line)
            if match:
                try:
                    down_revision = ast.literal_eval(match.group(1))
                except Exception:
                    down_revision = None
    if revision:
        revisions.add(str(revision))
    if isinstance(down_revision, tuple):
        down_revisions.update(str(item) for item in down_revision if item)
    elif down_revision:
        down_revisions.add(str(down_revision))

heads = sorted(revisions - down_revisions)
print(",".join(heads) if heads else "unknown")
PY
}

sanitize_channel() {
  local raw="${1:-}"
  case "${raw}" in
    stable|beta|dev|nightly)
      printf '%s' "${raw}"
      ;;
    *)
      printf 'dev'
      ;;
  esac
}

build_full_version() {
  local semver="$1"
  local channel="$2"
  local build_id="$3"

  case "${channel}" in
    stable)
      printf '%s' "${semver}"
      ;;
    beta)
      printf '%s-beta.%s' "${semver}" "${build_id}"
      ;;
    nightly)
      printf '%s-nightly.%s' "${semver}" "$(date -u +"%Y%m%d")"
      ;;
    dev|*)
      printf '%s-dev.%s' "${semver}" "${build_id}"
      ;;
  esac
}

EXISTING_VERSION_FILE="${VERSION_FILE_DEFAULT}"
EXISTING_PRODUCT_NAME="$(json_get "${EXISTING_VERSION_FILE}" "product")"
EXISTING_PRODUCT_ID="$(json_get "${EXISTING_VERSION_FILE}" "product_id")"
EXISTING_SEMVER="$(json_get "${EXISTING_VERSION_FILE}" "semver")"
EXISTING_CHANNEL="$(json_get "${EXISTING_VERSION_FILE}" "channel")"
EXISTING_API_VERSION="$(json_get "${EXISTING_VERSION_FILE}" "api_version")"

PRODUCT_NAME="${PRODUCT_NAME:-${EXISTING_PRODUCT_NAME:-${PRODUCT_NAME_DEFAULT}}}"
PRODUCT_ID="${PRODUCT_ID:-${EXISTING_PRODUCT_ID:-${PRODUCT_ID_DEFAULT}}}"
SEMVER_SOURCE="${VERSION:-${EXISTING_SEMVER:-$(detect_git_tag_version)}}"
SEMVER="${SEMVER_SOURCE:-0.0.0}"
CHANNEL="$(sanitize_channel "${CHANNEL:-${EXISTING_CHANNEL:-dev}}")"
API_VERSION="${API_VERSION:-${EXISTING_API_VERSION:-${API_VERSION_DEFAULT}}}"

GIT_SHA="$(git -C "${PROJECT_ROOT}" rev-parse --short HEAD 2>/dev/null || echo "unknown")"
GIT_REF="$(git -C "${PROJECT_ROOT}" rev-parse --abbrev-ref HEAD 2>/dev/null || echo "unknown")"
DIRTY="false"
if git -C "${PROJECT_ROOT}" status --porcelain >/dev/null 2>&1 && [[ -n "$(git -C "${PROJECT_ROOT}" status --porcelain)" ]]; then
  DIRTY="true"
  GIT_SHA="${GIT_SHA}-dirty"
fi

BUILD_TIME="$(date -u +"%Y-%m-%dT%H:%M:%SZ")"
BUILD_NUMBER="${BUILD_NUMBER:-0}"
BUILD_ID="${BUILD_ID:-$(date -u +"%Y%m%d%H%M%S")}"
RELEASE_ID="${RELEASE_ID:-R$(date -u +"%Y%m%d")-${BUILD_ID}}"
DB_SCHEMA_VERSION="${DB_SCHEMA_VERSION:-$(detect_db_schema_version)}"
FULL_VERSION="$(build_full_version "${SEMVER}" "${CHANNEL}" "${BUILD_ID}")"

TMP_FILE="$(mktemp "${OUTPUT_FILE}.XXXXXX")"
trap 'rm -f "${TMP_FILE}"' EXIT

cat > "${TMP_FILE}" <<EOF
{
  "product": "${PRODUCT_NAME}",
  "product_id": "${PRODUCT_ID}",
  "version": "${FULL_VERSION}",
  "semver": "${SEMVER}",
  "channel": "${CHANNEL}",
  "git_sha": "${GIT_SHA}",
  "git_ref": "${GIT_REF}",
  "dirty": ${DIRTY},
  "build_time": "${BUILD_TIME}",
  "build_number": "${BUILD_NUMBER}",
  "build_id": "${BUILD_ID}",
  "release_id": "${RELEASE_ID}",
  "api_version": "${API_VERSION}",
  "db_schema_version": "${DB_SCHEMA_VERSION}"
}
EOF

mv "${TMP_FILE}" "${OUTPUT_FILE}"
trap - EXIT

echo "Generating version info..."
echo "  project_root:      ${PROJECT_ROOT}"
echo "  output_file:       ${OUTPUT_FILE}"
echo "  product:           ${PRODUCT_NAME} (${PRODUCT_ID})"
echo "  semver:            ${SEMVER}"
echo "  version:           ${FULL_VERSION}"
echo "  channel:           ${CHANNEL}"
echo "  git_ref:           ${GIT_REF}"
echo "  git_sha:           ${GIT_SHA}"
echo "  build_id:          ${BUILD_ID}"
echo "  db_schema_version: ${DB_SCHEMA_VERSION}"

if [[ -f "${SCRIPT_DIR}/backend/VERSION.json" ]]; then
  echo "warning: found stray ${SCRIPT_DIR}/backend/VERSION.json from the old relative-path generator." >&2
  echo "warning: authoritative version file is now ${OUTPUT_FILE}" >&2
fi

echo "Done: ${OUTPUT_FILE}"
cat "${OUTPUT_FILE}"
