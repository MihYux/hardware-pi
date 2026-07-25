#!/usr/bin/env sh
set -eu

GATEWAY_PORT=${HARDWARE_PI_PORT:-8000}
SERVICE_TOKEN=${HARDWARE_PI_SERVICE_TOKEN:-lan-no-auth}

export NODE_ENV=production
export NEXT_TELEMETRY_DISABLED=1
export HOSTNAME=${HARDWARE_PI_HOST:-0.0.0.0}
export PORT=${HARDWARE_PI_WORKBENCH_PORT:-3000}
export DATA_DIR=${HARDWARE_PI_DATA_DIR:-/var/lib/rehoyo}/workbench
export MARCH7TH_BRIDGE_DIR=${MARCH7TH_BRIDGE_DIR:-/var/lib/rehoyo/bridge}
export HARDWARE_PI_GATEWAY=1
export AI_PROVIDER=deepseek
export DEEPSEEK_API_KEY=$SERVICE_TOKEN
export DEEPSEEK_MODEL=hardware-pi-router
export DEEPSEEK_BASE_URL=http://127.0.0.1:$GATEWAY_PORT/api/openai/v1
export ZHIPU_API_KEY=$SERVICE_TOKEN
export GLM_MODEL=hardware-pi-zhipu-router
export GLM_BASE_URL=http://127.0.0.1:$GATEWAY_PORT/api/zhipu/v1

cd /opt/rehoyo/current/workbench
exec /opt/rehoyo/current/runtime/node server.js
