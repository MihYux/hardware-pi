#!/usr/bin/env sh
set -eu

ROOT_DIR=$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)
REHOYO_PREFIX=${REHOYO_PREFIX:-/opt/rehoyo}
REHOYO_DATA_DIR=${REHOYO_DATA_DIR:-/var/lib/rehoyo}
REHOYO_ENV_DIR=${REHOYO_ENV_DIR:-/etc/rehoyo}
REHOYO_ENV_FILE="$REHOYO_ENV_DIR/hardware-pi.env"
REHOYO_BUNDLE_URL=${REHOYO_BUNDLE_URL:-https://github.com/MihYux/hardware-pi/releases/download/native-latest/hardware-pi-linux-arm64.tar.gz}
BUNDLE_PATH=
UPDATE_ONLY=0

while [ "$#" -gt 0 ]; do
  case "$1" in
    --bundle)
      BUNDLE_PATH=${2:-}
      shift 2
      ;;
    --update)
      UPDATE_ONLY=1
      shift
      ;;
    *)
      echo "Unknown option: $1" >&2
      exit 2
      ;;
  esac
done

if [ "$(id -u)" -ne 0 ]; then
  echo "Native installation writes system services. Run:" >&2
  echo "  sudo $0${BUNDLE_PATH:+ --bundle $BUNDLE_PATH}" >&2
  exit 1
fi

ARCH=$(uname -m)
case "$ARCH" in
  aarch64|arm64) ;;
  *)
    if [ "${REHOYO_NATIVE_ALLOW_UNSUPPORTED:-0}" != "1" ]; then
      echo "The published native bundle supports ARM64 only; detected: $ARCH" >&2
      exit 1
    fi
    ;;
esac

if [ "$UPDATE_ONLY" -eq 0 ]; then
  if command -v apt-get >/dev/null 2>&1; then
    export DEBIAN_FRONTEND=noninteractive
    apt-get update
    apt-get install -y \
      ca-certificates \
      coreutils \
      curl \
      gzip \
      libatomic1 \
      libstdc++6 \
      python3 \
      python3-pip \
      python3-venv \
      tar
  else
    for command_name in curl gzip python3 systemctl tar; do
      if ! command -v "$command_name" >/dev/null 2>&1; then
        echo "Missing dependency: $command_name" >&2
        echo "Install curl, gzip, Python 3 with venv, tar and systemd, then retry." >&2
        exit 1
      fi
    done
  fi
fi

if ! command -v systemctl >/dev/null 2>&1; then
  echo "systemd is required, but systemctl was not found." >&2
  exit 1
fi

PYTHON_MINOR=$(python3 -c 'import sys; print(f"{sys.version_info.major}.{sys.version_info.minor}")')
case "$PYTHON_MINOR" in
  3.11|3.12) ;;
  *)
    echo "Python 3.11 or 3.12 is required; detected: $PYTHON_MINOR" >&2
    exit 1
    ;;
esac

if command -v docker >/dev/null 2>&1 &&
  [ -f "$ROOT_DIR/docker-compose.yml" ] &&
  docker compose -f "$ROOT_DIR/docker-compose.yml" ps --status running -q 2>/dev/null |
    grep -q .; then
  echo "The Docker version is still running. Stop only this project first:" >&2
  echo "  cd $ROOT_DIR" >&2
  echo "  docker compose down --remove-orphans" >&2
  echo "Data in .data and configuration in .env will be preserved." >&2
  exit 1
fi

TEMP_DIR=$(mktemp -d)
cleanup() {
  rm -rf "$TEMP_DIR"
}
trap cleanup EXIT HUP INT TERM

ARCHIVE="$TEMP_DIR/hardware-pi-linux-arm64.tar.gz"
CHECKSUM="$ARCHIVE.sha256"
if [ -n "$BUNDLE_PATH" ]; then
  cp "$BUNDLE_PATH" "$ARCHIVE"
  if [ -f "$BUNDLE_PATH.sha256" ]; then
    cp "$BUNDLE_PATH.sha256" "$CHECKSUM"
  fi
else
  echo "Downloading the prebuilt ARM64 native release..."
  curl -fL --retry 3 --connect-timeout 15 "$REHOYO_BUNDLE_URL" -o "$ARCHIVE"
  curl -fL --retry 3 --connect-timeout 15 "$REHOYO_BUNDLE_URL.sha256" -o "$CHECKSUM"
fi

if [ -f "$CHECKSUM" ]; then
  EXPECTED=$(awk 'NR == 1 {print $1}' "$CHECKSUM")
  ACTUAL=$(sha256sum "$ARCHIVE" | awk '{print $1}')
  if [ -z "$EXPECTED" ] || [ "$EXPECTED" != "$ACTUAL" ]; then
    echo "Native release checksum verification failed." >&2
    exit 1
  fi
fi

UNPACKED="$TEMP_DIR/unpacked"
mkdir -p "$UNPACKED"
tar -xzf "$ARCHIVE" -C "$UNPACKED"

for required_path in \
  VERSION \
  server/app/main.py \
  server/requirements.txt \
  web/dist/index.html \
  workbench/server.js \
  runtime/node \
  deploy/configure.py \
  deploy/rehoyo \
  deploy/run-workbench.sh \
  deploy/systemd/rehoyo-api.service \
  deploy/systemd/rehoyo-workbench.service; do
  if [ ! -e "$UNPACKED/$required_path" ]; then
    echo "Native release is incomplete: missing $required_path" >&2
    exit 1
  fi
done

VERSION=$(tr -cd 'A-Za-z0-9._-' < "$UNPACKED/VERSION")
if [ -z "$VERSION" ]; then
  echo "Native release has an invalid VERSION." >&2
  exit 1
fi

RELEASES_DIR="$REHOYO_PREFIX/releases"
TARGET="$RELEASES_DIR/$VERSION"
mkdir -p "$RELEASES_DIR" "$REHOYO_DATA_DIR" "$REHOYO_DATA_DIR/workbench" \
  "$REHOYO_DATA_DIR/workbench/next-cache" \
  "$REHOYO_DATA_DIR/bridge/inbox" "$REHOYO_DATA_DIR/bridge/processed" \
  "$REHOYO_DATA_DIR/bridge/quarantine" "$REHOYO_ENV_DIR" /usr/local/lib/rehoyo

if ! getent passwd rehoyo >/dev/null 2>&1; then
  useradd --system --home-dir "$REHOYO_DATA_DIR" --shell /usr/sbin/nologin rehoyo
fi

if [ ! -d "$TARGET" ]; then
  STAGED="$RELEASES_DIR/.install-$VERSION-$$"
  mv "$UNPACKED" "$STAGED"
  chmod 755 "$STAGED/runtime/node" "$STAGED/deploy/rehoyo" \
    "$STAGED/deploy/run-workbench.sh" "$STAGED/deploy/install-native.sh"
  python3 -m venv "$STAGED/.venv"
  WHEELHOUSE="$STAGED/wheels/$PYTHON_MINOR"
  if [ -d "$WHEELHOUSE" ]; then
    "$STAGED/.venv/bin/python" -m pip install \
      --disable-pip-version-check \
      --no-index \
      --find-links "$WHEELHOUSE" \
      -r "$STAGED/server/requirements.txt"
  else
    "$STAGED/.venv/bin/python" -m pip install \
      --disable-pip-version-check \
      -r "$STAGED/server/requirements.txt"
  fi
  if [ -e "$STAGED/workbench/.next/cache" ] ||
    [ -L "$STAGED/workbench/.next/cache" ]; then
    rm -rf "$STAGED/workbench/.next/cache"
  fi
  ln -s "$REHOYO_DATA_DIR/workbench/next-cache" \
    "$STAGED/workbench/.next/cache"
  mv "$STAGED" "$TARGET"
fi

if [ ! -f "$REHOYO_ENV_FILE" ]; then
  if [ -f "$ROOT_DIR/.env" ]; then
    cp "$ROOT_DIR/.env" "$REHOYO_ENV_FILE"
    echo "Imported the existing Docker .env configuration."
  else
    cp "$TARGET/deploy/.env.example" "$REHOYO_ENV_FILE"
  fi
  sed -i "s|^HARDWARE_PI_DATA_DIR=.*|HARDWARE_PI_DATA_DIR=$REHOYO_DATA_DIR|" "$REHOYO_ENV_FILE"
  if ! grep -q '^MARCH7TH_BRIDGE_DIR=' "$REHOYO_ENV_FILE"; then
    echo "MARCH7TH_BRIDGE_DIR=$REHOYO_DATA_DIR/bridge" >> "$REHOYO_ENV_FILE"
  fi
  chmod 600 "$REHOYO_ENV_FILE"
  if [ -t 0 ] && [ -t 1 ]; then
    python3 "$TARGET/deploy/configure.py" "$REHOYO_ENV_FILE"
  fi
fi

if [ -d "$ROOT_DIR/.data" ] &&
  [ ! -e "$REHOYO_DATA_DIR/.docker-data-imported" ]; then
  cp -a "$ROOT_DIR/.data/." "$REHOYO_DATA_DIR/"
  touch "$REHOYO_DATA_DIR/.docker-data-imported"
  echo "Imported existing Docker data from $ROOT_DIR/.data."
fi

chown -R rehoyo:rehoyo "$REHOYO_DATA_DIR"
chmod 700 "$REHOYO_DATA_DIR"

CURRENT_TARGET=
if [ -L "$REHOYO_PREFIX/current" ]; then
  CURRENT_TARGET=$(readlink -f "$REHOYO_PREFIX/current")
fi
if [ -n "$CURRENT_TARGET" ] && [ "$CURRENT_TARGET" != "$TARGET" ]; then
  ln -sfn "$CURRENT_TARGET" "$REHOYO_PREFIX/previous"
fi
ln -sfn "$TARGET" "$REHOYO_PREFIX/.current-new"
mv -Tf "$REHOYO_PREFIX/.current-new" "$REHOYO_PREFIX/current"

install -m 644 "$TARGET/deploy/systemd/rehoyo-api.service" \
  /etc/systemd/system/rehoyo-api.service
install -m 644 "$TARGET/deploy/systemd/rehoyo-workbench.service" \
  /etc/systemd/system/rehoyo-workbench.service
install -m 755 "$TARGET/deploy/rehoyo" /usr/local/sbin/rehoyo
install -m 755 "$TARGET/deploy/install-native.sh" \
  /usr/local/lib/rehoyo/install-native.sh

systemctl daemon-reload
systemctl enable rehoyo-api.service rehoyo-workbench.service
systemctl restart rehoyo-api.service

API_PORT=$(awk -F= '$1 == "HARDWARE_PI_PORT" {print $2}' "$REHOYO_ENV_FILE" | tail -1)
API_PORT=${API_PORT:-8000}
API_READY=0
attempt=0
while [ "$attempt" -lt 30 ]; do
  if curl -fsS "http://127.0.0.1:$API_PORT/api/v1/health" >/dev/null 2>&1; then
    API_READY=1
    break
  fi
  attempt=$((attempt + 1))
  sleep 1
done

if [ "$API_READY" -ne 1 ]; then
  echo "The API failed its health check." >&2
  if [ -L "$REHOYO_PREFIX/previous" ]; then
    PREVIOUS_TARGET=$(readlink -f "$REHOYO_PREFIX/previous")
    ln -sfn "$PREVIOUS_TARGET" "$REHOYO_PREFIX/.current-rollback"
    mv -Tf "$REHOYO_PREFIX/.current-rollback" "$REHOYO_PREFIX/current"
    systemctl restart rehoyo-api.service rehoyo-workbench.service
    echo "Rolled back to the previous native release." >&2
  fi
  systemctl --no-pager --full status rehoyo-api.service >&2 || true
  exit 1
fi

systemctl restart rehoyo-workbench.service
WORKBENCH_PORT=$(awk -F= '$1 == "HARDWARE_PI_WORKBENCH_PORT" {print $2}' "$REHOYO_ENV_FILE" | tail -1)
WORKBENCH_PORT=${WORKBENCH_PORT:-3000}
WORKBENCH_READY=0
attempt=0
while [ "$attempt" -lt 45 ]; do
  if curl -fsS "http://127.0.0.1:$WORKBENCH_PORT/api/project/current" >/dev/null 2>&1; then
    WORKBENCH_READY=1
    break
  fi
  attempt=$((attempt + 1))
  sleep 1
done

if [ "$WORKBENCH_READY" -ne 1 ]; then
  echo "The workbench failed its health check." >&2
  systemctl --no-pager --full status rehoyo-workbench.service >&2 || true
  exit 1
fi

PI_ADDRESS=$(hostname -I 2>/dev/null | awk '{print $1}')
echo
echo "ReHoYo native $VERSION is running without Docker."
echo "Companion: http://${PI_ADDRESS:-orange-pi.local}:$API_PORT"
echo "Workbench: http://${PI_ADDRESS:-orange-pi.local}:$WORKBENCH_PORT"
echo "Configuration: $REHOYO_ENV_FILE"
echo "Data: $REHOYO_DATA_DIR"
echo "Status: rehoyo status"
echo "Logs: rehoyo logs"
