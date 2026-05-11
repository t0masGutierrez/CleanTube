const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const { JSDOM } = require("jsdom");

function readExtensionFile(fileName) {
  return fs.readFileSync(path.join(__dirname, "..", "src", "Extension", fileName), "utf8");
}

test("popup exposes exactly Hide shorts and Hide posts toggles", () => {
  const page = new JSDOM(readExtensionFile("popup.html"));
  const labels = Array.from(page.window.document.querySelectorAll("label")).map(label => ({
    id: label.querySelector("input")?.id,
    text: label.querySelector("span")?.textContent
  }));

  assert.deepEqual(labels, [
    { id: "blockShorts", text: "Hide shorts" },
    { id: "blockPosts", text: "Hide posts" }
  ]);
});

test("popup defaults to hiding Shorts while showing community posts", () => {
  const page = new JSDOM(readExtensionFile("popup.html"), { runScripts: "outside-only" });

  page.window.eval(readExtensionFile("core.js"));
  page.window.eval(readExtensionFile("popup.js"));

  assert.equal(page.window.document.querySelector("#blockShorts").checked, true);
  assert.equal(page.window.document.querySelector("#blockPosts").checked, false);
});
