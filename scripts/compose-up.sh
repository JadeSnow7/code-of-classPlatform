#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

if [[ ! -f "$ROOT_DIR/deploy/.env" ]]; then
  echo "missing deploy/.env, creating from deploy/.env.example"
  cp "$ROOT_DIR/deploy/.env.example" "$ROOT_DIR/deploy/.env"
fi

docker compose --env-file "$ROOT_DIR/deploy/.env" -f "$ROOT_DIR/deploy/docker-compose.yml" up -d --build

