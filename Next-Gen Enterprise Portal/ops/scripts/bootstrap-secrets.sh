#!/bin/sh
set -eu

umask 077

SCRIPT_DIR=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
PROJECT_ROOT=$(CDPATH= cd -- "$SCRIPT_DIR/../.." && pwd)

PORTAL_SECRETS_FILE=${PORTAL_SECRETS_FILE:-/etc/portal/secrets.enc.yaml}
PORTAL_RUNTIME_SECRETS_DIR=${PORTAL_RUNTIME_SECRETS_DIR:-/run/secrets}

INIT_IF_MISSING=0
ROTATE=0

usage() {
  cat <<'EOF'
Usage: bootstrap-secrets.sh [--init-if-missing] [--rotate]

Options:
  --init-if-missing   Initialize /etc/portal/secrets.enc.yaml with random values if it does not exist.
  --rotate            Rotate managed secrets before rendering /run/secrets/*.

Environment:
  PORTAL_SECRETS_FILE         Encrypted secrets file path (default: /etc/portal/secrets.enc.yaml)
  PORTAL_RUNTIME_SECRETS_DIR  Runtime secrets output dir (default: /run/secrets)
  POSTGRES_USER               Required for backend_database_url rendering
  POSTGRES_DB                 Required for backend_database_url rendering
  MINIO_BUCKET_NAME           Required for MinIO bootstrap
  PORTAL_TPM2_CONTEXT_FILE    Optional TPM2 sealed object context for auto-unseal
  PORTAL_TPM2_AUTH            Optional TPM2 auth value for tpm2_unseal
EOF
}

while [ "$#" -gt 0 ]; do
  case "$1" in
    --init-if-missing)
      INIT_IF_MISSING=1
      ;;
    --rotate)
      ROTATE=1
      ;;
    -h|--help)
      usage
      exit 0
      ;;
    *)
      echo "bootstrap-secrets: unsupported argument: $1" >&2
      usage >&2
      exit 1
      ;;
  esac
  shift
done

require_env() {
  name=$1
  eval "value=\${$name:-}"
  if [ -z "$value" ]; then
    echo "bootstrap-secrets: $name is required." >&2
    exit 1
  fi
}

require_cmd() {
  if ! command -v "$1" >/dev/null 2>&1; then
    echo "bootstrap-secrets: required command not found: $1" >&2
    exit 1
  fi
}

require_env POSTGRES_USER
require_env POSTGRES_DB
require_env MINIO_BUCKET_NAME
require_cmd python3

mkdir -p "$PORTAL_RUNTIME_SECRETS_DIR"
chmod 700 "$PORTAL_RUNTIME_SECRETS_DIR"

export PORTAL_SECRETS_FILE
export PORTAL_RUNTIME_SECRETS_DIR

# Force master-key resolution early so keyctl/TPM2 failures fail before render or compose.
python3 "$SCRIPT_DIR/secretctl.py" master-key >/dev/null

if [ ! -f "$PORTAL_SECRETS_FILE" ]; then
  if [ "$INIT_IF_MISSING" -ne 1 ]; then
    echo "bootstrap-secrets: $PORTAL_SECRETS_FILE does not exist. Re-run with --init-if-missing to create it." >&2
    exit 1
  fi
  python3 "$SCRIPT_DIR/rotate_secrets.py" --skip-render
fi

if [ "$ROTATE" -eq 1 ]; then
  python3 "$SCRIPT_DIR/rotate_secrets.py"
else
  python3 "$SCRIPT_DIR/render_runtime_secrets.py"
fi

echo "bootstrap-secrets: runtime secrets ready at $PORTAL_RUNTIME_SECRETS_DIR"
echo "bootstrap-secrets: next step -> docker compose -f \"$PROJECT_ROOT/docker-compose.yml\" up -d"
