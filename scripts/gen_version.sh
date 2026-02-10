#!/usr/bin/env bash
set -euo pipefail

# Usage:
#   VERSION=2.5.0 CHANNEL=stable BUILD_NUMBER=123 ./gen_version.sh
#   CHANNEL=dev ./gen_version.sh

PRODUCT_NAME="Next-Gen Enterprise Portal"
PRODUCT_ID="enterprise-portal"

VERSION="${VERSION:-0.0.0}"
CHANNEL="${CHANNEL:-dev}"          # stable | beta | dev | nightly
API_VERSION="${API_VERSION:-v1}"

# Git
GIT_SHA="$(git rev-parse --short HEAD 2>/dev/null || echo "unknown")"
DIRTY="false"
if git status --porcelain >/dev/null 2>&1 && [[ -n "$(git status --porcelain)" ]]; then
  DIRTY="true"
  GIT_SHA="${GIT_SHA}-dirty"
fi

BUILD_TIME="$(date -u +"%Y-%m-%dT%H:%M:%SZ")"

# Build identity
BUILD_NUMBER="${BUILD_NUMBER:-0}"                         # CI pipeline number if available
BUILD_ID="${BUILD_ID:-$(date -u +"%Y%m%d%H%M%S")}"         # globally unique per build
RELEASE_ID="${RELEASE_ID:-R$(date -u +"%Y%m%d")-${BUILD_ID}}"

# DB schema version (prefer alembic revision if available)
DB_SCHEMA_VERSION="${DB_SCHEMA_VERSION:-}"
if [[ -z "${DB_SCHEMA_VERSION}" ]]; then
  if command -v alembic >/dev/null 2>&1; then
    # Try to get current revision; adapt if your output differs
    DB_SCHEMA_VERSION="$(alembic current 2>/dev/null | awk '{print $1}' | head -n1 || true)"
  fi
fi
DB_SCHEMA_VERSION="${DB_SCHEMA_VERSION:-unknown}"

# SemVer pre-release suffix
FULL_VERSION="${VERSION}"
case "${CHANNEL}" in
  stable)
    FULL_VERSION="${VERSION}"
    ;;
  beta)
    FULL_VERSION="${VERSION}-beta.${BUILD_ID}"
    ;;
  nightly)
    FULL_VERSION="${VERSION}-nightly.$(date -u +"%Y%m%d")"
    ;;
  dev|*)
    FULL_VERSION="${VERSION}-dev.${BUILD_ID}"
    ;;
esac

BACKEND_DIR="./backend"
OUTPUT_FILE="${BACKEND_DIR}/VERSION.json"
mkdir -p "${BACKEND_DIR}"

echo "Generating version info..."
echo "  product:  ${PRODUCT_NAME} (${PRODUCT_ID})"
echo "  version:  ${FULL_VERSION}"
echo "  channel:  ${CHANNEL}"
echo "  git_sha:  ${GIT_SHA}"
echo "  build_id: ${BUILD_ID}"

cat > "${OUTPUT_FILE}" <<EOF
{
  "product": "${PRODUCT_NAME}",
  "product_id": "${PRODUCT_ID}",
  "version": "${FULL_VERSION}",
  "semver": "${VERSION}",
  "channel": "${CHANNEL}",
  "git_sha": "${GIT_SHA}",
  "dirty": ${DIRTY},
  "build_time": "${BUILD_TIME}",
  "build_number": "${BUILD_NUMBER}",
  "build_id": "${BUILD_ID}",
  "release_id": "${RELEASE_ID}",
  "api_version": "${API_VERSION}",
  "db_schema_version": "${DB_SCHEMA_VERSION}"
}
EOF

echo "Done: ${OUTPUT_FILE}"
cat "${OUTPUT_FILE}"