#!/usr/bin/env zsh
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
DERIVED_DATA_PATH="$ROOT_DIR/build/DerivedData"
TARGET_PRODUCTS_PATH="$ROOT_DIR/build/TargetProducts"
TARGET_INTERMEDIATES_PATH="$ROOT_DIR/build/TargetIntermediates"
APP_PATH="$TARGET_PRODUCTS_PATH/Debug-iphoneos/CleanTube.app"
BUNDLE_ID="com.local.CleanTube"
DEFAULT_DEVICE_ID="D8521F80-D6CB-5581-B0C4-C01FA445BD18"
DEVICE="${1:-${CLEANTUBE_DEVICE:-${CLEANTUBE_DEVICE_ID:-$DEFAULT_DEVICE_ID}}}"
VERBOSE="${CLEANTUBE_VERBOSE:-0}"
AUTH_ENV_FILE="${CLEANTUBE_AUTH_ENV:-$HOME/.cleantube/xcode-auth.env}"
XCODEBUILD_AUTH_ARGS=()
ERROR_MESSAGE=""
ERROR_REPORTED=0
report_error() {
  local message="$1"
  printf '\nError: %s\n' "$message" >&2
  ERROR_REPORTED=1
}

handle_exit() {
  local exit_status="$1"
  if [[ "$exit_status" -ne 0 && "$ERROR_REPORTED" -eq 0 ]]; then
    report_error "${ERROR_MESSAGE:-Refresh failed.}"
  fi
}

trap 'handle_exit "$?"' EXIT

fail_refresh() {
  ERROR_MESSAGE="$1"
  report_error "$ERROR_MESSAGE"
  exit 1
}

error_message_from_log() {
  local log_file="$1"
  local message

  message="$({
    grep -Ei "error:|failed|no profiles|no accounts|requestdenied|invalid code signature|connection reset|connection.*invalidated|could not be established|transport error|device unavailable|authorization is required|coresimulator is out of date|iOS .* is not installed" "$log_file" || true
  } | tail -n 1 | sed 's/\r//g')"

  if [[ -z "$message" ]]; then
    message="$(tail -n 1 "$log_file" 2>/dev/null | sed 's/\r//g' || true)"
  fi

  printf '%s' "${message:-Refresh failed.}"
}

set_error_from_log() {
  ERROR_MESSAGE="$(error_message_from_log "$1")"
}

print_help() {
  cat <<EOF
Usage:
  scripts/refresh.sh [device-id-or-device-name]

Environment:
  CLEANTUBE_DEVICE           Device identifier or name to install onto.
  CLEANTUBE_DEVICE_ID        Same as CLEANTUBE_DEVICE.
  CLEANTUBE_DEVICE_ATTEMPTS  Install/launch attempts for flaky wireless connections.
  CLEANTUBE_AUTH_ENV         Optional env file with App Store Connect API key settings.
                             This requires App Store Connect API access.
  CLEANTUBE_ASC_KEY_PATH     Path to App Store Connect AuthKey_*.p8.
  CLEANTUBE_ASC_KEY_ID       App Store Connect API key ID.
  CLEANTUBE_ASC_ISSUER_ID    App Store Connect issuer ID.
  CLEANTUBE_VERBOSE=1        Show full command output for debugging.

Default device:
  $DEFAULT_DEVICE_ID
EOF
}

load_xcodebuild_auth() {
  if [[ -f "$AUTH_ENV_FILE" ]]; then
    source "$AUTH_ENV_FILE"
  fi

  CLEANTUBE_ASC_KEY_PATH="${CLEANTUBE_ASC_KEY_PATH:-${APP_STORE_CONNECT_API_KEY_PATH:-}}"
  CLEANTUBE_ASC_KEY_ID="${CLEANTUBE_ASC_KEY_ID:-${APP_STORE_CONNECT_API_KEY_ID:-}}"
  CLEANTUBE_ASC_ISSUER_ID="${CLEANTUBE_ASC_ISSUER_ID:-${APP_STORE_CONNECT_API_KEY_ISSUER_ID:-}}"

  if [[ -z "$CLEANTUBE_ASC_KEY_PATH" && -z "$CLEANTUBE_ASC_KEY_ID" && -z "$CLEANTUBE_ASC_ISSUER_ID" ]]; then
    return 0
  fi

  if [[ -z "$CLEANTUBE_ASC_KEY_PATH" || -z "$CLEANTUBE_ASC_KEY_ID" || -z "$CLEANTUBE_ASC_ISSUER_ID" ]]; then
    ERROR_MESSAGE="App Store Connect API key authentication is incomplete in $AUTH_ENV_FILE."
    return 1
  fi

  if [[ ! -f "$CLEANTUBE_ASC_KEY_PATH" ]]; then
    ERROR_MESSAGE="App Store Connect API key file was not found: $CLEANTUBE_ASC_KEY_PATH"
    return 1
  fi

  XCODEBUILD_AUTH_ARGS=(
    -authenticationKeyPath "$CLEANTUBE_ASC_KEY_PATH"
    -authenticationKeyID "$CLEANTUBE_ASC_KEY_ID"
    -authenticationKeyIssuerID "$CLEANTUBE_ASC_ISSUER_ID"
  )
}

explain_xcode_setup_error() {
  ERROR_MESSAGE="Xcode needs first-launch setup. Run sudo xcodebuild -runFirstLaunch -checkForNewerComponents."
}

check_xcode_setup() {
  set +e
  xcodebuild -checkFirstLaunchStatus >/dev/null 2>&1
  local exit_status=$?
  set -e

  if [[ "$exit_status" -ne 0 ]]; then
    explain_xcode_setup_error
    return "$exit_status"
  fi
}

is_verbose() {
  [[ "$VERBOSE" == "1" || "$VERBOSE" == "true" || "$VERBOSE" == "yes" ]]
}

open_xcode_accounts() {
  open -a Xcode "$ROOT_DIR/src/CleanTube.xcodeproj" >/dev/null 2>&1 || open -a Xcode >/dev/null 2>&1 || true

  osascript >/dev/null 2>&1 <<'APPLESCRIPT' || true
tell application "Xcode" to activate
delay 1
tell application "System Events"
  tell process "Xcode"
    set frontmost to true
    keystroke "," using command down
    delay 1
    set didOpenAccounts to false
    try
      click button "Accounts" of toolbar 1 of window 1
      set didOpenAccounts to true
    end try
    try
      if didOpenAccounts is false then
        click radio button "Accounts" of tab group 1 of window 1
        set didOpenAccounts to true
      end if
    end try
    try
      if didOpenAccounts is false then
        click button "Accounts" of window 1
        set didOpenAccounts to true
      end if
    end try
    if didOpenAccounts is false then error "Accounts control was not found"
  end tell
end tell
APPLESCRIPT
}

run_xcodegen() {
  local log_file
  local exit_status
  log_file="$(mktemp "${TMPDIR:-/tmp}/cleantube-xcodegen.XXXXXX")"

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
    rm -f "$log_file"
    return 0
  fi

  set_error_from_log "$log_file"
  rm -f "$log_file"
  return "$exit_status"
}

explain_device_error() {
  local log_file="$1"

  if grep -qi "DeviceLocked\\|device is locked\\|kAMDMobileImageMounterDeviceLocked" "$log_file"; then
    ERROR_MESSAGE="The iPhone is locked. Unlock it and try again."
  elif grep -qi "connection reset\\|connection.*invalidated\\|could not be established" "$log_file"; then
    ERROR_MESSAGE="The iPhone connection dropped. Keep it unlocked and try again."
  fi
}

is_transient_device_error() {
  local log_file="$1"
  grep -qi "connection reset\\|connection.*invalidated\\|could not be established\\|Transport error" "$log_file"
}

is_untrusted_profile_error() {
  local log_file="$1"
  grep -qi "profile has not been explicitly trusted\\|RequestDenied\\|invalid code signature" "$log_file"
}

explain_build_error() {
  local log_file="$1"

  if grep -qi "Authorization is required\\|CoreSimulator is out of date\\|iOS .* is not installed" "$log_file"; then
    explain_xcode_setup_error
  elif grep -qi "No available simulator runtimes\\|No simulator runtime version\\|SimServiceContext supportedRuntimes" "$log_file"; then
    ERROR_MESSAGE="Xcode could not use the installed iOS simulator runtime."
  elif grep -qi "No Accounts" "$log_file"; then
    ERROR_MESSAGE="Xcode could not renew the iOS development profile because no Apple account is available."
    open_xcode_accounts
  elif grep -qi "No profiles for 'com.local.CleanTube" "$log_file"; then
    ERROR_MESSAGE="Xcode could not find a valid CleanTube provisioning profile."
  else
    set_error_from_log "$log_file"
  fi
}

run_build_command() {
  local log_file
  local exit_status
  log_file="$(mktemp "${TMPDIR:-/tmp}/cleantube-build.XXXXXX")"

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
      rm -f "$log_file"
      return 0
    fi

    if [[ "$attempt" -lt "$attempts" ]] && is_transient_device_error "$log_file"; then
      rm -f "$log_file"
      sleep 3
      continue
    fi

    if is_untrusted_profile_error "$log_file"; then
      rm -f "$log_file"
      if [[ "$label" == "Launching app" ]]; then
        return 0
      fi
      ERROR_MESSAGE="iOS rejected the developer profile."
      return "$exit_status"
    fi

    explain_device_error "$log_file"
    if [[ -z "$ERROR_MESSAGE" ]]; then
      set_error_from_log "$log_file"
    fi
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

printf 'Refreshing...'
cd "$ROOT_DIR"

if ! check_xcode_setup; then
  fail_refresh "${ERROR_MESSAGE:-Xcode setup failed.}"
fi

if ! load_xcodebuild_auth; then
  fail_refresh "${ERROR_MESSAGE:-Xcode authentication setup failed.}"
fi

if ! run_xcodegen; then
  fail_refresh "${ERROR_MESSAGE:-Xcode project generation failed.}"
fi

if ! rm -rf "$DERIVED_DATA_PATH" "$TARGET_PRODUCTS_PATH" "$TARGET_INTERMEDIATES_PATH"; then
  fail_refresh "Could not clear old build files."
fi

if ! run_build_command xcodebuild \
  -quiet \
  -project src/CleanTube.xcodeproj \
  -target CleanTube \
  -configuration Debug \
  -sdk iphoneos \
  CONFIGURATION_BUILD_DIR="$TARGET_PRODUCTS_PATH/Debug-iphoneos" \
  OBJROOT="$TARGET_INTERMEDIATES_PATH" \
  SYMROOT="$TARGET_PRODUCTS_PATH" \
  -allowProvisioningUpdates \
  "${XCODEBUILD_AUTH_ARGS[@]}" \
  build; then
  fail_refresh "${ERROR_MESSAGE:-iOS build failed.}"
fi

if [[ ! -d "$APP_PATH" ]]; then
  fail_refresh "The expected iOS app was not built."
fi

if ! run_device_command "Installing app" \
  xcrun devicectl device install app \
    --device "$DEVICE" \
    "$APP_PATH"; then
  fail_refresh "${ERROR_MESSAGE:-App installation failed.}"
fi

if ! run_device_command "Launching app" \
  xcrun devicectl device process launch \
    --device "$DEVICE" \
    "$BUNDLE_ID"; then
  fail_refresh "${ERROR_MESSAGE:-App launch failed.}"
fi

printf ' Refreshed.\n'
