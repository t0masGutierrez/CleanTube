const fs = require("node:fs");
const path = require("node:path");
const { spawnSync } = require("node:child_process");

const root = path.resolve(__dirname, "..");
const sourceIcon = path.join(root, "src", "Assets", "icon-source.png");
const extensionDir = path.join(root, "src", "Extension");
const appIconDir = path.join(root, "src", "App", "Assets.xcassets", "AppIcon.appiconset");

const extensionIcons = [
  { size: 48, output: path.join(extensionDir, "icon-48.png") },
  { size: 128, output: path.join(extensionDir, "icon-128.png") }
];

const appIcons = [
  { filename: "Icon-App-20x20@2x.png", size: 40 },
  { filename: "Icon-App-20x20@3x.png", size: 60 },
  { filename: "Icon-App-29x29@2x.png", size: 58 },
  { filename: "Icon-App-29x29@3x.png", size: 87 },
  { filename: "Icon-App-40x40@2x.png", size: 80 },
  { filename: "Icon-App-40x40@3x.png", size: 120 },
  { filename: "Icon-App-60x60@2x.png", size: 120 },
  { filename: "Icon-App-60x60@3x.png", size: 180 },
  { filename: "Icon-App-20x20@1x~ipad.png", size: 20 },
  { filename: "Icon-App-20x20@2x~ipad.png", size: 40 },
  { filename: "Icon-App-29x29@1x~ipad.png", size: 29 },
  { filename: "Icon-App-29x29@2x~ipad.png", size: 58 },
  { filename: "Icon-App-40x40@1x~ipad.png", size: 40 },
  { filename: "Icon-App-40x40@2x~ipad.png", size: 80 },
  { filename: "Icon-App-76x76@1x~ipad.png", size: 76 },
  { filename: "Icon-App-76x76@2x~ipad.png", size: 152 },
  { filename: "Icon-App-83.5x83.5@2x~ipad.png", size: 167 },
  { filename: "Icon-App-1024x1024@1x.png", size: 1024 }
];

function resizeIcon(size, output) {
  const result = spawnSync("sips", ["-z", String(size), String(size), sourceIcon, "--out", output], {
    stdio: "pipe",
    encoding: "utf8"
  });

  if (result.status !== 0) {
    process.stderr.write(result.stderr || result.stdout);
    process.exit(result.status || 1);
  }
}

if (!fs.existsSync(sourceIcon)) {
  throw new Error(`Missing source icon: ${sourceIcon}`);
}

fs.mkdirSync(extensionDir, { recursive: true });
fs.mkdirSync(appIconDir, { recursive: true });

for (const icon of extensionIcons) {
  resizeIcon(icon.size, icon.output);
}

for (const icon of appIcons) {
  resizeIcon(icon.size, path.join(appIconDir, icon.filename));
}

console.log("Generated Safari extension icons and iOS AppIcon assets.");
