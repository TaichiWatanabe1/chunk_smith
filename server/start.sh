#!/usr/bin/env bash
set -euo pipefail

# Change to the server directory (script is inside server/)
cd "$(dirname "$0")"

# If a virtualenv exists, activate it
if [ -f .venv/bin/activate ]; then
  # shellcheck disable=SC1091
  . .venv/bin/activate
fi

# Default: development server with reload
echo "Starting development server on 0.0.0.0:8000 (reload)"
uv run uvicorn app.main:app --reload --host 0.0.0.0 --port 8000
