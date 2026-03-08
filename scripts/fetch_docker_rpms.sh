#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
OUTPUT_DIR="${ROOT}/build/docker-rpms/rockylinux9-upstream"
REFRESH=0

DOCKER_REPO_BASE="${DOCKER_REPO_BASE:-https://download.docker.com/linux/centos/9/x86_64/stable/Packages}"
DOCKER_ENGINE_VERSION="${DOCKER_ENGINE_VERSION:-29.3.0-1}"
DOCKER_CLI_VERSION="${DOCKER_CLI_VERSION:-29.3.0-1}"
CONTAINERD_VERSION="${CONTAINERD_VERSION:-2.2.1-1}"
DOCKER_BUILDX_VERSION="${DOCKER_BUILDX_VERSION:-0.31.1-1}"
DOCKER_COMPOSE_VERSION="${DOCKER_COMPOSE_VERSION:-5.1.0-1}"

usage() {
  cat <<'EOF'
Usage:
  bash scripts/fetch_docker_rpms.sh [--output-dir <dir>] [--refresh]

Options:
  --output-dir <dir>  Destination directory for Docker upstream RPMs
  --refresh           Remove existing RPMs in the output dir before downloading
  -h, --help          Show help

Environment:
  DOCKER_REPO_BASE          Docker RPM repository base URL
  DOCKER_ENGINE_VERSION     docker-ce package version suffix (default: 29.3.0-1)
  DOCKER_CLI_VERSION        docker-ce-cli package version suffix (default: 29.3.0-1)
  CONTAINERD_VERSION        containerd.io package version suffix (default: 2.2.1-1)
  DOCKER_BUILDX_VERSION     docker-buildx-plugin version suffix (default: 0.31.1-1)
  DOCKER_COMPOSE_VERSION    docker-compose-plugin version suffix (default: 5.1.0-1)

Behavior:
  - Downloads the Docker CE, CLI, containerd, buildx, and compose RPMs directly
    from Docker's official CentOS/RHEL-compatible repository
  - Leaves Rocky Linux base dependency resolution to a follow-up dnf --downloadonly
    step on a Rocky Linux 9 host
EOF
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --output-dir)
      OUTPUT_DIR="${2:-}"
      shift 2
      ;;
    --refresh)
      REFRESH=1
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

if [[ "${OUTPUT_DIR}" != /* ]]; then
  OUTPUT_DIR="${ROOT}/${OUTPUT_DIR}"
fi

if [[ "${REFRESH}" -eq 1 ]]; then
  rm -f "${OUTPUT_DIR}"/*.rpm 2>/dev/null || true
fi

mkdir -p "${OUTPUT_DIR}"

require_cmd() {
  local cmd="$1"
  if ! command -v "${cmd}" >/dev/null 2>&1; then
    echo "Required command not found: ${cmd}" >&2
    exit 1
  fi
}

download_rpm() {
  local file="$1"
  local url="${DOCKER_REPO_BASE}/${file}"
  echo "Downloading ${file}"
  curl -fL --retry 3 --retry-delay 2 -o "${OUTPUT_DIR}/${file}" "${url}"
}

require_cmd curl

download_rpm "docker-ce-${DOCKER_ENGINE_VERSION}.el9.x86_64.rpm"
download_rpm "docker-ce-cli-${DOCKER_CLI_VERSION}.el9.x86_64.rpm"
download_rpm "containerd.io-${CONTAINERD_VERSION}.el9.x86_64.rpm"
download_rpm "docker-buildx-plugin-${DOCKER_BUILDX_VERSION}.el9.x86_64.rpm"
download_rpm "docker-compose-plugin-${DOCKER_COMPOSE_VERSION}.el9.x86_64.rpm"

count="$(find "${OUTPUT_DIR}" -maxdepth 1 -name '*.rpm' | wc -l | tr -d ' ')"
if [[ "${count}" == "0" ]]; then
  echo "No RPMs were downloaded into ${OUTPUT_DIR}" >&2
  exit 1
fi

echo "Docker upstream RPM bundle ready: ${OUTPUT_DIR}"
echo "RPM count: ${count}"
