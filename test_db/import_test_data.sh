#!/usr/bin/env bash

set -euo pipefail

GREEN='\033[0;32m'
RED='\033[0;31m'
NC='\033[0m'

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"
COMPOSE_FILE="${PROJECT_ROOT}/Next-Gen Enterprise Portal/docker-compose.yml"
PORTAL_RUNTIME_SECRETS_DIR="${PORTAL_RUNTIME_SECRETS_DIR:-/tmp/ngep-runtime-secrets}"

compose() {
    PORTAL_RUNTIME_SECRETS_DIR="${PORTAL_RUNTIME_SECRETS_DIR}" docker compose -f "${COMPOSE_FILE}" "$@"
}

run_script() {
    local script_name="$1"
    local script_path="${SCRIPT_DIR}/${script_name}"

    if [[ ! -f "${script_path}" ]]; then
        echo -e "${RED}Script not found: ${script_path}${NC}"
        exit 1
    fi

    echo -e "Running ${GREEN}${script_name}${NC}..."
    compose exec -T backend python3 -c \
        "import sys; sys.path.insert(0, '/app'); script_name = sys.argv[1]; globals_dict = {'__name__': '__main__', '__file__': f'/app/test_db/{script_name}'}; exec(compile(sys.stdin.read(), globals_dict['__file__'], 'exec'), globals_dict)" \
        "${script_name}" < "${script_path}"
    echo -e "${GREEN}${script_name} completed.${NC}"
}

echo -e "${GREEN}Starting test data import...${NC}"
echo "Using compose file: ${COMPOSE_FILE}"
echo "Using PORTAL_RUNTIME_SECRETS_DIR=${PORTAL_RUNTIME_SECRETS_DIR}"

if ! compose ps --status running backend | grep -q "backend"; then
    echo -e "${RED}Error: backend container is not running.${NC}"
    echo "Please run 'docker compose -f \"${COMPOSE_FILE}\" up -d backend db redis' first."
    exit 1
fi

run_script "init_db.py"
run_script "rbac_init.py"
run_script "seed_ai_data.py"
run_script "seed_kb_data.py"
run_script "seed_todos_data.py"

echo -e "${GREEN}All test data imported successfully!${NC}"
