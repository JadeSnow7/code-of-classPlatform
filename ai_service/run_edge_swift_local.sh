#!/usr/bin/env bash
set -euo pipefail

# Run AI service with edge swift local upstream settings.

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ENV_FILE="${ENV_FILE:-$SCRIPT_DIR/.env.edge_swift_local}"
HOST="${HOST:-127.0.0.1}"
PORT="${PORT:-8001}"

if [ ! -f "$ENV_FILE" ]; then
  echo "[ERROR] Missing env file: $ENV_FILE" >&2
  exit 1
fi

set -a
# shellcheck disable=SC1090
source "$ENV_FILE"
set +a

echo "[INFO] Using env file: $ENV_FILE"
echo "[INFO] Starting AI service at ${HOST}:${PORT}"
exec python3 -m uvicorn app.main:app --host "$HOST" --port "$PORT"
