const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const extensionDir = path.join(root, "src", "Extension");
const allowedExtensionFiles = new Set([
  "content.css",
  "content.js",
  "core.js",
  "icon-128.png",
  "icon-48.png",
  "manifest.json",
  "popup.css",
  "popup.html",
  "popup.js"
]);

function readJson(relativePath) {
  return JSON.parse(fs.readFileSync(path.join(extensionDir, relativePath), "utf8"));
}

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

function pngDimensions(relativePath) {
  const bytes = fs.readFileSync(path.join(extensionDir, relativePath));
  assert(bytes.toString("ascii", 1, 4) === "PNG", `${relativePath} must be a PNG`);
  return {
    width: bytes.readUInt32BE(16),
    height: bytes.readUInt32BE(20)
  };
}

const manifest = readJson("manifest.json");
assert(manifest.manifest_version === 3, "manifest must use MV3");
assert(Array.isArray(manifest.content_scripts) && manifest.content_scripts.length > 0, "content script missing");
assert(!manifest.declarative_net_request, "request-filtering config must not be present");
assert(!fs.existsSync(path.join(extensionDir, "rules.json")), "request-filtering rules file must not be present");
assert(!fs.existsSync(path.join(extensionDir, "_metadata")), "generated extension metadata must not be present");
assert(!(manifest.permissions || []).includes("declarativeNetRequest"), "declarativeNetRequest permission must not be present");

const hostPermissions = (manifest.host_permissions || []).slice().sort();
const expectedHosts = [
  "https://m.youtube.com/*",
  "https://www.youtube.com/*",
  "https://youtube.com/*"
].sort();
assert(JSON.stringify(hostPermissions) === JSON.stringify(expectedHosts), "host permissions must be limited to YouTube");

for (const script of manifest.content_scripts) {
  for (const file of script.js || []) {
    assert(fs.existsSync(path.join(extensionDir, file)), `missing content script: ${file}`);
  }
  for (const file of script.css || []) {
    assert(fs.existsSync(path.join(extensionDir, file)), `missing stylesheet: ${file}`);
  }
}

for (const iconPath of Object.values(manifest.icons || {})) {
  assert(fs.existsSync(path.join(extensionDir, iconPath)), `missing icon: ${iconPath}`);
}

for (const iconPath of Object.values(manifest.action?.default_icon || {})) {
  assert(fs.existsSync(path.join(extensionDir, iconPath)), `missing action icon: ${iconPath}`);
}

for (const [size, iconPath] of Object.entries(manifest.icons || {})) {
  const expectedSize = Number(size);
  const dimensions = pngDimensions(iconPath);
  assert(
    dimensions.width === expectedSize && dimensions.height === expectedSize,
    `${iconPath} must be ${expectedSize}x${expectedSize}`
  );
}

for (const entry of fs.readdirSync(extensionDir)) {
  assert(allowedExtensionFiles.has(entry), `unexpected extension file: ${entry}`);
}

console.log("Extension manifest is valid for Shorts filtering only.");
