#!/usr/bin/env sh
set -eu

ROOT_DIR=$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)
cd "$ROOT_DIR"

if ! command -v docker >/dev/null 2>&1; then
  echo "Docker is required. Install Docker Engine and the Compose plugin first."
  exit 1
fi

if ! docker compose version >/dev/null 2>&1; then
  echo "Docker Compose plugin is required."
  exit 1
fi

CREATED_ENV=0
if [ ! -f .env ]; then
  cp .env.example .env
  CREATED_ENV=1
  chmod 600 .env
  echo "Created .env in trusted-LAN mode (no browser tokens required)."
fi

if [ "$CREATED_ENV" -eq 1 ] && [ -t 0 ] && [ -t 1 ]; then
  python3 "$ROOT_DIR/deploy/configure.py" "$ROOT_DIR/.env"
  chmod 600 .env
fi

mkdir -p .data/workbench .data/bridge/inbox .data/bridge/processed .data/bridge/quarantine
chmod 700 .data
"$ROOT_DIR/deploy/start.sh"

echo
echo "Hardware Pi is starting."
PI_ADDRESS=$(hostname -I 2>/dev/null | awk '{print $1}')
PUBLISHED_PORT=$(docker compose port hardware-pi 8000 2>/dev/null | awk -F: 'END {print $NF}')
WORKBENCH_PORT=$(docker compose port workbench 3000 2>/dev/null | awk -F: 'END {print $NF}')
echo "Companion: http://${PI_ADDRESS:-orange-pi.local}:${PUBLISHED_PORT:-8000}"
echo "Workbench: http://${PI_ADDRESS:-orange-pi.local}:${WORKBENCH_PORT:-3000}"
echo "Model keys and local settings are stored in: $ROOT_DIR/.env"
echo "Local-build fallback: ./deploy/build-local.sh"
