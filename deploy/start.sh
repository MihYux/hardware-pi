#!/usr/bin/env sh
set -eu

ROOT_DIR=$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)
cd "$ROOT_DIR"

HARDWARE_PI_IMAGE_TAG=$(git rev-parse HEAD)
export HARDWARE_PI_IMAGE_TAG

echo "Pulling prebuilt ARM64 images for ${HARDWARE_PI_IMAGE_TAG}..."
if docker compose pull; then
  docker compose up -d --no-build
else
  echo "Prebuilt images are unavailable; falling back to a local build."
  "$ROOT_DIR/deploy/build-local.sh"
fi
