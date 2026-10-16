const assert = require("node:assert/strict");
const test = require("node:test");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { spawnSync } = require("node:child_process");

// Keep builds, device operations, and Xcode windows outside these tests.
function refresh(t, scenario, destination = "test-iphone-udid") {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "cleantube-refresh-test-"));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const xcodebuildLog = path.join(root, "xcodebuild.log");
  const xcrunLog = path.join(root, "xcrun.log");
  for (const dir of ["scripts", "src", "bin"]) fs.mkdirSync(path.join(root, dir));
  fs.copyFileSync(path.join(__dirname, "../scripts/refresh.sh"), path.join(root, "scripts/refresh.sh"));
  function command(name, body) {
    fs.writeFileSync(path.join(root, "bin", name), `#!/bin/sh\n${body}\n`, { mode: 0o755 });
  }
  command("xcodegen", "exit 0");
  command("open", "exit 0");
  command("osascript", "cat >/dev/null");
  command("xcodebuild", `
    printf '%s\\n' "$*" >> "$REFRESH_XCODEBUILD_LOG"
    if [ "$1" = "-checkFirstLaunchStatus" ]; then exit 0; fi
    if [ "$REFRESH_SCENARIO" = "account" ]; then
      echo 'error: No Account for Team "TESTTEAM".'
      echo "error: No profiles for 'com.local.CleanTube' were found."
      exit 65
    fi
    mkdir -p build/TargetProducts/Debug-iphoneos/CleanTube.app
  `);
  command("xcrun", `
    printf '%s\\n' "$*" >> "$REFRESH_XCRUN_LOG"
    if [ "$REFRESH_SCENARIO" = "unavailable" ]; then
      echo 'ERROR: CoreDeviceService was unable to locate a device matching the requested device identifier.'
      exit 1
    fi
    if [ "$3" = "info" ]; then
      while [ "$1" != "--json-output" ]; do shift; done
      shift
      if [ "$REFRESH_SCENARIO" = "missing-id" ]; then
        printf '%s' '{}' > "$1"
      else
        printf '%s' '{"result":{"hardwareProperties":{"udid":"test-resolved-udid"}}}' > "$1"
      fi
      exit 0
    fi
    if [ "$REFRESH_SCENARIO" = "trust" ] && [ "$3" = "process" ]; then
      echo 'The profile has not been explicitly trusted by the user.'
      exit 1
    fi
  `);
  const result = spawnSync("zsh", [path.join(root, "scripts/refresh.sh")], {
    encoding: "utf8",
    env: { ...process.env, PATH: `${root}/bin:${process.env.PATH}`,
      CLEANTUBE_AUTH_ENV: `${root}/no-auth`, CLEANTUBE_VERBOSE: "0",
      CLEANTUBE_ASC_KEY_PATH: "", CLEANTUBE_ASC_KEY_ID: "", CLEANTUBE_ASC_ISSUER_ID: "",
      APP_STORE_CONNECT_API_KEY_PATH: "", APP_STORE_CONNECT_API_KEY_ID: "",
      APP_STORE_CONNECT_API_KEY_ISSUER_ID: "", REFRESH_SCENARIO: scenario,
      CLEANTUBE_XCODE_DESTINATION_ID: destination,
      REFRESH_XCODEBUILD_LOG: xcodebuildLog, REFRESH_XCRUN_LOG: xcrunLog }
  });
  return { ...result, root, xcodebuildLog, xcrunLog };
}

test("refresh identifies a missing team account before the secondary profile error", t => {
  const result = refresh(t, "account");
  assert.equal(result.status, 1);
  assert.match(result.stderr, /account/i);
  assert.match(result.stderr, /team/i);
  assert.match(result.stderr, /Xcode.*Settings.*Accounts/);
  assert.match(fs.readFileSync(path.join(result.root, "build/refresh-build.log"), "utf8"), /No Account for Team/);
});

test("refresh installs without launching the app", t => {
  const result = refresh(t, "trust");
  assert.equal(result.status, 0, result.stderr);
  assert.equal(result.stdout, "Refreshing... Refreshed.\n");
  const deviceCommands = fs.readFileSync(result.xcrunLog, "utf8");
  assert.match(deviceCommands, /device install app/);
  assert.doesNotMatch(deviceCommands, /process launch/);
});

test("refresh uses the physical device scheme for automatic signing", t => {
  const result = refresh(t, "success");
  assert.equal(result.status, 0, result.stderr);
  assert.equal(result.stdout, "Refreshing... Refreshed.\n");
  const buildCommands = fs.readFileSync(result.xcodebuildLog, "utf8");
  assert.match(buildCommands, /-scheme CleanTube/);
  assert.match(buildCommands, /-destination id=test-iphone-udid/);
  assert.match(buildCommands, /-allowProvisioningUpdates/);
  assert.match(buildCommands, /-allowProvisioningDeviceRegistration/);
});

test("refresh gives connection steps when the phone is unavailable", t => {
  const result = refresh(t, "unavailable");
  assert.equal(result.status, 1);
  assert.match(result.stderr, /USB/);
  assert.match(result.stderr, /unlock/i);
});


test("refresh resolves the device ID before building", t => {
  const result = refresh(t, "success", "");
  assert.equal(result.status, 0, result.stderr);
  assert.match(fs.readFileSync(result.xcodebuildLog, "utf8"), /-destination id=test-resolved-udid/);
  assert.match(fs.readFileSync(result.xcrunLog, "utf8"), /device info details/);
});

for (const scenario of ["unavailable", "missing-id"]) {
  test(`refresh stops before building when device lookup fails: ${scenario}`, t => {
    const result = refresh(t, scenario, "");
    assert.equal(result.status, 1);
    assert.doesNotMatch(fs.readFileSync(result.xcodebuildLog, "utf8"), /-scheme/);
    assert.doesNotMatch(fs.readFileSync(result.xcrunLog, "utf8"), /device install/);
    assert.match(result.stderr, scenario === "unavailable" ? /USB/ : /destination/);
  });
}
