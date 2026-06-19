#!/usr/bin/env zsh
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
DERIVED_DATA_PATH="$ROOT_DIR/build/DerivedData"
APP_PATH="$DERIVED_DATA_PATH/Build/Products/Debug-iphoneos/CleanTube.app"
BUNDLE_ID="com.local.CleanTube"
DEFAULT_DEVICE_ID="D8521F80-D6CB-5581-B0C4-C01FA445BD18"
DEVICE="${1:-${CLEANTUBE_DEVICE:-${CLEANTUBE_DEVICE_ID:-$DEFAULT_DEVICE_ID}}}"
VERBOSE="${CLEANTUBE_VERBOSE:-0}"

print_help() {
  cat <<EOF
Usage:
  scripts/refresh.sh [device-id-or-device-name]

Environment:
  CLEANTUBE_DEVICE           Device identifier or name to install onto.
  CLEANTUBE_DEVICE_ID        Same as CLEANTUBE_DEVICE.
  CLEANTUBE_DEVICE_ATTEMPTS  Install/launch attempts for flaky wireless connections.
  CLEANTUBE_VERBOSE=1        Show full command output instead of summarized checkpoints.

Default device:
  $DEFAULT_DEVICE_ID
EOF
}

is_verbose() {
  [[ "$VERBOSE" == "1" || "$VERBOSE" == "true" || "$VERBOSE" == "yes" ]]
}

print_log_summary() {
  local log_file="$1"
  local important

  important="$(
    grep -Ei "error:|warning:|ERROR:|FAILED|No profiles|No Accounts|RequestDenied|invalid code signature|profile has not been explicitly trusted|connection reset|connection.*invalidated|could not be established|Transport error" "$log_file" | tail -n 30 || true
  )"

  if [[ -n "$important" ]]; then
    echo "Important output:" >&2
    echo "$important" >&2
  else
    echo "Last output:" >&2
    tail -n 30 "$log_file" >&2
  fi
}

run_xcodegen() {
  local log_file
  local exit_status
  log_file="$(mktemp "${TMPDIR:-/tmp}/cleantube-xcodegen.XXXXXX")"

  echo "Generating Xcode project..."
  set +e
  if is_verbose; then
    (cd "$ROOT_DIR/src" && xcodegen generate --spec project.yml) 2>&1 | tee "$log_file"
    exit_status=$?
  else
    (cd "$ROOT_DIR/src" && xcodegen generate --spec project.yml) > "$log_file" 2>&1
    exit_status=$?
  fi
  set -e

  if [[ "$exit_status" -eq 0 ]]; then
    echo "[ok] Xcode project generated"
    rm -f "$log_file"
    return 0
  fi

  echo "[failed] Xcode project generation failed" >&2
  print_log_summary "$log_file"
  echo "Full log: $log_file" >&2
  return "$exit_status"
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

  echo "Building fresh iOS app..."
  set +e
  if is_verbose; then
    "$@" 2>&1 | tee "$log_file"
    exit_status=$?
  else
    "$@" > "$log_file" 2>&1
    exit_status=$?
  fi
  set -e

  if [[ "$exit_status" -eq 0 ]]; then
    echo "[ok] iOS app built and signed"
    rm -f "$log_file"
    return 0
  fi

  echo "[failed] iOS build failed" >&2
  print_log_summary "$log_file"
  explain_build_error "$log_file"
  echo "Full log: $log_file" >&2
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
      echo "$label..."
    else
      echo "$label retry $attempt/$attempts..."
    fi

    set +e
    if is_verbose; then
      "$@" 2>&1 | tee "$log_file"
      exit_status=$?
    else
      "$@" > "$log_file" 2>&1
      exit_status=$?
    fi
    set -e

    if [[ "$exit_status" -eq 0 ]]; then
      echo "[ok] $label"
      rm -f "$log_file"
      return 0
    fi

    if [[ "$attempt" -lt "$attempts" ]] && is_transient_device_error "$log_file"; then
      rm -f "$log_file"
      echo "[retry] Device connection dropped; waiting before retry..." >&2
      sleep 3
      continue
    fi

    echo "[failed] $label" >&2
    print_log_summary "$log_file"
    explain_device_error "$log_file"
    echo "Full log: $log_file" >&2
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

run_xcodegen

rm -rf "$DERIVED_DATA_PATH"
run_build_command xcodebuild \
  -quiet \
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
run_device_command "Installing app" \
  xcrun devicectl device install app \
    --device "$DEVICE" \
    "$APP_PATH"

run_device_command "Launching app" \
  xcrun devicectl device process launch \
    --device "$DEVICE" \
    "$BUNDLE_ID"

echo "CleanTube refreshed on device."
