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

if [ ! -f .env ]; then
  cp .env.example .env
  python3 - "$ROOT_DIR/.env" <<'PY'
from pathlib import Path
import secrets
import sys

path = Path(sys.argv[1])
content = path.read_text(encoding="utf-8")
for placeholder in (
    "replace-with-a-long-random-admin-token",
    "replace-with-a-long-random-device-token",
    "replace-with-a-long-random-service-token",
):
    content = content.replace(placeholder, secrets.token_urlsafe(32), 1)
path.write_text(content, encoding="utf-8")
PY
  chmod 600 .env
  echo "Created .env with random access tokens."
  echo "Add provider API keys with: nano $ROOT_DIR/.env"
fi

mkdir -p .data
chmod 700 .data
docker compose up -d --build

echo
echo "Hardware Pi is starting."
PI_ADDRESS=$(hostname -I 2>/dev/null | awk '{print $1}')
PUBLISHED_PORT=$(docker compose port hardware-pi 8000 2>/dev/null | awk -F: 'END {print $NF}')
echo "Open: http://${PI_ADDRESS:-orange-pi.local}:${PUBLISHED_PORT:-8000}"
echo "Tokens are stored in: $ROOT_DIR/.env"
