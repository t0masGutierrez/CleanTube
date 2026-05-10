#!/usr/bin/env zsh
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
EXTENSION_DIR="$ROOT_DIR/src/Extension"
OUTPUT_DIR="$ROOT_DIR/build/safari"

if ! xcrun --find safari-web-extension-packager >/dev/null 2>&1; then
  echo "safari-web-extension-packager is unavailable. Install Xcode 26.4.1 or newer, then run this script again." >&2
  exit 1
fi

mkdir -p "$OUTPUT_DIR"
xcrun safari-web-extension-packager "$EXTENSION_DIR" \
  --project-location "$OUTPUT_DIR" \
  --app-name CleanTube \
  --bundle-identifier com.local.CleanTube \
  --ios-only
