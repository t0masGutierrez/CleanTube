const fs = require("node:fs");
const https = require("node:https");
const os = require("node:os");
const path = require("node:path");
const { spawnSync } = require("node:child_process");
const puppeteer = require("puppeteer-core");

const root = path.resolve(__dirname, "..");
const extensionDir = path.join(root, "src", "Extension");
const systemChromePath = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const certDir = path.join(root, "build", "certs");
const keyPath = path.join(certDir, "localhost.key");
const certPath = path.join(certDir, "localhost.crt");

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

function findChromeExecutable() {
  const browserRoot = path.join(root, "build", "browsers", "chrome");
  if (fs.existsSync(browserRoot)) {
    const channels = fs.readdirSync(browserRoot).sort().reverse();
    for (const channel of channels) {
      const candidate = path.join(
        browserRoot,
        channel,
        "chrome-mac-arm64",
        "Google Chrome for Testing.app",
        "Contents",
        "MacOS",
        "Google Chrome for Testing"
      );
      if (fs.existsSync(candidate)) {
        return candidate;
      }
    }
  }
  return systemChromePath;
}

function ensureCertificate() {
  fs.mkdirSync(certDir, { recursive: true });
  if (fs.existsSync(keyPath) && fs.existsSync(certPath)) {
    return;
  }

  const result = spawnSync("openssl", [
    "req",
    "-x509",
    "-newkey",
    "rsa:2048",
    "-nodes",
    "-keyout",
    keyPath,
    "-out",
    certPath,
    "-days",
    "1",
    "-subj",
    "/CN=www.youtube.com"
  ], { encoding: "utf8" });

  if (result.status !== 0) {
    throw new Error(result.stderr || result.stdout || "openssl failed");
  }
}

function fixtureHtml() {
  return `<!doctype html>
<html>
<head>
  <title>YouTube Fixture</title>
</head>
<body>
  <ytd-guide-entry-renderer id="guide"><a href="/shorts" title="Shorts">Shorts</a></ytd-guide-entry-renderer>
  <ytd-rich-item-renderer id="short-card"><a href="/shorts/fixture">Short video</a></ytd-rich-item-renderer>
  <ytd-rich-item-renderer id="video-card"><a href="/watch?v=fixture">Regular video</a></ytd-rich-item-renderer>
  <ytm-item-section-renderer id="feed-section" data-yt-endpoint='{"browseEndpoint":{"browseId":"FEhome"}}'>
    <ytm-rich-item-renderer id="mobile-feed-short"><a href="/shorts/mobile-feed">Mobile feed short</a></ytm-rich-item-renderer>
    <ytm-rich-item-renderer id="mobile-feed-video"><a href="/watch?v=mobile-feed">Mobile feed video</a></ytm-rich-item-renderer>
  </ytm-item-section-renderer>
  <ytd-backstage-post-thread-renderer id="community-post"></ytd-backstage-post-thread-renderer>
  <ytm-rich-item-renderer id="metadata-post" data-yt-endpoint='{"urlEndpoint":{"url":"/post/UgkxMetadata"}}'></ytm-rich-item-renderer>
  <ytm-pivot-bar-item-renderer id="shorts-fe" tab-identifier="FEshorts">Shorts</ytm-pivot-bar-item-renderer>
  <ytm-pivot-bar-item-renderer id="shorts-text-only"><div class="pivot-shorts"></div><div class="pivot-bar-item-title">Shorts</div></ytm-pivot-bar-item-renderer>
  <script>
    setTimeout(() => {
      const late = document.createElement("ytm-rich-section-renderer");
      late.id = "late-short";
      late.innerHTML = '<a href="/shorts/late">Late short</a>';
      document.body.appendChild(late);
    }, 50);
  </script>
</body>
</html>`;
}

async function runChrome(url) {
  const profileDir = fs.mkdtempSync(path.join(os.tmpdir(), "cleantube-chrome-"));
  const browser = await puppeteer.launch({
    executablePath: findChromeExecutable(),
    headless: "new",
    acceptInsecureCerts: true,
    userDataDir: profileDir,
    args: [
      "--disable-gpu",
      "--no-first-run",
      "--no-default-browser-check",
      "--ignore-certificate-errors",
      "--host-resolver-rules=MAP www.youtube.com 127.0.0.1",
      `--disable-extensions-except=${extensionDir}`,
      `--load-extension=${extensionDir}`
    ]
  });

  try {
    const page = await browser.newPage();
    await page.goto(url, { waitUntil: "domcontentloaded", timeout: 10000 });
    await page.waitForFunction(() => {
      const late = document.querySelector("#late-short");
      return late && late.dataset.cleantubeHidden === "shorts-link";
    }, { timeout: 7000 });
    return await page.evaluate(() => ({
      guide: document.querySelector("#guide")?.dataset.cleantubeHidden,
      shortCard: document.querySelector("#short-card")?.dataset.cleantubeHidden,
      videoCard: document.querySelector("#video-card")?.dataset.cleantubeHidden,
      feedSection: document.querySelector("#feed-section")?.dataset.cleantubeHidden,
      mobileFeedShort: document.querySelector("#mobile-feed-short")?.dataset.cleantubeHidden,
      mobileFeedVideo: document.querySelector("#mobile-feed-video")?.dataset.cleantubeHidden,
      communityPost: document.querySelector("#community-post")?.dataset.cleantubeHidden,
      metadataPost: document.querySelector("#metadata-post")?.dataset.cleantubeHidden,
      shortsFe: document.querySelector("#shorts-fe")?.dataset.cleantubeHidden,
      shortsTextOnly: document.querySelector("#shorts-text-only")?.dataset.cleantubeHidden,
      lateShort: document.querySelector("#late-short")?.dataset.cleantubeHidden
    }));
  } finally {
    await browser.close().catch(() => {});
    fs.rmSync(profileDir, { recursive: true, force: true });
  }
}

async function main() {
  assert(fs.existsSync(findChromeExecutable()), "No Chrome or Chrome for Testing executable was found");
  ensureCertificate();

  const server = https.createServer({
    key: fs.readFileSync(keyPath),
    cert: fs.readFileSync(certPath)
  }, (request, response) => {
    response.writeHead(200, { "content-type": "text/html; charset=utf-8" });
    response.end(fixtureHtml());
  });

  await new Promise(resolve => server.listen(0, "127.0.0.1", resolve));
  const { port } = server.address();

  try {
    const result = await runChrome(`https://www.youtube.com:${port}/`);
    assert(result.videoCard === undefined, "regular video card should not be hidden");
    assert(result.feedSection === undefined, "mobile feed section should not be hidden");
    assert(result.mobileFeedVideo === undefined, "regular mobile feed video should not be hidden");
    assert(result.communityPost === "post-container", "community post was not hidden");
    assert(result.metadataPost === "post-metadata", "metadata-only community post was not hidden");
    assert(result.shortCard === "shorts-link", "short card was not hidden");
    assert(result.mobileFeedShort === "shorts-link", "mobile feed short was not hidden");
    assert(result.guide === "shorts-link", "Shorts guide tab was not hidden");
    assert(result.shortsFe === "shorts-metadata", "metadata-only Shorts tab was not hidden");
    assert(result.shortsTextOnly === "shorts-nav", "text-only Shorts tab was not hidden");
    assert(result.lateShort === "shorts-link", "late-added Shorts shelf was not hidden");
  } finally {
    await new Promise(resolve => server.close(resolve));
  }

  console.log("Chrome extension smoke test passed.");
}

main().catch(error => {
  console.error(error.stack || error.message);
  process.exit(1);
});
