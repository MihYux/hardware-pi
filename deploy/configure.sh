#!/usr/bin/env sh
set -eu

ROOT_DIR=$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)
cd "$ROOT_DIR"

if [ ! -f .env ]; then
  cp .env.example .env
fi

python3 "$ROOT_DIR/deploy/configure.py" "$ROOT_DIR/.env"
chmod 600 "$ROOT_DIR/.env"

echo "若服务已经启动，请执行 ./deploy/update.sh 使新的环境配置生效。"
