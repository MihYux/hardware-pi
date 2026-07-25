#!/usr/bin/env sh
set -eu

PREFIX=/opt/rehoyo
CURRENT=$(readlink -f "$PREFIX/current")
PREVIOUS=$(readlink -f "$PREFIX/previous")

if [ -z "$PREVIOUS" ] || [ ! -d "$PREVIOUS" ]; then
  echo "No valid previous release is available." >&2
  exit 1
fi

ln -sfn "$PREVIOUS" "$PREFIX/.current-rollback"
mv -Tf "$PREFIX/.current-rollback" "$PREFIX/current"
ln -sfn "$CURRENT" "$PREFIX/previous"
systemctl restart rehoyo-api.service rehoyo-workbench.service
echo "Rolled back to $(basename "$PREVIOUS")."
