#!/usr/bin/env zsh
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
DERIVED_DATA_PATH="$ROOT_DIR/build/DerivedData"
APP_PATH="$DERIVED_DATA_PATH/Build/Products/Debug-iphoneos/CleanTube.app"
BUNDLE_ID="com.local.CleanTube"
DEFAULT_DEVICE_ID="D8521F80-D6CB-5581-B0C4-C01FA445BD18"
DEVICE="${1:-${CLEANTUBE_DEVICE:-${CLEANTUBE_DEVICE_ID:-$DEFAULT_DEVICE_ID}}}"

print_help() {
  cat <<EOF
Usage:
  scripts/refresh.sh [device-id-or-device-name]

Environment:
  CLEANTUBE_DEVICE           Device identifier or name to install onto.
  CLEANTUBE_DEVICE_ID        Same as CLEANTUBE_DEVICE.
  CLEANTUBE_DEVICE_ATTEMPTS  Install/launch attempts for flaky wireless connections.

Default device:
  $DEFAULT_DEVICE_ID
EOF
}

explain_device_error() {
  local log_file="$1"

  if grep -qi "DeviceLocked\\|device is locked\\|kAMDMobileImageMounterDeviceLocked" "$log_file"; then
    cat <<'EOF' >&2

The iPhone is reachable, but it is locked.
Unlock it, keep it awake on the Home Screen, then run this script again.
EOF
  elif grep -qi "profile has not been explicitly trusted\\|RequestDenied\\|invalid code signature" "$log_file"; then
    cat <<'EOF' >&2

iOS installed the app but refused to launch it because the developer profile is not trusted.
On the iPhone, open:

  Settings > General > VPN & Device Management

Trust the developer profile for this Apple Development account, then run this script again.
EOF
  elif grep -qi "connection reset\\|connection.*invalidated\\|could not be established" "$log_file"; then
    cat <<'EOF' >&2

The Mac can see the iPhone, but the device connection dropped.
Keep the phone unlocked and nearby. If wireless install keeps failing, plug it in once and rerun this script.
EOF
  fi
}

is_transient_device_error() {
  local log_file="$1"
  grep -qi "connection reset\\|connection.*invalidated\\|could not be established\\|Transport error" "$log_file"
}

explain_build_error() {
  local log_file="$1"

  if grep -qi "No Accounts" "$log_file"; then
    cat <<'EOF' >&2

Xcode could not renew the iOS development provisioning profiles because it does not see an Apple account.
Open Xcode, then go to:

  Xcode > Settings > Accounts > + > Apple Account

Sign in with the Apple ID from Bitwarden, make sure your development team is available, then run this script again.
EOF
  elif grep -qi "No profiles for 'com.local.CleanTube" "$log_file"; then
    cat <<'EOF' >&2

Xcode could not find valid CleanTube provisioning profiles.
They may have expired. Once your Apple account is available in Xcode, rerun this script so automatic signing can create fresh profiles.
EOF
  fi
}

run_build_command() {
  local log_file
  local exit_status
  log_file="$(mktemp "${TMPDIR:-/tmp}/cleantube-build.XXXXXX")"

  set +e
  "$@" 2>&1 | tee "$log_file"
  exit_status=$?
  set -e

  if [[ "$exit_status" -eq 0 ]]; then
    rm -f "$log_file"
    return 0
  fi

  explain_build_error "$log_file"
  rm -f "$log_file"
  return "$exit_status"
}

run_device_command() {
  local label="$1"
  shift

  local log_file
  local attempts="${CLEANTUBE_DEVICE_ATTEMPTS:-3}"
  local attempt
  local exit_status

  for attempt in $(seq 1 "$attempts"); do
    log_file="$(mktemp "${TMPDIR:-/tmp}/cleantube-device.XXXXXX")"

    if [[ "$attempt" -eq 1 ]]; then
      echo "$label"
    else
      echo "$label (retry $attempt/$attempts)..."
    fi

    set +e
    "$@" 2>&1 | tee "$log_file"
    exit_status=$?
    set -e

    if [[ "$exit_status" -eq 0 ]]; then
      rm -f "$log_file"
      return 0
    fi

    if [[ "$attempt" -lt "$attempts" ]] && is_transient_device_error "$log_file"; then
      rm -f "$log_file"
      echo "Device connection dropped; waiting before retry..." >&2
      sleep 3
      continue
    fi

    explain_device_error "$log_file"
    rm -f "$log_file"
    return "$exit_status"
  done
}

case "${1:-}" in
  -h|--help)
    print_help
    exit 0
    ;;
esac

cd "$ROOT_DIR"

echo "Generating Xcode project..."
npm run build:xcodeproj

echo "Building fresh iOS app..."
rm -rf "$DERIVED_DATA_PATH"
run_build_command xcodebuild \
  -project src/CleanTube.xcodeproj \
  -scheme CleanTube \
  -configuration Debug \
  -destination 'generic/platform=iOS' \
  -derivedDataPath "$DERIVED_DATA_PATH" \
  -allowProvisioningUpdates \
  build

if [[ ! -d "$APP_PATH" ]]; then
  echo "Expected app was not built: $APP_PATH" >&2
  exit 1
fi

echo "Refreshing CleanTube on device: $DEVICE"
run_device_command "Installing app..." \
  xcrun devicectl device install app \
    --device "$DEVICE" \
    "$APP_PATH"

run_device_command "Launching app..." \
  xcrun devicectl device process launch \
    --device "$DEVICE" \
    "$BUNDLE_ID"

echo "CleanTube refreshed on device."
