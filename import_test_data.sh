#!/bin/bash

# Color codes
GREEN='\033[0;32m'
RED='\033[0;31m'
NC='\033[0m' # No Color

echo -e "${GREEN}Starting Test Data Import...${NC}"

# Check if docker compose is running
if ! docker compose ps | grep "Up" > /dev/null; then
    echo -e "${RED}Error: Docker containers are not running.${NC}"
    echo "Please run 'docker compose up -d' first."
    exit 1
fi

echo "Detected running containers. Executing scripts via backend container..."

# Function to run script inside container
run_script() {
    local script_name=$1
    echo -e "Running ${GREEN}$script_name${NC}..."
    
    # We use PYTHONPATH=. to ensure the /app directory (WORKDIR) is included in imports
    # This allows test_db/script.py to import from models.py in /app
    docker compose exec -w /app -e PYTHONPATH=/app backend python3 test_db/$script_name
    
    if [ $? -ne 0 ]; then
        echo -e "${RED}Failed to run $script_name${NC}"
        exit 1
    fi
    echo -e "${GREEN}Success!${NC}"
}

# 1. Initialize Database (Schema + Basic Data)
run_script "init_db.py"

# 2. Initialize RBAC (Roles & Permissions)
run_script "rbac_init.py"

# 3. Seed AI Audit Logs (Mock Data)
run_script "seed_ai_data.py"

# 4. Seed Knowledge Base (Documents + Query Logs)
run_script "seed_kb_data.py"

echo -e "${GREEN}All test data imported successfully!${NC}"
