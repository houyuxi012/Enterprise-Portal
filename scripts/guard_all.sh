#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
MODE="normal"
SCOPE="all"
OUTPUT="plain"
REPORT_DIR=""

usage() {
  cat <<'EOF'
Usage:
  bash scripts/guard_all.sh [--mode normal|strict] [--scope all|backend|frontend] [--output plain|json] [--report-dir <dir>]
EOF
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --mode)
      MODE="${2:-}"
      shift 2
      ;;
    --scope)
      SCOPE="${2:-}"
      shift 2
      ;;
    --output)
      OUTPUT="${2:-}"
      shift 2
      ;;
    --report-dir)
      REPORT_DIR="${2:-}"
      shift 2
      ;;
    -h|--help)
      usage
      exit 0
      ;;
    *)
      echo "Unknown arg: $1" >&2
      usage
      exit 1
      ;;
  esac
done

if [[ "$MODE" != "normal" && "$MODE" != "strict" ]]; then
  echo "--mode must be normal or strict" >&2
  exit 1
fi
if [[ "$SCOPE" != "all" && "$SCOPE" != "backend" && "$SCOPE" != "frontend" ]]; then
  echo "--scope must be all, backend, or frontend" >&2
  exit 1
fi
if [[ "$OUTPUT" != "plain" && "$OUTPUT" != "json" ]]; then
  echo "--output must be plain or json" >&2
  exit 1
fi

BACKEND_REPORT=""
FRONTEND_REPORT=""
MIGRATION_REPORT=""
if [[ -n "$REPORT_DIR" ]]; then
  if [[ "$REPORT_DIR" = /* ]]; then
    REPORT_DIR_ABS="$REPORT_DIR"
  else
    REPORT_DIR_ABS="$ROOT/$REPORT_DIR"
  fi
  mkdir -p "$REPORT_DIR_ABS"
  BACKEND_REPORT="$REPORT_DIR_ABS/backend-architecture-${MODE}.json"
  FRONTEND_REPORT="$REPORT_DIR_ABS/frontend-structure-${MODE}.json"
  MIGRATION_REPORT="$REPORT_DIR_ABS/backend-migration-${MODE}.json"
fi

run_backend() {
  echo "[guard_all] backend architecture guard (mode=$MODE)"
  cd "$ROOT/Next-Gen Enterprise Portal"
  if [[ -n "$BACKEND_REPORT" ]]; then
    python3 backend/scripts/check_architecture_boundaries.py \
      --config backend/scripts/architecture-guard.config.json \
      --mode "$MODE" \
      --output "$OUTPUT" \
      --report-file "$BACKEND_REPORT" \
      --root backend \
      --extra ../Test_case \
      --extra ../test_db
  else
    python3 backend/scripts/check_architecture_boundaries.py \
      --config backend/scripts/architecture-guard.config.json \
      --mode "$MODE" \
      --output "$OUTPUT" \
      --root backend \
      --extra ../Test_case \
      --extra ../test_db
  fi

  echo "[guard_all] backend compile check"
  python3 -m compileall backend ../Test_case ../test_db >/dev/null

  echo "[guard_all] backend migration guard"
  if [[ -n "$MIGRATION_REPORT" ]]; then
    python3 backend/scripts/check_migration_guard.py \
      --backend-root backend \
      --output "$OUTPUT" \
      --report-file "$MIGRATION_REPORT"
  else
    python3 backend/scripts/check_migration_guard.py \
      --backend-root backend \
      --output "$OUTPUT"
  fi
}

run_frontend() {
  echo "[guard_all] frontend structure guard (mode=$MODE)"
  cd "$ROOT/Next-Gen Enterprise Portal/frontend"
  if [[ -n "$FRONTEND_REPORT" ]]; then
    node scripts/check-structure-guard.mjs \
      --config scripts/structure-guard.config.json \
      --mode "$MODE" \
      --output "$OUTPUT" \
      --report-file "$FRONTEND_REPORT"
  else
    node scripts/check-structure-guard.mjs \
      --config scripts/structure-guard.config.json \
      --mode "$MODE" \
      --output "$OUTPUT"
  fi
}

case "$SCOPE" in
  backend)
    run_backend
    ;;
  frontend)
    run_frontend
    ;;
  all)
    run_backend
    run_frontend
    ;;
esac

echo "[guard_all] done"
