const assert = require("node:assert/strict");
const test = require("node:test");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { spawnSync } = require("node:child_process");
const { JSDOM } = require("jsdom");

function project(t) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "cleantube-build-"));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  for (const file of ["scripts/build-userscript.js", "src/Extension/core.js", "src/Extension/content.css", "src/Extension/manifest.json", "src/Userscript/runtime.js"]) {
    fs.mkdirSync(path.dirname(path.join(root, file)), { recursive: true });
    fs.copyFileSync(path.join(__dirname, "..", file), path.join(root, file));
  }
  return root;
}
function build(root) {
  return spawnSync(process.execPath, [path.join(root, "scripts/build-userscript.js")], { cwd: os.tmpdir(), encoding: "utf8" });
}

test("fresh build produces the complete and repeatable install file from any directory", t => {
  const root = project(t);
  const result = build(root);
  assert.equal(result.status, 0, result.stderr);
  const output = fs.readFileSync(path.join(root, "userscripts/CleanTube.user.js"), "utf8");
  assert.equal(output, fs.readFileSync(path.join(__dirname, "../userscripts/CleanTube.user.js"), "utf8"));
  const dom = new JSDOM('<ytm-post-renderer id="post"></ytm-post-renderer>', {
    url: "https://youtube.com/", runScripts: "outside-only", pretendToBeVisual: true
  });
  t.after(() => dom.window.close());
  dom.window.eval(output);
  assert.equal(dom.window.document.getElementById("post").style.display, "none");
  assert.ok(dom.window.document.querySelector("style").textContent.includes("cleantube-posts-allowed"));
  assert.equal(build(root).status, 0);
  assert.equal(fs.readFileSync(path.join(root, "userscripts/CleanTube.user.js"), "utf8"), output);
});

test("build rejects access outside the supported YouTube addresses", t => {
  const root = project(t);
  const file = path.join(root, "src/Extension/manifest.json");
  const manifest = JSON.parse(fs.readFileSync(file, "utf8"));
  manifest.content_scripts[0].matches.push("https://example.com/*");
  fs.writeFileSync(file, JSON.stringify(manifest));
  const result = build(root);
  assert.notEqual(result.status, 0);
  assert.equal(fs.existsSync(path.join(root, "userscripts/CleanTube.user.js")), false);
});
