#!/usr/bin/env sh
set -eu

ROOT_DIR=$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)
cd "$ROOT_DIR"

git pull --ff-only
docker compose up -d --build
docker image prune -f >/dev/null 2>&1 || true
docker compose ps
