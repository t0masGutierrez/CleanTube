const assert = require("node:assert/strict");
const test = require("node:test");
const fs = require("node:fs");
const path = require("node:path");
const { JSDOM } = require("jsdom");

const scriptPath = path.join(__dirname, "../userscripts/CleanTube.user.js");
const source = fs.existsSync(scriptPath) ? fs.readFileSync(scriptPath, "utf8") : "";
const fixture = `<ytm-item-section-renderer id="feed">
  <ytm-rich-item-renderer id="short"><a href="/shorts/abc">Clip</a></ytm-rich-item-renderer>
  <ytm-rich-item-renderer id="post"><a href="/post/abc">Post</a></ytm-rich-item-renderer>
  <ytm-rich-item-renderer id="video"><a href="/watch?v=abc">Video</a></ytm-rich-item-renderer>
</ytm-item-section-renderer>`;
const tick = () => new Promise(resolve => setTimeout(resolve, 50));
function page(t, url = "https://m.youtube.com/") {
  const dom = new JSDOM(fixture, { url, runScripts: "outside-only", pretendToBeVisual: true });
  const observers = [];
  const NativeObserver = dom.window.MutationObserver;
  dom.window.MutationObserver = class extends NativeObserver {
    constructor(callback) {
      super(callback);
      observers.push(this);
    }
  };
  t.after(() => {
    for (const observer of observers) observer.disconnect();
    dom.window.close();
  });
  return dom.window;
}
function hidden(win, id) {
  return win.document.getElementById(id).style.display === "none";
}

test("install file declares only the three YouTube sites and early content execution", () => {
  assert.ok(source.startsWith("// ==UserScript=="), "installable userscript is missing");
  assert.deepEqual([...source.matchAll(/^\/\/ @match\s+(.+)$/gm)].map(match => match[1]), [
    "https://youtube.com/*", "https://www.youtube.com/*", "https://m.youtube.com/*"
  ]);
  assert.match(source, /@run-at\s+document-start/);
  assert.match(source, /@inject-into\s+content/);
});

test("standalone script hides Shorts and posts but keeps regular videos and feed visible", async t => {
  const win = page(t);
  win.eval(source);
  await tick();
  assert.equal(hidden(win, "short"), true);
  assert.equal(hidden(win, "post"), true);
  assert.equal(hidden(win, "video"), false);
  assert.equal(hidden(win, "feed"), false);
  assert.ok(win.document.querySelector("style[data-cleantube-userscript]"));
});

test("script handles new cards and cards changed into Shorts after page load", async t => {
  const win = page(t);
  win.eval(source);
  await tick();
  win.document.body.insertAdjacentHTML("beforeend", '<ytm-post-renderer id="late">New post</ytm-post-renderer>');
  win.document.querySelector("#video a").setAttribute("href", "/shorts/changed");
  await tick();
  assert.equal(hidden(win, "late"), true);
  assert.equal(hidden(win, "video"), true);
});

test("script can start before the page root exists and does not install twice", async t => {
  const win = page(t);
  win.document.documentElement.remove();
  win.eval(source);
  const html = win.document.createElement("html");
  html.innerHTML = `<head></head><body>${fixture}</body>`;
  win.document.appendChild(html);
  await tick();
  win.eval(source);
  await tick();
  assert.equal(hidden(win, "post"), true);
  assert.equal(win.document.querySelectorAll("style[data-cleantube-userscript]").length, 1);
});

test("script leaves other websites unchanged", async t => {
  const win = page(t, "https://example.com/");
  win.eval(source);
  await tick();
  assert.equal(hidden(win, "short"), false);
  assert.equal(hidden(win, "post"), false);
  assert.equal(win.document.querySelector("style[data-cleantube-userscript]"), null);
});

test("reused cards become visible and keep their original display and accessibility state", async t => {
  const win = page(t);
  const card = win.document.getElementById("short");
  card.style.setProperty("display", "flex", "important");
  card.setAttribute("aria-hidden", "false");
  win.eval(source);
  await tick();
  card.querySelector("a").href = "/watch?v=reused";
  await tick();
  assert.equal(card.style.display, "flex");
  assert.equal(card.style.getPropertyPriority("display"), "important");
  assert.equal(card.getAttribute("aria-hidden"), "false");
});

test("a changed card does not scan the complete document", async t => {
  const win = page(t);
  win.eval(source);
  await tick();
  let scans = 0;
  const query = win.document.querySelectorAll.bind(win.document);
  win.document.querySelectorAll = (...args) => { scans++; return query(...args); };
  win.document.querySelector("#video a").href = "/shorts/changed";
  await tick();
  assert.equal(hidden(win, "video"), true);
  assert.equal(scans, 0);
});

test("new standalone links and containers are checked, including their root", async t => {
  const win = page(t);
  win.eval(source);
  await tick();
  win.document.body.insertAdjacentHTML("beforeend", '<a id="single" href="/shorts/one">Clip</a><div id="container" is-post></div>');
  await tick();
  assert.equal(hidden(win, "single"), true);
  assert.equal(hidden(win, "container"), true);
  win.document.getElementById("container").removeAttribute("is-post");
  await tick();
  assert.equal(hidden(win, "container"), false);
});

test("normal video titles that start with Shorts stay visible", async t => {
  const win = page(t);
  win.document.querySelector("#video a").textContent = "Shorts explained in a full video";
  win.eval(source);
  await tick();
  assert.equal(hidden(win, "video"), false);
});

for (const [blockShorts, blockPosts] of [[true, false], [false, true], [false, false]]) {
  test(`independent settings: Shorts=${blockShorts}, posts=${blockPosts}`, async t => {
    const win = page(t);
    win.eval(source.replace("blockShorts: true, blockPosts: true", `blockShorts: ${blockShorts}, blockPosts: ${blockPosts}`));
    await tick();
    assert.equal(hidden(win, "short"), blockShorts);
    assert.equal(hidden(win, "post"), blockPosts);
    assert.equal(hidden(win, "video"), false);
  });
}

test("text changes, removed links, and page navigation recheck affected content", async t => {
  const win = page(t);
  win.document.body.insertAdjacentHTML("beforeend", '<ytm-pivot-bar-item-renderer id="tab"><span>Home</span></ytm-pivot-bar-item-renderer>');
  win.eval(source);
  await tick();
  win.document.querySelector("#tab span").firstChild.data = "Shorts";
  win.document.querySelector("#short a").remove();
  await tick();
  assert.equal(hidden(win, "tab"), true);
  assert.equal(hidden(win, "short"), false);
  win.history.pushState({}, "", "/feed/subscriptions");
  win.dispatchEvent(new win.Event("yt-navigate-finish"));
  await tick();
  assert.equal(hidden(win, "post"), true);
  assert.equal(hidden(win, "video"), false);
});

test("text changes inside a nested navigation item recheck the whole tab", async t => {
  const win = page(t);
  win.document.body.insertAdjacentHTML("beforeend", '<ytm-pivot-bar-item-renderer id="nested-tab"><li>Home</li></ytm-pivot-bar-item-renderer>');
  win.eval(source);
  await tick();
  const text = win.document.querySelector("#nested-tab li").firstChild;
  text.data = "Shorts";
  await tick();
  assert.equal(hidden(win, "nested-tab"), true);
  text.data = "Home";
  await tick();
  assert.equal(hidden(win, "nested-tab"), false);
});
