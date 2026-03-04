#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
HOOKS_DIR="$ROOT/.githooks"

if [[ ! -d "$HOOKS_DIR" ]]; then
  echo "hooks directory not found: $HOOKS_DIR"
  exit 1
fi

chmod +x "$HOOKS_DIR"/pre-push
git -C "$ROOT" config core.hooksPath .githooks

echo "Git hooks installed."
echo "core.hooksPath=$(git -C "$ROOT" config core.hooksPath)"
