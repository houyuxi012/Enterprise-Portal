#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(CDPATH= cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(CDPATH= cd -- "${SCRIPT_DIR}/../.." && pwd)"

BACKEND_IMAGE="${BACKEND_IMAGE:-next-gen-enterprise-portal/backend:local}"
FRONTEND_IMAGE="${FRONTEND_IMAGE:-next-gen-enterprise-portal/frontend:local}"
VITE_API_BASE_URL="${VITE_API_BASE_URL:-/api}"
TARGET_DOCKER_PLATFORM="${TARGET_DOCKER_PLATFORM:-}"

BUILD_BACKEND=1
BUILD_FRONTEND=1
SKIP_VERSION=0

usage() {
  cat <<EOF
Usage: $(basename "$0") [--backend-only] [--frontend-only] [--skip-version]

Environment:
  BACKEND_IMAGE      Backend image tag (default: ${BACKEND_IMAGE})
  FRONTEND_IMAGE     Frontend image tag (default: ${FRONTEND_IMAGE})
  VITE_API_BASE_URL  Frontend build arg (default: ${VITE_API_BASE_URL})
  TARGET_DOCKER_PLATFORM  Optional single-platform build target, e.g. linux/amd64

Behavior:
  - Runs ops/scripts/gen_version.sh before image build unless --skip-version is set
  - Builds backend image from backend/Dockerfile
  - Builds frontend image from frontend/Dockerfile
EOF
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --backend-only)
      BUILD_FRONTEND=0
      ;;
    --frontend-only)
      BUILD_BACKEND=0
      ;;
    --skip-version)
      SKIP_VERSION=1
      ;;
    -h|--help)
      usage
      exit 0
      ;;
    *)
      echo "build-images: unsupported argument: $1" >&2
      usage >&2
      exit 1
      ;;
  esac
  shift
done

if [[ "${BUILD_BACKEND}" -eq 0 && "${BUILD_FRONTEND}" -eq 0 ]]; then
  echo "build-images: nothing selected to build" >&2
  exit 1
fi

if [[ "${SKIP_VERSION}" -ne 1 ]]; then
  "${SCRIPT_DIR}/gen_version.sh"
fi

build_image() {
  local dockerfile="$1"
  local image="$2"
  local context="$3"
  shift 3

  if [[ -n "${TARGET_DOCKER_PLATFORM}" ]]; then
    docker buildx build \
      --platform "${TARGET_DOCKER_PLATFORM}" \
      --load \
      -f "${dockerfile}" \
      -t "${image}" \
      "$@" \
      "${context}"
  else
    docker build \
      -f "${dockerfile}" \
      -t "${image}" \
      "$@" \
      "${context}"
  fi
}

if [[ "${BUILD_BACKEND}" -eq 1 ]]; then
  echo "Building backend image: ${BACKEND_IMAGE}"
  build_image \
    "${PROJECT_ROOT}/backend/Dockerfile" \
    "${BACKEND_IMAGE}" \
    "${PROJECT_ROOT}/backend"
fi

if [[ "${BUILD_FRONTEND}" -eq 1 ]]; then
  echo "Building frontend image: ${FRONTEND_IMAGE}"
  build_image \
    "${PROJECT_ROOT}/frontend/Dockerfile" \
    "${FRONTEND_IMAGE}" \
    "${PROJECT_ROOT}/frontend" \
    --build-arg "VITE_API_BASE_URL=${VITE_API_BASE_URL}"
fi

echo "build-images: completed"
