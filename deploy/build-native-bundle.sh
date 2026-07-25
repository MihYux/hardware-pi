#!/usr/bin/env sh
set -eu

ROOT_DIR=$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)
OUTPUT_DIR=${1:-"$ROOT_DIR/dist"}
VERSION=${2:-$(git -C "$ROOT_DIR" rev-parse HEAD)}
NODE_BINARY=${3:-$(command -v node)}
WHEELS_311=${4:-}
WHEELS_312=${5:-}
ARCHIVE="$OUTPUT_DIR/hardware-pi-linux-arm64.tar.gz"

for required_path in \
  "$ROOT_DIR/web/dist/index.html" \
  "$ROOT_DIR/workbench/.next/standalone/server.js" \
  "$ROOT_DIR/workbench/.next/static" \
  "$NODE_BINARY"; do
  if [ ! -e "$required_path" ]; then
    echo "Missing native bundle input: $required_path" >&2
    exit 1
  fi
done

TEMP_DIR=$(mktemp -d)
cleanup() {
  rm -rf "$TEMP_DIR"
}
trap cleanup EXIT HUP INT TERM
BUNDLE="$TEMP_DIR/bundle"

mkdir -p "$OUTPUT_DIR" "$BUNDLE/runtime" "$BUNDLE/web" "$BUNDLE/workbench/.next" \
  "$BUNDLE/deploy/systemd" "$BUNDLE/server"
cp -R "$ROOT_DIR/server/app" "$BUNDLE/server/app"
cp "$ROOT_DIR/server/requirements.txt" "$BUNDLE/server/requirements.txt"
cp -R "$ROOT_DIR/shared" "$BUNDLE/shared"
cp -R "$ROOT_DIR/web/dist" "$BUNDLE/web/dist"
cp -R "$ROOT_DIR/workbench/.next/standalone/." "$BUNDLE/workbench/"
cp -R "$ROOT_DIR/workbench/.next/static" "$BUNDLE/workbench/.next/static"
cp "$NODE_BINARY" "$BUNDLE/runtime/node"
cp "$ROOT_DIR/deploy/configure.py" "$BUNDLE/deploy/configure.py"
cp "$ROOT_DIR/deploy/install-native.sh" "$BUNDLE/deploy/install-native.sh"
cp "$ROOT_DIR/deploy/native/rehoyo" "$BUNDLE/deploy/rehoyo"
cp "$ROOT_DIR/deploy/native/run-workbench.sh" "$BUNDLE/deploy/run-workbench.sh"
cp "$ROOT_DIR/deploy/native/rollback-native.sh" "$BUNDLE/deploy/rollback-native.sh"
cp "$ROOT_DIR/deploy/native/systemd/"*.service "$BUNDLE/deploy/systemd/"
cp "$ROOT_DIR/.env.example" "$BUNDLE/deploy/.env.example"

if [ -n "$WHEELS_311" ] && [ -d "$WHEELS_311" ]; then
  mkdir -p "$BUNDLE/wheels/3.11"
  cp "$WHEELS_311/"* "$BUNDLE/wheels/3.11/"
fi
if [ -n "$WHEELS_312" ] && [ -d "$WHEELS_312" ]; then
  mkdir -p "$BUNDLE/wheels/3.12"
  cp "$WHEELS_312/"* "$BUNDLE/wheels/3.12/"
fi

printf '%s\n' "$VERSION" > "$BUNDLE/VERSION"
chmod 755 "$BUNDLE/runtime/node" "$BUNDLE/deploy/install-native.sh" \
  "$BUNDLE/deploy/rehoyo" "$BUNDLE/deploy/run-workbench.sh" \
  "$BUNDLE/deploy/rollback-native.sh"

tar -czf "$ARCHIVE" -C "$BUNDLE" .
(
  cd "$OUTPUT_DIR"
  sha256sum "$(basename "$ARCHIVE")" > "$(basename "$ARCHIVE").sha256"
)
echo "$ARCHIVE"
