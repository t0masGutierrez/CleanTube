const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const puppeteer = require("puppeteer-core");

const source = fs.readFileSync(path.join(__dirname, "../userscripts/CleanTube.user.js"), "utf8");
const fixture = `<!doctype html><html><head><title>CleanTube test</title></head><body>
  <ytm-item-section-renderer id="feed">
    <ytm-rich-item-renderer id="short"><a href="/shorts/one">Clip</a></ytm-rich-item-renderer>
    <ytm-rich-item-renderer id="post"><a href="/post/one">Post</a></ytm-rich-item-renderer>
    <ytm-rich-item-renderer id="video"><a href="/watch?v=one" title="Shorts">Shorts explained in a full video</a></ytm-rich-item-renderer>
  </ytm-item-section-renderer>
  <ytm-pivot-bar-item-renderer id="css-tab"><span class="pivot-shorts"></span></ytm-pivot-bar-item-renderer>
</body></html>`;

async function main() {
  const browser = await puppeteer.launch({
    executablePath: process.env.CHROME_PATH || "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
    headless: true
  });
  try {
    async function createPage(code) {
      const page = await browser.newPage();
      await page.setRequestInterception(true);
      page.on("request", request => request.respond({ contentType: "text/html", body: fixture }));
      const session = await page.createCDPSession();
      await session.send("Page.enable");
      // Userscripts runs in a separate script context but shares the page document.
      await session.send("Page.addScriptToEvaluateOnNewDocument", {
        source: code, worldName: "CleanTubeUserscript"
      });
      return page;
    }
    const page = await createPage(source);
    const errors = [];
    page.on("pageerror", error => errors.push(error.message));
    await page.goto("https://m.youtube.com/");
    await page.waitForFunction(() => document.querySelector("#post").style.display === "none");
    const displays = await page.evaluate(() => Object.fromEntries(
      ["short", "post", "video", "feed", "css-tab"].map(id => [id, getComputedStyle(document.getElementById(id)).display])
    ));
    for (const id of ["short", "post", "css-tab"]) assert.equal(displays[id], "none", id);
    for (const id of ["video", "feed"]) assert.notEqual(displays[id], "none", id);
    assert.notEqual(await page.$eval("#video a", element => getComputedStyle(element).display), "none");

    await page.evaluate(() => {
      document.body.insertAdjacentHTML("beforeend", '<ytm-post-renderer id="late">Post</ytm-post-renderer>');
      document.querySelector("#video a").href = "/shorts/changed";
    });
    await page.waitForFunction(() => document.querySelector("#late").style.display === "none" &&
      document.querySelector("#video").style.display === "none");
    await page.evaluate(() => {
      document.querySelector("#video a").href = "/watch?v=reused";
      document.querySelector("#post a").remove();
    });
    await page.waitForFunction(() => ["video", "post"].every(id =>
      getComputedStyle(document.getElementById(id)).display !== "none"));
    await page.evaluate(() => {
      history.pushState({}, "", "/feed/subscriptions");
      window.dispatchEvent(new Event("yt-navigate-finish"));
      document.body.insertAdjacentHTML("beforeend", '<a id="new-short" href="/shorts/late">Clip</a>');
    });
    await page.waitForFunction(() => getComputedStyle(document.getElementById("new-short")).display === "none");
    console.log("PASS: initial and new content, reused cards, removed links, navigation, CSS, normal video titles.");

    await page.goto("https://m.youtube.com/shorts/direct");
    await page.waitForFunction(() => location.pathname === "/feed/subscriptions" && !!document.querySelector("#video"));
    await page.evaluate(() => {
      history.pushState({}, "", "/shorts/in-page");
      window.dispatchEvent(new Event("yt-navigate-finish"));
    });
    await page.waitForFunction(() => location.pathname === "/feed/subscriptions");
    console.log("PASS: direct and in-page Shorts links load the subscriptions page.");

    const disabled = await createPage(source.replace(
      "Object.freeze({ blockShorts: true, blockPosts: true })",
      "Object.freeze({ blockShorts: false, blockPosts: false })"
    ));
    await disabled.goto("https://www.youtube.com/shorts/allowed");
    await disabled.waitForFunction(() => !!document.querySelector("style[data-cleantube-userscript]"));
    assert.equal(new URL(disabled.url()).pathname, "/shorts/allowed");
    const allowed = await disabled.evaluate(() => ["short", "post", "css-tab"].every(id =>
      getComputedStyle(document.getElementById(id)).display !== "none"));
    assert.equal(allowed, true);
    for (const [shorts, posts] of [[true, false], [false, true]]) {
      const mixed = await createPage(source.replace(
        "blockShorts: true, blockPosts: true", `blockShorts: ${shorts}, blockPosts: ${posts}`
      ));
      await mixed.goto("https://youtube.com/");
      await mixed.waitForFunction(() => !!document.querySelector("style[data-cleantube-userscript]"));
      assert.deepEqual(await mixed.evaluate(() => ["short", "post"].map(id =>
        getComputedStyle(document.getElementById(id)).display === "none")), [shorts, posts]);
      await mixed.close();
    }
    const other = await createPage(source);
    for (const url of ["https://example.com/", "http://m.youtube.com/", "https://youtube.com.example.com/"]) {
      await other.goto(url);
      assert.equal(await other.evaluate(() => !!document.querySelector("style[data-cleantube-userscript]")), false);
    }
    assert.deepEqual(errors, []);
    console.log("PASS: blocking can be disabled with the script settings.");
  } finally {
    await browser.close();
  }
}

main().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
