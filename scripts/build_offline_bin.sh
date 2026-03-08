#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
APP_ROOT="${ROOT}/Next-Gen Enterprise Portal"
BUILD_ROOT="${ROOT}/build"
DOCS_ROOT="${ROOT}/docs/release"

SKU="core"
BUILD_APP_IMAGES=0
KEEP_STAGE=0
FETCH_DOCKER_RPMS=1
DOCKER_RPM_DIR="${DOCKER_RPM_DIR:-}"
DOCKER_RPM_CACHE_DIR="${DOCKER_RPM_CACHE_DIR:-${BUILD_ROOT}/docker-rpms/rockylinux9}"
VITE_API_BASE_URL="${VITE_API_BASE_URL:-/api/v1}"
BACKEND_SOURCE_IMAGE="${BACKEND_SOURCE_IMAGE:-next-genenterpriseportal-backend}"
FRONTEND_SOURCE_IMAGE="${FRONTEND_SOURCE_IMAGE:-next-genenterpriseportal-frontend}"
IMAGE_NAMESPACE="${IMAGE_NAMESPACE:-hyx}"
TARGET_DOCKER_PLATFORM="${TARGET_DOCKER_PLATFORM:-linux/amd64}"
TARGET_DOCKER_ARCH="${TARGET_DOCKER_ARCH:-amd64}"

PRODUCT_NAME="Next-Gen Enterprise Portal"
PRODUCT_SLUG="Next-Gen-Enterprise-Portal"
PRODUCT_ID="next-gen-enterprise-portal"
PRODUCT_DIR_NAME="Next-Gen-Enterprise-Portal"
SERVICE_NAME="hyx-portal"
SUPPORTED_OS="rockylinux9"
SUPPORTED_ARCH="x86_64"

DB_IMAGE="pgvector/pgvector:pg17"
REDIS_IMAGE="redis:8.4-alpine"
MINIO_IMAGE="minio/minio:RELEASE.2025-09-07T16-13-09Z"
LOKI_IMAGE="grafana/loki:2.9.4"
GRAFANA_IMAGE="${GRAFANA_IMAGE:-}"

usage() {
  cat <<'EOF'
Usage:
  bash scripts/build_offline_bin.sh [options]

Options:
  --sku core|full          Package SKU. Default: core
  --build-app-images       Build backend/frontend images from source before packaging
  --docker-rpm-dir <dir>   Reuse a local directory of Docker/Compose RPMs instead of downloading
  --no-fetch-docker-rpms   Build an app-only package without bundling Docker RPMs
  --keep-stage             Keep the generated staging directory after packaging
  -h, --help               Show this help

Environment:
  VITE_API_BASE_URL        Frontend build arg when --build-app-images is used
  BACKEND_SOURCE_IMAGE     Existing local backend image to reuse when not building
  FRONTEND_SOURCE_IMAGE    Existing local frontend image to reuse when not building
  IMAGE_NAMESPACE          Namespace for release image tags (default: hyx)
  GRAFANA_IMAGE            Prebuilt Grafana image for full SKU packaging
  DOCKER_RPM_CACHE_DIR     Cache directory for downloaded Rocky Linux Docker RPMs
  TARGET_DOCKER_PLATFORM   Image platform to package (default: linux/amd64)
  TARGET_DOCKER_ARCH       Expected packaged image architecture (default: amd64)

Behavior:
  - Generates package metadata from Next-Gen Enterprise Portal/backend/VERSION.json
  - Creates a root-level build/ directory with staging, manifest, and final .bin outputs
  - Bundles Docker Engine + Compose RPMs by default for true offline installation
  - Builds a self-extracting offline installer .bin that targets Rocky Linux 9 x86_64
EOF
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --sku)
      SKU="${2:-}"
      shift 2
      ;;
    --build-app-images)
      BUILD_APP_IMAGES=1
      shift
      ;;
    --docker-rpm-dir)
      DOCKER_RPM_DIR="${2:-}"
      shift 2
      ;;
    --no-fetch-docker-rpms)
      FETCH_DOCKER_RPMS=0
      shift
      ;;
    --keep-stage)
      KEEP_STAGE=1
      shift
      ;;
    -h|--help)
      usage
      exit 0
      ;;
    *)
      echo "Unsupported argument: $1" >&2
      usage >&2
      exit 1
      ;;
  esac
done

if [[ "${SKU}" != "core" && "${SKU}" != "full" ]]; then
  echo "--sku must be core or full" >&2
  exit 1
fi

if [[ "${SKU}" == "full" ]]; then
  echo "Full SKU packaging is not implemented in this script yet. Use --sku core." >&2
  exit 1
fi

if [[ -n "${DOCKER_RPM_DIR}" && "${DOCKER_RPM_DIR}" != /* ]]; then
  DOCKER_RPM_DIR="${ROOT}/${DOCKER_RPM_DIR}"
fi

require_cmd() {
  local cmd="$1"
  if ! command -v "$cmd" >/dev/null 2>&1; then
    echo "Required command not found: $cmd" >&2
    exit 1
  fi
}

checksum_file() {
  local path="$1"
  if command -v sha256sum >/dev/null 2>&1; then
    sha256sum "$path" | awk '{print $1}'
  else
    shasum -a 256 "$path" | awk '{print $1}'
  fi
}

json_get() {
  local file="$1"
  local key="$2"
  python3 - "$file" "$key" <<'PY'
import json
import sys
from pathlib import Path

path = Path(sys.argv[1])
key = sys.argv[2]
data = json.loads(path.read_text(encoding="utf-8"))
value = data.get(key, "")
print("" if value is None else str(value))
PY
}

write_text() {
  local path="$1"
  shift
  mkdir -p "$(dirname "$path")"
  cat >"$path"
}

write_template() {
  local path="$1"
  local mode="$2"
  local tmp
  tmp="$(mktemp)"
  cat >"$tmp"
  python3 - "$tmp" "$path" "$PACKAGE_VERSION" "$SEMVER" "$BUILD_ID" "$PACKAGE_STEM" "$SKU" "$PRODUCT_DIR_NAME" "$SERVICE_NAME" "$BACKEND_RELEASE_IMAGE" "$FRONTEND_RELEASE_IMAGE" "$DB_IMAGE" "$REDIS_IMAGE" "$MINIO_IMAGE" "$LOKI_IMAGE" "$GRAFANA_IMAGE" <<'PY'
import sys
from pathlib import Path

src = Path(sys.argv[1])
dest = Path(sys.argv[2])
replacements = {
    "@PACKAGE_VERSION@": sys.argv[3],
    "@SEMVER@": sys.argv[4],
    "@BUILD_ID@": sys.argv[5],
    "@PACKAGE_STEM@": sys.argv[6],
    "@PACKAGE_SKU@": sys.argv[7],
    "@PRODUCT_DIR_NAME@": sys.argv[8],
    "@SERVICE_NAME@": sys.argv[9],
    "@BACKEND_IMAGE@": sys.argv[10],
    "@FRONTEND_IMAGE@": sys.argv[11],
    "@DB_IMAGE@": sys.argv[12],
    "@REDIS_IMAGE@": sys.argv[13],
    "@MINIO_IMAGE@": sys.argv[14],
    "@LOKI_IMAGE@": sys.argv[15],
    "@GRAFANA_IMAGE@": sys.argv[16],
}
text = src.read_text(encoding="utf-8")
for key, value in replacements.items():
    text = text.replace(key, value)
dest.parent.mkdir(parents=True, exist_ok=True)
dest.write_text(text, encoding="utf-8")
PY
  chmod "$mode" "$path"
  rm -f "$tmp"
}

docker_image_exists() {
  local image="$1"
  docker image inspect "$image" >/dev/null 2>&1
}

docker_image_arch() {
  local image="$1"
  docker image inspect --format '{{.Architecture}}' "$image" 2>/dev/null | head -n 1
}

assert_image_arch() {
  local image="$1"
  local actual_arch
  actual_arch="$(docker_image_arch "$image")"
  if [[ "${actual_arch}" != "${TARGET_DOCKER_ARCH}" ]]; then
    echo "Image ${image} has architecture ${actual_arch:-unknown}, expected ${TARGET_DOCKER_ARCH}." >&2
    exit 1
  fi
}

needs_app_rebuild() {
  local image="$1"
  if ! docker_image_exists "$image"; then
    return 0
  fi
  [[ "$(docker_image_arch "$image")" != "${TARGET_DOCKER_ARCH}" ]]
}

ensure_platform_image() {
  local image="$1"
  local safe_image
  local temp_tag
  if docker_image_exists "$image"; then
    local existing_arch
    existing_arch="$(docker_image_arch "$image")"
    if [[ "${existing_arch}" == "${TARGET_DOCKER_ARCH}" ]]; then
      return
    fi
    echo "Replacing local ${image} (${existing_arch:-unknown}) with ${TARGET_DOCKER_PLATFORM}..."
    docker image rm -f "$image" >/dev/null 2>&1 || true
  fi
  safe_image="$(printf '%s' "$image" | tr '/:@' '---' | tr -cd '[:alnum:]_.-')"
  temp_tag="hyx/platform-cache:${safe_image}-${TARGET_DOCKER_ARCH}"
  echo "Materializing ${image} for ${TARGET_DOCKER_PLATFORM}..."
  local attempt
  for attempt in 1 2 3; do
    if docker buildx build \
      --platform "${TARGET_DOCKER_PLATFORM}" \
      --load \
      -t "${temp_tag}" \
      - <<EOF >/dev/null
FROM ${image}
EOF
    then
      docker tag "${temp_tag}" "${image}"
      docker image rm -f "${temp_tag}" >/dev/null 2>&1 || true
      assert_image_arch "$image"
      return
    fi
    if [[ "${attempt}" -lt 3 ]]; then
      echo "Retrying ${image} materialization (${attempt}/3 failed)..."
      sleep 5
    fi
  done
  echo "Failed to materialize ${image} for ${TARGET_DOCKER_PLATFORM} after 3 attempts." >&2
  exit 1
}

export_image() {
  local image="$1"
  local outfile="$2"
  echo "Exporting image: $image -> $outfile"
  docker save "$image" | gzip -c >"$outfile"
}

copy_rpms() {
  local src_dir="$1"
  local dest_dir="$2"
  mkdir -p "$dest_dir"
  find "$src_dir" -maxdepth 1 -name '*.rpm' -exec cp {} "$dest_dir"/ \;
}

require_cmd python3
require_cmd tar
require_cmd gzip
require_cmd docker

mkdir -p "${BUILD_ROOT}"

"${APP_ROOT}/ops/scripts/gen_version.sh"

VERSION_FILE="${APP_ROOT}/backend/VERSION.json"
SEMVER="$(json_get "${VERSION_FILE}" "semver")"
PACKAGE_VERSION="$(json_get "${VERSION_FILE}" "version")"
BUILD_ID="$(json_get "${VERSION_FILE}" "build_id")"
DB_SCHEMA_VERSION="$(json_get "${VERSION_FILE}" "db_schema_version")"

if [[ -z "${SEMVER}" || -z "${PACKAGE_VERSION}" || -z "${BUILD_ID}" ]]; then
  echo "Failed to read version metadata from ${VERSION_FILE}" >&2
  exit 1
fi

PACKAGE_BUILD="b${BUILD_ID}"
PACKAGE_STEM="${PRODUCT_SLUG}-${SEMVER}-${SUPPORTED_OS}-${SUPPORTED_ARCH}-offline-${SKU}-${PACKAGE_BUILD}"
STAGE_ROOT="${BUILD_ROOT}/${PACKAGE_STEM}"
PAYLOAD_ROOT="${STAGE_ROOT}/payload"
RELEASE_ROOT="${PAYLOAD_ROOT}/release"
IMAGES_ROOT="${PAYLOAD_ROOT}/images"
DOCKER_RPMS_ROOT="${PAYLOAD_ROOT}/docker-rpms"
MANIFEST_ROOT="${PAYLOAD_ROOT}/manifest"
DOCS_PAYLOAD_ROOT="${PAYLOAD_ROOT}/docs"

if [[ -e "${STAGE_ROOT}" ]]; then
  echo "Staging directory already exists: ${STAGE_ROOT}" >&2
  echo "Delete it manually if you want to rebuild the same package id." >&2
  exit 1
fi

BACKEND_RELEASE_IMAGE="${IMAGE_NAMESPACE}/next-gen-enterprise-portal-backend:${SEMVER}-${PACKAGE_BUILD}"
FRONTEND_RELEASE_IMAGE="${IMAGE_NAMESPACE}/next-gen-enterprise-portal-frontend:${SEMVER}-${PACKAGE_BUILD}"

mkdir -p "${RELEASE_ROOT}" "${IMAGES_ROOT}" "${DOCKER_RPMS_ROOT}" "${MANIFEST_ROOT}" "${DOCS_PAYLOAD_ROOT}"

if [[ -n "${DOCKER_RPM_DIR}" ]]; then
  if [[ ! -d "${DOCKER_RPM_DIR}" ]]; then
    echo "Docker RPM directory not found: ${DOCKER_RPM_DIR}" >&2
    exit 1
  fi
  if ! find "${DOCKER_RPM_DIR}" -maxdepth 1 -name '*.rpm' | grep -q .; then
    echo "Docker RPM directory is empty: ${DOCKER_RPM_DIR}" >&2
    exit 1
  fi
  echo "Using local Docker RPM bundle from ${DOCKER_RPM_DIR}"
  copy_rpms "${DOCKER_RPM_DIR}" "${DOCKER_RPMS_ROOT}"
elif [[ "${FETCH_DOCKER_RPMS}" -eq 1 ]]; then
  echo "Fetching Docker RPM bundle for offline install..."
  bash "${ROOT}/scripts/fetch_docker_rpms.sh" --refresh --output-dir "${DOCKER_RPM_CACHE_DIR}"
  copy_rpms "${DOCKER_RPM_CACHE_DIR}" "${DOCKER_RPMS_ROOT}"
else
  echo "Building app-only package without bundled Docker RPMs."
fi

if [[ "${BUILD_APP_IMAGES}" -eq 0 ]]; then
  if needs_app_rebuild "${BACKEND_SOURCE_IMAGE}" || needs_app_rebuild "${FRONTEND_SOURCE_IMAGE}"; then
    echo "Local application images are missing or not ${TARGET_DOCKER_PLATFORM}; rebuilding from source."
    BUILD_APP_IMAGES=1
  fi
fi

if [[ "${BUILD_APP_IMAGES}" -eq 1 ]]; then
  echo "Building application images from source for ${TARGET_DOCKER_PLATFORM}..."
  BACKEND_IMAGE="${BACKEND_RELEASE_IMAGE}" \
  FRONTEND_IMAGE="${FRONTEND_RELEASE_IMAGE}" \
  VITE_API_BASE_URL="${VITE_API_BASE_URL}" \
  TARGET_DOCKER_PLATFORM="${TARGET_DOCKER_PLATFORM}" \
  "${APP_ROOT}/ops/scripts/build-images.sh"
else
  echo "Reusing local application images for ${TARGET_DOCKER_PLATFORM}..."
  if ! docker_image_exists "${BACKEND_SOURCE_IMAGE}"; then
    echo "Backend source image not found: ${BACKEND_SOURCE_IMAGE}" >&2
    exit 1
  fi
  if ! docker_image_exists "${FRONTEND_SOURCE_IMAGE}"; then
    echo "Frontend source image not found: ${FRONTEND_SOURCE_IMAGE}" >&2
    exit 1
  fi
  docker tag "${BACKEND_SOURCE_IMAGE}" "${BACKEND_RELEASE_IMAGE}"
  docker tag "${FRONTEND_SOURCE_IMAGE}" "${FRONTEND_RELEASE_IMAGE}"
fi

assert_image_arch "${BACKEND_RELEASE_IMAGE}"
assert_image_arch "${FRONTEND_RELEASE_IMAGE}"

ensure_platform_image "${DB_IMAGE}"
ensure_platform_image "${REDIS_IMAGE}"
ensure_platform_image "${MINIO_IMAGE}"

if [[ "${SKU}" == "full" ]]; then
  ensure_platform_image "${LOKI_IMAGE}"
  if [[ -z "${GRAFANA_IMAGE}" ]]; then
    echo "Full SKU requires GRAFANA_IMAGE to point at a prebuilt offline Grafana image." >&2
    exit 1
  fi
  if ! docker_image_exists "${GRAFANA_IMAGE}" || [[ "$(docker_image_arch "${GRAFANA_IMAGE}")" != "${TARGET_DOCKER_ARCH}" ]]; then
    echo "Grafana image not found locally for ${TARGET_DOCKER_PLATFORM}: ${GRAFANA_IMAGE}" >&2
    exit 1
  fi
fi

export_image "${BACKEND_RELEASE_IMAGE}" "${IMAGES_ROOT}/backend.tar.gz"
export_image "${FRONTEND_RELEASE_IMAGE}" "${IMAGES_ROOT}/frontend.tar.gz"
export_image "${DB_IMAGE}" "${IMAGES_ROOT}/db.tar.gz"
export_image "${REDIS_IMAGE}" "${IMAGES_ROOT}/redis.tar.gz"
export_image "${MINIO_IMAGE}" "${IMAGES_ROOT}/minio.tar.gz"

if [[ "${SKU}" == "full" ]]; then
  export_image "${LOKI_IMAGE}" "${IMAGES_ROOT}/loki.tar.gz"
  export_image "${GRAFANA_IMAGE}" "${IMAGES_ROOT}/grafana.tar.gz"
fi

mkdir -p "${RELEASE_ROOT}/compose" "${RELEASE_ROOT}/bin" "${RELEASE_ROOT}/ops" "${RELEASE_ROOT}/ops/nginx" "${RELEASE_ROOT}/ops/nginx/conf.d" "${RELEASE_ROOT}/ops/postgres" "${RELEASE_ROOT}/systemd" "${RELEASE_ROOT}/etc/conf.d" "${RELEASE_ROOT}/etc/certs" "${RELEASE_ROOT}/etc/licenses" "${RELEASE_ROOT}/etc/secrets" "${RELEASE_ROOT}/docs"

cp "${APP_ROOT}/ops/nginx/nginx.conf" "${RELEASE_ROOT}/ops/nginx/nginx.conf"
cp -R "${APP_ROOT}/ops/nginx/conf.d/." "${RELEASE_ROOT}/ops/nginx/conf.d/"
cp -R "${APP_ROOT}/ops/postgres/." "${RELEASE_ROOT}/ops/postgres/"
cp "${DOCS_ROOT}/"*.md "${RELEASE_ROOT}/docs/" 2>/dev/null || true
cp "${DOCS_ROOT}/"*.md "${DOCS_PAYLOAD_ROOT}/" 2>/dev/null || true
find "${RELEASE_ROOT}" -name '.DS_Store' -delete

write_text "${RELEASE_ROOT}/release.env" <<EOF
PRODUCT_NAME=${PRODUCT_NAME}
PRODUCT_ID=${PRODUCT_ID}
PACKAGE_VERSION=${PACKAGE_VERSION}
PACKAGE_SEMVER=${SEMVER}
PACKAGE_BUILD_ID=${BUILD_ID}
PACKAGE_STEM=${PACKAGE_STEM}
PACKAGE_SKU=${SKU}
SERVICE_NAME=${SERVICE_NAME}
BACKEND_IMAGE=${BACKEND_RELEASE_IMAGE}
FRONTEND_IMAGE=${FRONTEND_RELEASE_IMAGE}
DB_IMAGE=${DB_IMAGE}
REDIS_IMAGE=${REDIS_IMAGE}
MINIO_IMAGE=${MINIO_IMAGE}
EOF

write_template "${RELEASE_ROOT}/compose/docker-compose.core.yml" 0644 <<'EOF'
services:
  db:
    image: @DB_IMAGE@
    restart: unless-stopped
    environment:
      POSTGRES_USER: ${POSTGRES_USER:-user}
      POSTGRES_DB: ${POSTGRES_DB:-portal_db}
    entrypoint:
      - /bin/sh
      - -ceu
      - |
        export POSTGRES_PASSWORD="$$(cat /run/secrets/postgres_password)"
        mkdir -p /tmp/postgres-certs
        cp /run/certs/hyx_ngep.cer /tmp/postgres-certs/server.crt
        cp /run/certs/hyx_ngep.key /tmp/postgres-certs/server.key
        chown postgres:postgres /tmp/postgres-certs/server.crt /tmp/postgres-certs/server.key
        chmod 600 /tmp/postgres-certs/server.key
        exec docker-entrypoint.sh postgres \
          -c ssl=on \
          -c ssl_cert_file=/tmp/postgres-certs/server.crt \
          -c ssl_key_file=/tmp/postgres-certs/server.key \
          -c hba_file=/etc/postgresql/pg_hba.conf \
          -c password_encryption=scram-sha-256
    volumes:
      - ${HYX_PORTAL_DATA_DIR}/postgres:/var/lib/postgresql/data
      - ${HYX_PORTAL_CONFIG_DIR}/certs:/run/certs:ro
      - ${HYX_PORTAL_CURRENT_DIR}/ops/postgres/pg_hba.conf:/etc/postgresql/pg_hba.conf:ro
    secrets:
      - postgres_password

  redis:
    image: @REDIS_IMAGE@
    restart: unless-stopped
    entrypoint:
      - /bin/sh
      - -ceu
      - |
        REDIS_PASSWORD="$$(cat /run/secrets/redis_password)"
        mkdir -p /tmp/redis-certs
        cp /run/certs/hyx_ngep.cer /tmp/redis-certs/hyx_ngep.cer
        cp /run/certs/hyx_ngep.key /tmp/redis-certs/hyx_ngep.key
        chown redis:redis /tmp/redis-certs/hyx_ngep.cer /tmp/redis-certs/hyx_ngep.key
        chmod 600 /tmp/redis-certs/hyx_ngep.key
        exec docker-entrypoint.sh redis-server \
          --port 0 \
          --tls-port 6379 \
          --tls-cert-file /tmp/redis-certs/hyx_ngep.cer \
          --tls-key-file /tmp/redis-certs/hyx_ngep.key \
          --tls-ca-cert-file /tmp/redis-certs/hyx_ngep.cer \
          --tls-auth-clients no \
          --requirepass "$$REDIS_PASSWORD"
    volumes:
      - ${HYX_PORTAL_DATA_DIR}/redis:/data
      - ${HYX_PORTAL_CONFIG_DIR}/certs:/run/certs:ro
    healthcheck:
      test:
        [
          "CMD-SHELL",
          "REDIS_PASSWORD=\"$$(cat /run/secrets/redis_password)\" && redis-cli --tls --cacert /run/certs/hyx_ngep.cer -h 127.0.0.1 -p 6379 -a \"$$REDIS_PASSWORD\" ping | grep -q PONG",
        ]
      interval: 30s
      timeout: 10s
      retries: 5
    secrets:
      - redis_password

  minio:
    image: @MINIO_IMAGE@
    container_name: enterpriseportal-minio
    restart: unless-stopped
    entrypoint:
      - /bin/sh
      - -ceu
      - |
        export MINIO_ROOT_USER="$$(cat /run/secrets/minio_root_user)"
        export MINIO_ROOT_PASSWORD="$$(cat /run/secrets/minio_root_password)"
        exec minio server /data --console-address ":9001"
    volumes:
      - ${HYX_PORTAL_DATA_DIR}/minio:/data
    healthcheck:
      test: [ "CMD", "curl", "-f", "http://localhost:9000/minio/health/live" ]
      interval: 30s
      timeout: 20s
      retries: 3
    secrets:
      - minio_root_user
      - minio_root_password

  backend:
    image: @BACKEND_IMAGE@
    restart: unless-stopped
    environment:
      DATABASE_URL_FILE: /run/secrets/backend_database_url
      REDIS_URL_FILE: /run/secrets/backend_redis_url
      PYTHONDONTWRITEBYTECODE: "1"
      DB_POOL_SIZE: "${DB_POOL_SIZE:-10}"
      DB_MAX_OVERFLOW: "${DB_MAX_OVERFLOW:-10}"
      DB_MAX_CONNECTION_BUDGET: "${DB_MAX_CONNECTION_BUDGET:-80}"
      SECRET_KEY_FILE: /run/secrets/jwt_secret
      MASTER_KEY_FILE: /run/secrets/master_key
      MASTER_KEY_PREVIOUS_FILE: /run/secrets/master_key_previous
      ACCESS_TOKEN_EXPIRE_MINUTES: "${ACCESS_TOKEN_EXPIRE_MINUTES:-5}"
      WEB_CONCURRENCY: "${WEB_CONCURRENCY:-4}"
      DB_AUTO_MIGRATE_ON_STARTUP: "true"
      CACHE_STRICT_MODE: "true"
      GUNICORN_TIMEOUT: "${GUNICORN_TIMEOUT:-120}"
      GEMINI_API_KEY: ""
      STORAGE_TYPE: minio
      PUBLIC_BASE_URL: "${PUBLIC_BASE_URL:-https://127.0.0.1}"
      CORS_ORIGINS: "${CORS_ORIGINS:-https://127.0.0.1}"
      COOKIE_DOMAIN: ""
      COOKIE_SECURE: "${COOKIE_SECURE:-True}"
      COOKIE_SAMESITE: "lax"
      MINIO_ENDPOINT_FILE: /run/secrets/minio_endpoint
      MINIO_ACCESS_KEY_FILE: /run/secrets/minio_access_key
      MINIO_SECRET_KEY_FILE: /run/secrets/minio_secret_key
      MINIO_BUCKET_NAME_FILE: /run/secrets/minio_bucket_name
      MINIO_SECURE_FILE: /run/secrets/minio_secure
      LOKI_PUSH_URL: ""
      LOKI_BASE_URL: ""
      LOKI_TENANT_ID: ""
      LICENSE_ED25519_PUBLIC_KEY: |
        -----BEGIN PUBLIC KEY-----
        MCowBQYDK2VwAyEADko/AM8cwzU86O44/rXDqn8ukJpxJGgPEKJskfw7Iwk=
        -----END PUBLIC KEY-----
      LICENSE_ED25519_PUBLIC_KEY_FINGERPRINT: "57e66ed76ba225868318c89943a34f92edfb7d542303fa1b0d66c9dc6b644046"
      BIND_PASSWORD_ENC_KEYS_FILE: /run/secrets/bind_password_enc_keys
      BIND_PASSWORD_ENC_ACTIVE_KID_FILE: /run/secrets/bind_password_enc_active_kid
      PLATFORM_AUTO_RELOAD: "false"
      INITIAL_ADMIN_PASSWORD_FILE: /run/secrets/initial_admin_password
      INITIAL_ADMIN_NAME: "${INITIAL_ADMIN_NAME:-Administrator}"
      INITIAL_ADMIN_EMAIL: "${INITIAL_ADMIN_EMAIL:-admin@local.invalid}"
    depends_on:
      - db
      - redis
      - minio
    volumes:
      - ${HYX_PORTAL_DATA_DIR}/backend/uploads:/app/uploads
      - ${HYX_PORTAL_CURRENT_DIR}/ops/nginx:/app/ops/nginx:ro
      - ${HYX_PORTAL_CONFIG_DIR}/certs:/run/certs:ro
    secrets:
      - backend_database_url
      - backend_redis_url
      - jwt_secret
      - master_key
      - master_key_previous
      - bind_password_enc_keys
      - bind_password_enc_active_kid
      - minio_access_key
      - minio_secret_key
      - minio_endpoint
      - minio_bucket_name
      - minio_secure
      - initial_admin_password

  frontend:
    image: @FRONTEND_IMAGE@
    restart: unless-stopped
    ports:
      - "80:80"
      - "443:443"
    environment:
      VITE_API_BASE_URL: "${VITE_API_BASE_URL:-/api/v1}"
      PLATFORM_RELOAD_WATCH_INTERVAL_SECONDS: "0"
    depends_on:
      - backend
    volumes:
      - ${HYX_PORTAL_CURRENT_DIR}/ops/nginx/nginx.conf:/etc/nginx/nginx.conf:ro
      - ${HYX_PORTAL_CURRENT_DIR}/ops/nginx/conf.d:/etc/nginx/conf.d:ro
      - ${HYX_PORTAL_CONFIG_DIR}/certs:/etc/nginx/certs:ro

secrets:
  postgres_password:
    file: ${PORTAL_RUNTIME_SECRETS_DIR}/postgres_password
  redis_password:
    file: ${PORTAL_RUNTIME_SECRETS_DIR}/redis_password
  jwt_secret:
    file: ${PORTAL_RUNTIME_SECRETS_DIR}/jwt_secret
  master_key:
    file: ${PORTAL_RUNTIME_SECRETS_DIR}/master_key
  master_key_previous:
    file: ${PORTAL_RUNTIME_SECRETS_DIR}/master_key_previous
  bind_password_enc_keys:
    file: ${PORTAL_RUNTIME_SECRETS_DIR}/bind_password_enc_keys
  bind_password_enc_active_kid:
    file: ${PORTAL_RUNTIME_SECRETS_DIR}/bind_password_enc_active_kid
  minio_root_user:
    file: ${PORTAL_RUNTIME_SECRETS_DIR}/minio_root_user
  minio_root_password:
    file: ${PORTAL_RUNTIME_SECRETS_DIR}/minio_root_password
  minio_access_key:
    file: ${PORTAL_RUNTIME_SECRETS_DIR}/minio_access_key
  minio_secret_key:
    file: ${PORTAL_RUNTIME_SECRETS_DIR}/minio_secret_key
  minio_endpoint:
    file: ${PORTAL_RUNTIME_SECRETS_DIR}/minio_endpoint
  minio_bucket_name:
    file: ${PORTAL_RUNTIME_SECRETS_DIR}/minio_bucket_name
  minio_secure:
    file: ${PORTAL_RUNTIME_SECRETS_DIR}/minio_secure
  backend_database_url:
    file: ${PORTAL_RUNTIME_SECRETS_DIR}/backend_database_url
  backend_redis_url:
    file: ${PORTAL_RUNTIME_SECRETS_DIR}/backend_redis_url
  initial_admin_password:
    file: ${PORTAL_RUNTIME_SECRETS_DIR}/initial_admin_password
EOF

write_template "${RELEASE_ROOT}/systemd/${SERVICE_NAME}.service" 0644 <<'EOF'
[Unit]
Description=HYX Next-Gen Enterprise Portal
After=docker.service network-online.target
Requires=docker.service
Wants=network-online.target

[Service]
Type=oneshot
RemainAfterExit=yes
WorkingDirectory=/opt/HYX/@PRODUCT_DIR_NAME@/current
ExecStart=/opt/HYX/@PRODUCT_DIR_NAME@/current/bin/start
ExecStop=/opt/HYX/@PRODUCT_DIR_NAME@/current/bin/stop
TimeoutStartSec=900
TimeoutStopSec=300

[Install]
WantedBy=multi-user.target
EOF

write_text "${RELEASE_ROOT}/etc/portal.env.example" <<'EOF'
POSTGRES_USER=user
POSTGRES_DB=portal_db
MINIO_BUCKET_NAME=next-gen-enterprise-portal
PUBLIC_BASE_URL=https://127.0.0.1
CORS_ORIGINS=https://127.0.0.1
INITIAL_ADMIN_NAME=Administrator
INITIAL_ADMIN_EMAIL=admin@local.invalid
WEB_CONCURRENCY=4
DB_POOL_SIZE=10
DB_MAX_OVERFLOW=10
DB_MAX_CONNECTION_BUDGET=80
ACCESS_TOKEN_EXPIRE_MINUTES=5
GUNICORN_TIMEOUT=120
COOKIE_SECURE=True
VITE_API_BASE_URL=/api/v1
EOF

write_template "${RELEASE_ROOT}/ops/preflight-check" 0755 <<'EOF'
#!/usr/bin/env bash
set -euo pipefail

RELEASE_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd -P)"
PAYLOAD_ROOT="$(cd "${RELEASE_DIR}/.." && pwd -P)"
DOCKER_RPM_DIR="${PAYLOAD_ROOT}/docker-rpms"

require_root() {
  if [[ "$(id -u)" -ne 0 ]]; then
    echo "This installer must run as root." >&2
    exit 1
  fi
}

require_cmd() {
  if ! command -v "$1" >/dev/null 2>&1; then
    echo "Missing required command: $1" >&2
    exit 1
  fi
}

check_os() {
  if [[ "$(uname -s)" != "Linux" ]]; then
    echo "Unsupported OS: $(uname -s). Linux is required." >&2
    exit 1
  fi
  if [[ "$(uname -m)" != "x86_64" ]]; then
    echo "Unsupported architecture: $(uname -m). x86_64 is required." >&2
    exit 1
  fi
  if [[ ! -r /etc/os-release ]]; then
    echo "/etc/os-release not found." >&2
    exit 1
  fi
  # shellcheck disable=SC1091
  source /etc/os-release
  if [[ "${ID:-}" != "rocky" ]]; then
    echo "Unsupported Linux distribution: ${ID:-unknown}. Rocky Linux is required." >&2
    exit 1
  fi
  if [[ "${VERSION_ID:-}" != 9* ]]; then
    echo "Unsupported Rocky Linux version: ${VERSION_ID:-unknown}. Rocky Linux 9.x is required." >&2
    exit 1
  fi
}

check_resources() {
  local mem_kb
  local avail_kb
  mem_kb="$(awk '/MemTotal:/ {print $2}' /proc/meminfo)"
  avail_kb="$(df -Pk /var | awk 'NR==2 {print $4}')"
  if [[ "${mem_kb:-0}" -lt 4194304 ]]; then
    echo "At least 4 GiB of RAM is required." >&2
    exit 1
  fi
  if [[ "${avail_kb:-0}" -lt 10485760 ]]; then
    echo "At least 10 GiB of free disk space under /var is required." >&2
    exit 1
  fi
}

check_docker_or_bundle() {
  if command -v docker >/dev/null 2>&1 && docker info >/dev/null 2>&1 && docker compose version >/dev/null 2>&1; then
    return
  fi
  require_cmd dnf
  if [[ ! -d "${DOCKER_RPM_DIR}" ]]; then
    echo "Docker is not installed and no bundled Docker RPM directory was found." >&2
    exit 1
  fi
  if ! find "${DOCKER_RPM_DIR}" -maxdepth 1 -name '*.rpm' | grep -q .; then
    echo "Docker is not installed and the bundled Docker RPM directory is empty." >&2
    exit 1
  fi
}

check_ports() {
  if systemctl is-active --quiet @SERVICE_NAME@; then
    return
  fi
  if command -v ss >/dev/null 2>&1; then
    if ss -ltn '( sport = :443 )' | grep -q ':443'; then
      echo "Port 443 is already in use." >&2
      exit 1
    fi
  fi
}

require_root
require_cmd tar
require_cmd gzip
require_cmd systemctl
require_cmd openssl
check_os
check_resources
check_docker_or_bundle
check_ports
echo "Preflight check passed."
EOF

write_template "${RELEASE_ROOT}/ops/render-runtime-secrets" 0755 <<'EOF'
#!/usr/bin/env bash
set -euo pipefail

PRODUCT_DIR="/opt/HYX/@PRODUCT_DIR_NAME@"
CONFIG_DIR="/etc/HYX/@PRODUCT_DIR_NAME@"
RUNTIME_DIR="/run/HYX/@PRODUCT_DIR_NAME@"

if [[ -f "${CONFIG_DIR}/portal.env" ]]; then
  set -a
  # shellcheck disable=SC1090
  source "${CONFIG_DIR}/portal.env"
  set +a
fi

SOURCE_DIR="${CONFIG_DIR}/secrets/source"
TARGET_DIR="${RUNTIME_DIR}/runtime-secrets"
mkdir -p "${TARGET_DIR}"

read_secret() {
  local name="$1"
  if [[ -f "${SOURCE_DIR}/${name}" ]]; then
    cat "${SOURCE_DIR}/${name}"
  fi
}

write_secret() {
  local name="$1"
  local value="$2"
  printf '%s' "${value}" > "${TARGET_DIR}/${name}"
  chmod 600 "${TARGET_DIR}/${name}"
}

POSTGRES_USER="${POSTGRES_USER:-user}"
POSTGRES_DB="${POSTGRES_DB:-portal_db}"
MINIO_BUCKET_NAME="${MINIO_BUCKET_NAME:-next-gen-enterprise-portal}"

POSTGRES_PASSWORD="$(read_secret postgres_password)"
REDIS_PASSWORD="$(read_secret redis_password)"
JWT_SECRET="$(read_secret jwt_secret)"
MASTER_KEY="$(read_secret master_key)"
MASTER_KEY_PREVIOUS="$(read_secret master_key_previous)"
BIND_PASSWORD_ENC_KEYS="$(read_secret bind_password_enc_keys)"
BIND_PASSWORD_ENC_ACTIVE_KID="$(read_secret bind_password_enc_active_kid)"
MINIO_ROOT_USER="$(read_secret minio_root_user)"
MINIO_ROOT_PASSWORD="$(read_secret minio_root_password)"
INITIAL_ADMIN_PASSWORD="$(read_secret initial_admin_password)"

write_secret postgres_password "${POSTGRES_PASSWORD}"
write_secret redis_password "${REDIS_PASSWORD}"
write_secret jwt_secret "${JWT_SECRET}"
write_secret master_key "${MASTER_KEY}"
write_secret master_key_previous "${MASTER_KEY_PREVIOUS}"
write_secret bind_password_enc_keys "${BIND_PASSWORD_ENC_KEYS}"
write_secret bind_password_enc_active_kid "${BIND_PASSWORD_ENC_ACTIVE_KID}"
write_secret minio_root_user "${MINIO_ROOT_USER}"
write_secret minio_root_password "${MINIO_ROOT_PASSWORD}"
write_secret minio_access_key "${MINIO_ROOT_USER}"
write_secret minio_secret_key "${MINIO_ROOT_PASSWORD}"
write_secret minio_endpoint "minio:9000"
write_secret minio_bucket_name "${MINIO_BUCKET_NAME}"
write_secret minio_secure "False"
write_secret initial_admin_password "${INITIAL_ADMIN_PASSWORD}"
write_secret backend_database_url "postgresql+asyncpg://${POSTGRES_USER}:${POSTGRES_PASSWORD}@db:5432/${POSTGRES_DB}?sslmode=verify-ca&sslrootcert=/run/certs/hyx_ngep.cer"
write_secret backend_redis_url "rediss://:${REDIS_PASSWORD}@redis:6379/0?ssl_cert_reqs=required&ssl_ca_certs=/run/certs/hyx_ngep.cer&ssl_check_hostname=false"
EOF

write_template "${RELEASE_ROOT}/ops/post-install-check" 0755 <<'EOF'
#!/usr/bin/env bash
set -euo pipefail
"/opt/HYX/@PRODUCT_DIR_NAME@/current/bin/healthcheck"
EOF

write_template "${RELEASE_ROOT}/bin/start" 0755 <<'EOF'
#!/usr/bin/env bash
set -euo pipefail

PRODUCT_DIR="/opt/HYX/@PRODUCT_DIR_NAME@"
CONFIG_DIR="/etc/HYX/@PRODUCT_DIR_NAME@"
DATA_DIR="/var/lib/HYX/@PRODUCT_DIR_NAME@"
LOG_DIR="/var/log/HYX/@PRODUCT_DIR_NAME@"
RUNTIME_DIR="/run/HYX/@PRODUCT_DIR_NAME@"
RELEASE_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd -P)"
COMPOSE_FILE="${RELEASE_DIR}/compose/docker-compose.@PACKAGE_SKU@.yml"

mkdir -p "${DATA_DIR}" "${LOG_DIR}" "${RUNTIME_DIR}" "${RUNTIME_DIR}/runtime-secrets"

if [[ -f "${CONFIG_DIR}/portal.env" ]]; then
  set -a
  # shellcheck disable=SC1090
  source "${CONFIG_DIR}/portal.env"
  set +a
fi

export HYX_PORTAL_CURRENT_DIR="${RELEASE_DIR}"
export HYX_PORTAL_CONFIG_DIR="${CONFIG_DIR}"
export HYX_PORTAL_DATA_DIR="${DATA_DIR}"
export HYX_PORTAL_LOG_DIR="${LOG_DIR}"
export HYX_PORTAL_RUNTIME_DIR="${RUNTIME_DIR}"
export PORTAL_RUNTIME_SECRETS_DIR="${RUNTIME_DIR}/runtime-secrets"
export COMPOSE_PROJECT_NAME="${COMPOSE_PROJECT_NAME:-hyx-ngep}"

"${RELEASE_DIR}/ops/render-runtime-secrets"
docker compose -p "${COMPOSE_PROJECT_NAME}" -f "${COMPOSE_FILE}" up -d --remove-orphans
EOF

write_template "${RELEASE_ROOT}/bin/stop" 0755 <<'EOF'
#!/usr/bin/env bash
set -euo pipefail

PRODUCT_DIR="/opt/HYX/@PRODUCT_DIR_NAME@"
CONFIG_DIR="/etc/HYX/@PRODUCT_DIR_NAME@"
DATA_DIR="/var/lib/HYX/@PRODUCT_DIR_NAME@"
RUNTIME_DIR="/run/HYX/@PRODUCT_DIR_NAME@"
RELEASE_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd -P)"
COMPOSE_FILE="${RELEASE_DIR}/compose/docker-compose.@PACKAGE_SKU@.yml"

if [[ -f "${CONFIG_DIR}/portal.env" ]]; then
  set -a
  # shellcheck disable=SC1090
  source "${CONFIG_DIR}/portal.env"
  set +a
fi

export HYX_PORTAL_CURRENT_DIR="${RELEASE_DIR}"
export HYX_PORTAL_CONFIG_DIR="${CONFIG_DIR}"
export HYX_PORTAL_DATA_DIR="${DATA_DIR}"
export HYX_PORTAL_RUNTIME_DIR="${RUNTIME_DIR}"
export PORTAL_RUNTIME_SECRETS_DIR="${RUNTIME_DIR}/runtime-secrets"
export COMPOSE_PROJECT_NAME="${COMPOSE_PROJECT_NAME:-hyx-ngep}"

docker compose -p "${COMPOSE_PROJECT_NAME}" -f "${COMPOSE_FILE}" down
EOF

write_template "${RELEASE_ROOT}/bin/restart" 0755 <<'EOF'
#!/usr/bin/env bash
set -euo pipefail
"/opt/HYX/@PRODUCT_DIR_NAME@/current/bin/stop"
"/opt/HYX/@PRODUCT_DIR_NAME@/current/bin/start"
EOF

write_template "${RELEASE_ROOT}/bin/status" 0755 <<'EOF'
#!/usr/bin/env bash
set -euo pipefail

PRODUCT_DIR="/opt/HYX/@PRODUCT_DIR_NAME@"
CONFIG_DIR="/etc/HYX/@PRODUCT_DIR_NAME@"
DATA_DIR="/var/lib/HYX/@PRODUCT_DIR_NAME@"
RUNTIME_DIR="/run/HYX/@PRODUCT_DIR_NAME@"
RELEASE_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd -P)"
COMPOSE_FILE="${RELEASE_DIR}/compose/docker-compose.@PACKAGE_SKU@.yml"

if [[ -f "${CONFIG_DIR}/portal.env" ]]; then
  set -a
  # shellcheck disable=SC1090
  source "${CONFIG_DIR}/portal.env"
  set +a
fi

export HYX_PORTAL_CURRENT_DIR="${RELEASE_DIR}"
export HYX_PORTAL_CONFIG_DIR="${CONFIG_DIR}"
export HYX_PORTAL_DATA_DIR="${DATA_DIR}"
export HYX_PORTAL_RUNTIME_DIR="${RUNTIME_DIR}"
export PORTAL_RUNTIME_SECRETS_DIR="${RUNTIME_DIR}/runtime-secrets"
export COMPOSE_PROJECT_NAME="${COMPOSE_PROJECT_NAME:-hyx-ngep}"

if command -v systemctl >/dev/null 2>&1; then
  systemctl status @SERVICE_NAME@ --no-pager || true
fi
docker compose -p "${COMPOSE_PROJECT_NAME}" -f "${COMPOSE_FILE}" ps
EOF

write_template "${RELEASE_ROOT}/bin/healthcheck" 0755 <<'EOF'
#!/usr/bin/env bash
set -euo pipefail

PRODUCT_DIR="/opt/HYX/@PRODUCT_DIR_NAME@"
CONFIG_DIR="/etc/HYX/@PRODUCT_DIR_NAME@"
DATA_DIR="/var/lib/HYX/@PRODUCT_DIR_NAME@"
RUNTIME_DIR="/run/HYX/@PRODUCT_DIR_NAME@"
RELEASE_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd -P)"
COMPOSE_FILE="${RELEASE_DIR}/compose/docker-compose.@PACKAGE_SKU@.yml"

if [[ -f "${CONFIG_DIR}/portal.env" ]]; then
  set -a
  # shellcheck disable=SC1090
  source "${CONFIG_DIR}/portal.env"
  set +a
fi

export HYX_PORTAL_CURRENT_DIR="${RELEASE_DIR}"
export HYX_PORTAL_CONFIG_DIR="${CONFIG_DIR}"
export HYX_PORTAL_DATA_DIR="${DATA_DIR}"
export HYX_PORTAL_RUNTIME_DIR="${RUNTIME_DIR}"
export PORTAL_RUNTIME_SECRETS_DIR="${RUNTIME_DIR}/runtime-secrets"
export COMPOSE_PROJECT_NAME="${COMPOSE_PROJECT_NAME:-hyx-ngep}"

docker compose -p "${COMPOSE_PROJECT_NAME}" -f "${COMPOSE_FILE}" ps

if command -v curl >/dev/null 2>&1; then
  BASE_URL="${PUBLIC_BASE_URL:-https://127.0.0.1}"
  BASE_URL="${BASE_URL%/}"
  FRONTEND_HEALTH_URL="${BASE_URL}/"
  API_HEALTH_URL="${BASE_URL}/api/v1/public/config"
  REQUIRED_SERVICES=(db redis minio backend frontend)
  for attempt in $(seq 1 30); do
    running_services="$(docker compose -p "${COMPOSE_PROJECT_NAME}" -f "${COMPOSE_FILE}" ps --status running --services || true)"
    missing_services=()
    for service in "${REQUIRED_SERVICES[@]}"; do
      if ! printf '%s\n' "${running_services}" | grep -qx "${service}"; then
        missing_services+=("${service}")
      fi
    done
    if [[ "${#missing_services[@]}" -eq 0 ]] && \
       curl -ksSf "${FRONTEND_HEALTH_URL}" >/dev/null && \
       curl -ksSf "${API_HEALTH_URL}" >/dev/null; then
      echo "Health check passed."
      exit 0
    fi
    sleep 5
  done
  echo "Health check failed after waiting for ${FRONTEND_HEALTH_URL} and ${API_HEALTH_URL}" >&2
  docker compose -p "${COMPOSE_PROJECT_NAME}" -f "${COMPOSE_FILE}" ps >&2 || true
  exit 1
fi
echo "Health check passed."
EOF

write_template "${RELEASE_ROOT}/bin/rollback" 0755 <<'EOF'
#!/usr/bin/env bash
set -euo pipefail

PRODUCT_DIR="/opt/HYX/@PRODUCT_DIR_NAME@"
CURRENT_LINK="${PRODUCT_DIR}/current"
PREVIOUS_LINK="${PRODUCT_DIR}/previous"

if [[ ! -L "${PREVIOUS_LINK}" ]]; then
  echo "No previous release link found. Rollback is not available." >&2
  exit 1
fi

CURRENT_TARGET="$(readlink "${CURRENT_LINK}")"
PREVIOUS_TARGET="$(readlink "${PREVIOUS_LINK}")"

ln -sfn "${PREVIOUS_TARGET}" "${CURRENT_LINK}"
ln -sfn "${CURRENT_TARGET}" "${PREVIOUS_LINK}"

systemctl restart @SERVICE_NAME@
echo "Rollback complete: ${PREVIOUS_TARGET}"
EOF

write_template "${RELEASE_ROOT}/bin/upgrade" 0755 <<'EOF'
#!/usr/bin/env bash
set -euo pipefail

if [[ $# -lt 1 ]]; then
  echo "Usage: $0 /path/to/new-offline-package.bin [install args...]" >&2
  exit 1
fi

PACKAGE_PATH="$1"
shift

if [[ ! -x "${PACKAGE_PATH}" ]]; then
  echo "Package is not executable: ${PACKAGE_PATH}" >&2
  exit 1
fi

exec "${PACKAGE_PATH}" "$@"
EOF

write_template "${RELEASE_ROOT}/bin/install" 0755 <<'EOF'
#!/usr/bin/env bash
set -euo pipefail

PRODUCT_DIR="/opt/HYX/@PRODUCT_DIR_NAME@"
CONFIG_DIR="/etc/HYX/@PRODUCT_DIR_NAME@"
DATA_DIR="/var/lib/HYX/@PRODUCT_DIR_NAME@"
LOG_DIR="/var/log/HYX/@PRODUCT_DIR_NAME@"
RUNTIME_DIR="/run/HYX/@PRODUCT_DIR_NAME@"
SERVICE_NAME="@SERVICE_NAME@"

RELEASE_SRC="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd -P)"
PAYLOAD_ROOT="$(cd "${RELEASE_SRC}/.." && pwd -P)"
IMAGES_DIR="${PAYLOAD_ROOT}/images"
DOCKER_RPM_DIR="${PAYLOAD_ROOT}/docker-rpms"
LOG_FILE="${LOG_DIR}/install.log"
NO_START=0

while [[ $# -gt 0 ]]; do
  case "$1" in
    --no-start)
      NO_START=1
      shift
      ;;
    -h|--help)
      echo "Usage: $0 [--no-start]"
      exit 0
      ;;
    *)
      echo "Unsupported install argument: $1" >&2
      exit 1
      ;;
  esac
done

mkdir -p "${LOG_DIR}"
exec > >(tee -a "${LOG_FILE}") 2>&1

"${RELEASE_SRC}/ops/preflight-check"

mkdir -p "${PRODUCT_DIR}/releases" "${CONFIG_DIR}/conf.d" "${CONFIG_DIR}/certs" "${CONFIG_DIR}/licenses" "${CONFIG_DIR}/secrets/source" "${DATA_DIR}/backend/uploads" "${DATA_DIR}/postgres" "${DATA_DIR}/redis" "${DATA_DIR}/minio" "${DATA_DIR}/backups" "${RUNTIME_DIR}"

if [[ ! -f "${CONFIG_DIR}/portal.env" ]]; then
  cp "${RELEASE_SRC}/etc/portal.env.example" "${CONFIG_DIR}/portal.env"
  chmod 640 "${CONFIG_DIR}/portal.env"
fi

replace_env_value() {
  local key="$1"
  local value="$2"
  python3 - "$CONFIG_DIR/portal.env" "$key" "$value" <<'PY'
from pathlib import Path
import sys

path = Path(sys.argv[1])
key = sys.argv[2]
value = sys.argv[3]
lines = path.read_text(encoding="utf-8").splitlines()
prefix = f"{key}="
replaced = False
for idx, line in enumerate(lines):
    if line.startswith(prefix):
        lines[idx] = f"{prefix}{value}"
        replaced = True
        break
if not replaced:
    lines.append(f"{prefix}{value}")
path.write_text("\n".join(lines) + "\n", encoding="utf-8")
PY
}

if [[ -n "${PUBLIC_BASE_URL:-}" ]]; then
  replace_env_value "PUBLIC_BASE_URL" "${PUBLIC_BASE_URL}"
fi

if [[ -n "${CORS_ORIGINS:-}" ]]; then
  replace_env_value "CORS_ORIGINS" "${CORS_ORIGINS}"
fi

set -a
# shellcheck disable=SC1090
source "${CONFIG_DIR}/portal.env"
set +a

extract_public_host() {
  python3 - "${1:-}" <<'PY'
from urllib.parse import urlparse
import sys

candidate = (sys.argv[1] or "").strip()
if not candidate:
    print("")
    raise SystemExit(0)

if "://" not in candidate:
    candidate = "https://" + candidate

parsed = urlparse(candidate)
print(parsed.hostname or "")
PY
}

PUBLIC_HOST="$(extract_public_host "${PUBLIC_BASE_URL:-}")"
if [[ -z "${PUBLIC_HOST}" ]]; then
  PUBLIC_HOST="127.0.0.1"
fi

random_token() {
  local bytes="${1:-32}"
  head -c "${bytes}" /dev/urandom | base64 | tr '+/' '-_' | tr -d '=\n'
}

ensure_secret() {
  local name="$1"
  local value="$2"
  local path="${CONFIG_DIR}/secrets/source/${name}"
  if [[ ! -f "${path}" ]]; then
    printf '%s' "${value}" > "${path}"
    chmod 600 "${path}"
  fi
}

ensure_docker_runtime() {
  if command -v docker >/dev/null 2>&1 && docker info >/dev/null 2>&1 && docker compose version >/dev/null 2>&1; then
    return
  fi
  if [[ ! -d "${DOCKER_RPM_DIR}" ]]; then
    echo "Docker is missing and no bundled RPM directory exists: ${DOCKER_RPM_DIR}" >&2
    exit 1
  fi
  if ! find "${DOCKER_RPM_DIR}" -maxdepth 1 -name '*.rpm' | grep -q .; then
    echo "Docker is missing and the bundled RPM directory is empty: ${DOCKER_RPM_DIR}" >&2
    exit 1
  fi
  echo "Installing bundled Docker RPMs..."
  dnf -y install --disablerepo='*' --nogpgcheck "${DOCKER_RPM_DIR}"/*.rpm
  systemctl enable --now docker
  if ! docker info >/dev/null 2>&1; then
    echo "Docker failed to start after offline RPM installation." >&2
    exit 1
  fi
  if ! docker compose version >/dev/null 2>&1; then
    echo "Docker Compose plugin is unavailable after offline RPM installation." >&2
    exit 1
  fi
}

if [[ ! -f "${CONFIG_DIR}/certs/hyx_ngep.cer" || ! -f "${CONFIG_DIR}/certs/hyx_ngep.key" ]]; then
  CERT_SAN="IP:127.0.0.1,DNS:localhost"
  if [[ "${PUBLIC_HOST}" != "127.0.0.1" && "${PUBLIC_HOST}" != "localhost" ]]; then
    if [[ "${PUBLIC_HOST}" =~ ^[0-9]+\.[0-9]+\.[0-9]+\.[0-9]+$ ]]; then
      CERT_SAN="${CERT_SAN},IP:${PUBLIC_HOST}"
    else
      CERT_SAN="${CERT_SAN},DNS:${PUBLIC_HOST}"
    fi
  fi
  openssl req -x509 -nodes -newkey rsa:2048 \
    -keyout "${CONFIG_DIR}/certs/hyx_ngep.key" \
    -out "${CONFIG_DIR}/certs/hyx_ngep.cer" \
    -days 3650 \
    -subj "/CN=${PUBLIC_HOST}" \
    -addext "subjectAltName=${CERT_SAN}" >/dev/null 2>&1
  chmod 600 "${CONFIG_DIR}/certs/hyx_ngep.key"
  chmod 644 "${CONFIG_DIR}/certs/hyx_ngep.cer"
fi

BIND_KID="k$(date +%Y%m%d)"
ensure_secret postgres_password "$(random_token 24)"
ensure_secret redis_password "$(random_token 24)"
ensure_secret jwt_secret "$(random_token 48)"
ensure_secret master_key "$(random_token 32)"
ensure_secret master_key_previous ""
ensure_secret bind_password_enc_active_kid "${BIND_KID}"
if [[ ! -f "${CONFIG_DIR}/secrets/source/bind_password_enc_keys" ]]; then
  printf '{"%s":"%s"}' "${BIND_KID}" "$(random_token 32)" > "${CONFIG_DIR}/secrets/source/bind_password_enc_keys"
  chmod 600 "${CONFIG_DIR}/secrets/source/bind_password_enc_keys"
fi
ensure_secret minio_root_user "minioadmin"
ensure_secret minio_root_password "$(random_token 24)"
ensure_secret initial_admin_password "$(random_token 18)"
ensure_docker_runtime

RELEASE_TARGET="${PRODUCT_DIR}/releases/@PACKAGE_STEM@"
CURRENT_LINK="${PRODUCT_DIR}/current"
PREVIOUS_LINK="${PRODUCT_DIR}/previous"

if [[ -e "${RELEASE_TARGET}" ]]; then
  echo "Target release already exists: ${RELEASE_TARGET}" >&2
  exit 1
fi

cp -R "${RELEASE_SRC}" "${RELEASE_TARGET}"

if [[ "${PUBLIC_HOST}" == "127.0.0.1" || "${PUBLIC_HOST}" == "localhost" ]]; then
  printf '%s\n' 'server_name _;' > "${RELEASE_TARGET}/ops/nginx/conf.d/platform_server_name.conf"
else
  printf 'server_name %s;\n' "${PUBLIC_HOST}" > "${RELEASE_TARGET}/ops/nginx/conf.d/platform_server_name.conf"
fi

if [[ -L "${CURRENT_LINK}" ]]; then
  ln -sfn "$(readlink "${CURRENT_LINK}")" "${PREVIOUS_LINK}"
fi
ln -sfn "${RELEASE_TARGET}" "${CURRENT_LINK}"

for archive in "${IMAGES_DIR}"/*.tar.gz; do
  echo "Loading image archive: ${archive}"
  gunzip -c "${archive}" | docker load
done

install -m 0644 "${RELEASE_TARGET}/systemd/${SERVICE_NAME}.service" "/etc/systemd/system/${SERVICE_NAME}.service"
systemctl daemon-reload
systemctl enable "${SERVICE_NAME}" >/dev/null

if [[ "${NO_START}" -eq 0 ]]; then
  systemctl restart "${SERVICE_NAME}"
  "${CURRENT_LINK}/ops/post-install-check"
fi

echo
echo "Installation completed."
echo "Current release : ${RELEASE_TARGET}"
echo "Config dir      : ${CONFIG_DIR}"
echo "Data dir        : ${DATA_DIR}"
echo "Log file        : ${LOG_FILE}"
echo "Initial admin password file: ${CONFIG_DIR}/secrets/source/initial_admin_password"
EOF

cp "${MANIFEST_ROOT}/manifest.json" "${RELEASE_ROOT}/manifest.json" 2>/dev/null || true

python3 - "${IMAGES_ROOT}" "${DOCKER_RPMS_ROOT}" "${MANIFEST_ROOT}/manifest.json" "${PRODUCT_NAME}" "${PACKAGE_VERSION}" "${SEMVER}" "${BUILD_ID}" "${SKU}" "${DB_SCHEMA_VERSION}" "${SERVICE_NAME}" "${SUPPORTED_OS}" "${SUPPORTED_ARCH}" "${BACKEND_RELEASE_IMAGE}" "${FRONTEND_RELEASE_IMAGE}" "${DB_IMAGE}" "${REDIS_IMAGE}" "${MINIO_IMAGE}" "${LOKI_IMAGE}" "${GRAFANA_IMAGE}" <<'PY'
import json
import os
import sys
from pathlib import Path

images_dir = Path(sys.argv[1])
docker_rpms_dir = Path(sys.argv[2])
manifest_path = Path(sys.argv[3])

def sha256(path: Path) -> str:
    import hashlib
    h = hashlib.sha256()
    with path.open("rb") as f:
        for chunk in iter(lambda: f.read(1024 * 1024), b""):
            h.update(chunk)
    return h.hexdigest()

image_files = []
for path in sorted(images_dir.glob("*.tar.gz")):
    image_files.append(
        {
            "file": path.name,
            "sha256": sha256(path),
            "size_bytes": path.stat().st_size,
        }
    )

docker_rpm_files = []
for path in sorted(docker_rpms_dir.glob("*.rpm")):
    docker_rpm_files.append(
        {
            "file": path.name,
            "sha256": sha256(path),
            "size_bytes": path.stat().st_size,
        }
    )

manifest = {
    "product_name": sys.argv[4],
    "version": sys.argv[5],
    "semver": sys.argv[6],
    "build_id": sys.argv[7],
    "sku": sys.argv[8],
    "db_schema_version": sys.argv[9],
    "service_name": sys.argv[10],
    "supported_os": sys.argv[11],
    "supported_arch": sys.argv[12],
    "offline_mode": True,
    "bundled_docker_rpms": bool(docker_rpm_files),
    "services": {
        "backend": sys.argv[13],
        "frontend": sys.argv[14],
        "db": sys.argv[15],
        "redis": sys.argv[16],
        "minio": sys.argv[17],
    },
    "optional_services": {
        "loki": sys.argv[18],
        "grafana": sys.argv[19],
    },
    "ports": [80, 443],
    "data_dirs": [
        "/var/lib/HYX/Next-Gen-Enterprise-Portal/backend/uploads",
        "/var/lib/HYX/Next-Gen-Enterprise-Portal/postgres",
        "/var/lib/HYX/Next-Gen-Enterprise-Portal/redis",
        "/var/lib/HYX/Next-Gen-Enterprise-Portal/minio",
    ],
    "config_dirs": [
        "/etc/HYX/Next-Gen-Enterprise-Portal",
        "/run/HYX/Next-Gen-Enterprise-Portal",
    ],
    "images": image_files,
    "docker_rpms": docker_rpm_files,
}

manifest_path.write_text(json.dumps(manifest, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
PY

cp "${MANIFEST_ROOT}/manifest.json" "${RELEASE_ROOT}/manifest.json"

(
  cd "${PAYLOAD_ROOT}"
  if command -v sha256sum >/dev/null 2>&1; then
    find . -type f | sort | xargs sha256sum > "${MANIFEST_ROOT}/SHA256SUMS"
  else
    find . -type f | sort | while read -r file; do
      printf '%s  %s\n' "$(shasum -a 256 "$file" | awk '{print $1}')" "$file"
    done > "${MANIFEST_ROOT}/SHA256SUMS"
  fi
)

ARCHIVE_PATH="${STAGE_ROOT}/payload.tar.gz"
BIN_PATH="${BUILD_ROOT}/${PACKAGE_STEM}.bin"
BIN_SHA_PATH="${BIN_PATH}.sha256"

COPYFILE_DISABLE=1 COPY_EXTENDED_ATTRIBUTES_DISABLE=1 tar \
  --disable-copyfile \
  --no-xattrs \
  -C "${STAGE_ROOT}" \
  -czf "${ARCHIVE_PATH}" \
  payload

write_text "${STAGE_ROOT}/installer.stub" <<'EOF'
#!/usr/bin/env bash
set -euo pipefail

SELF="$0"
KEEP_EXTRACTED=0
EXTRACT_ONLY=0
EXTRACT_DIR=""
INSTALL_ARGS=()

usage() {
  cat <<'USAGE'
Usage:
  ./package.bin [--extract-only [dir]] [--keep-extracted] [install args...]

Options:
  --extract-only [dir]  Extract payload and stop without running install.
  --keep-extracted      Keep the temporary extraction directory after install.
  -h, --help            Show help.
USAGE
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --extract-only)
      EXTRACT_ONLY=1
      if [[ $# -gt 1 && "${2:-}" != --* ]]; then
        EXTRACT_DIR="$2"
        shift 2
      else
        shift
      fi
      ;;
    --keep-extracted)
      KEEP_EXTRACTED=1
      shift
      ;;
    -h|--help)
      usage
      exit 0
      ;;
    *)
      INSTALL_ARGS+=("$1")
      shift
      ;;
  esac
done

cleanup() {
  if [[ "${KEEP_EXTRACTED}" -ne 1 && -n "${WORKDIR:-}" && -d "${WORKDIR:-}" ]]; then
    rm -rf "${WORKDIR}"
  fi
}

ARCHIVE_LINE="$(awk '/^__ARCHIVE_BELOW__$/ {print NR + 1; exit 0; }' "${SELF}")"
if [[ -z "${ARCHIVE_LINE}" ]]; then
  echo "Archive marker not found." >&2
  exit 1
fi

if [[ -n "${EXTRACT_DIR}" ]]; then
  WORKDIR="${EXTRACT_DIR}"
  mkdir -p "${WORKDIR}"
else
  WORKDIR="$(mktemp -d "${TMPDIR:-/tmp}/ngep-offline.XXXXXX")"
fi

trap cleanup EXIT
tail -n +"${ARCHIVE_LINE}" "${SELF}" | tar -xzf - -C "${WORKDIR}"

if [[ "${EXTRACT_ONLY}" -eq 1 ]]; then
  echo "Payload extracted to: ${WORKDIR}"
  KEEP_EXTRACTED=1
  exit 0
fi

bash "${WORKDIR}/payload/release/bin/install" "${INSTALL_ARGS[@]}"
exit 0
__ARCHIVE_BELOW__
EOF

cat "${STAGE_ROOT}/installer.stub" "${ARCHIVE_PATH}" > "${BIN_PATH}"
chmod +x "${BIN_PATH}"

printf '%s  %s\n' "$(checksum_file "${BIN_PATH}")" "$(basename "${BIN_PATH}")" > "${BIN_SHA_PATH}"

write_text "${BUILD_ROOT}/README.md" <<'EOF'
# Build Outputs

- `*.bin`: self-extracting offline installer package
- `*.bin.sha256`: SHA-256 checksum for the final package
- `<package-stem>/`: staging directory containing payload, manifest, and exported images

Regenerate with:

```bash
bash scripts/build_offline_bin.sh
```
EOF

echo
echo "Offline package build complete."
echo "Package : ${BIN_PATH}"
echo "SHA256  : ${BIN_SHA_PATH}"
echo "Stage   : ${STAGE_ROOT}"
echo "Stage is retained under build/ for auditability."
