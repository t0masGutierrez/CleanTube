const assert = require("node:assert/strict");
const test = require("node:test");
const { JSDOM } = require("jsdom");
const core = require("../src/Extension/core.js");

function dom(html, url = "https://www.youtube.com/") {
  return new JSDOM(html, {
    url,
    pretendToBeVisual: true
  });
}

test("detects Shorts URLs without flagging normal videos", () => {
  assert.equal(core.isShortsUrl("/shorts/abc123", "https://www.youtube.com/"), true);
  assert.equal(core.isShortsUrl("https://m.youtube.com/shorts/abc123"), true);
  assert.equal(core.isShortsUrl("/watch?v=abc123", "https://www.youtube.com/"), false);
  assert.equal(core.isShortsUrl("/feed/subscriptions", "https://www.youtube.com/"), false);
});

test("hides desktop Shorts navigation and recommendation cards", () => {
  const page = dom(`
    <html><body>
      <ytd-guide-entry-renderer id="guide"><a title="Shorts" href="/shorts">Shorts</a></ytd-guide-entry-renderer>
      <ytd-rich-item-renderer id="short-card"><a href="/shorts/abc">Short</a></ytd-rich-item-renderer>
      <ytd-rich-item-renderer id="video-card"><a href="/watch?v=ok">Regular video</a></ytd-rich-item-renderer>
      <ytd-reel-shelf-renderer id="shelf"></ytd-reel-shelf-renderer>
    </body></html>
  `);

  const stats = core.processDocument(page.window.document, core.DEFAULT_SETTINGS);

  assert.equal(page.window.document.querySelector("#guide").dataset.cleantubeHidden, "shorts-link");
  assert.equal(page.window.document.querySelector("#short-card").dataset.cleantubeHidden, "shorts-link");
  assert.equal(page.window.document.querySelector("#shelf").dataset.cleantubeHidden, "shorts-container");
  assert.equal(page.window.document.querySelector("#video-card").dataset.cleantubeHidden, undefined);
  assert.equal(stats.shortsHidden, 3);
});

test("hides mobile bottom Shorts tab and mobile Shorts shelves", () => {
  const page = dom(`
    <html><body>
      <ytm-pivot-bar-item-renderer id="home"><a href="/">Home</a></ytm-pivot-bar-item-renderer>
      <ytm-pivot-bar-item-renderer id="shorts"><a href="/shorts">Shorts</a></ytm-pivot-bar-item-renderer>
      <ytm-pivot-bar-item-renderer id="shorts-fe" tab-identifier="FEshorts">Shorts</ytm-pivot-bar-item-renderer>
      <ytm-pivot-bar-item-renderer id="shorts-endpoint" endpoint='{"browseEndpoint":{"browseId":"FEshorts"}}'>Shorts</ytm-pivot-bar-item-renderer>
      <ytm-pivot-bar-item-renderer id="shorts-label" aria-label="Shorts, tab 2 of 5"></ytm-pivot-bar-item-renderer>
      <ytm-rich-section-renderer id="mobile-shelf"><a href="/shorts/abc">Short</a></ytm-rich-section-renderer>
      <ytm-video-with-context-renderer id="mobile-video"><a href="/watch?v=ok">Video</a></ytm-video-with-context-renderer>
    </body></html>
  `, "https://m.youtube.com/");

  core.processDocument(page.window.document, core.DEFAULT_SETTINGS);

  assert.equal(page.window.document.querySelector("#home").dataset.cleantubeHidden, undefined);
  assert.equal(page.window.document.querySelector("#shorts").dataset.cleantubeHidden, "shorts-link");
  assert.equal(page.window.document.querySelector("#shorts-fe").dataset.cleantubeHidden, "shorts-metadata");
  assert.equal(page.window.document.querySelector("#shorts-endpoint").dataset.cleantubeHidden, "shorts-metadata");
  assert.equal(page.window.document.querySelector("#shorts-label").dataset.cleantubeHidden, "shorts-nav");
  assert.equal(page.window.document.querySelector("#mobile-shelf").dataset.cleantubeHidden, "shorts-link");
  assert.equal(page.window.document.querySelector("#mobile-video").dataset.cleantubeHidden, undefined);
});

test("hides desktop and mobile community posts", () => {
  const page = dom(`
    <html><body>
      <ytd-backstage-post-thread-renderer id="desktop-post"></ytd-backstage-post-thread-renderer>
      <ytd-rich-item-renderer id="desktop-post-card"><a href="/post/UgkxCommunity">Community post</a></ytd-rich-item-renderer>
      <ytm-backstage-post-renderer id="mobile-post"></ytm-backstage-post-renderer>
      <ytm-rich-item-renderer id="mobile-post-card"><a href="/post/UgkxMobile">Community post</a></ytm-rich-item-renderer>
      <ytm-rich-item-renderer id="metadata-post" data-yt-endpoint='{"urlEndpoint":{"url":"/post/UgkxMetadata"}}'></ytm-rich-item-renderer>
      <ytd-rich-item-renderer id="video-card"><a href="/watch?v=ok">Regular video</a></ytd-rich-item-renderer>
    </body></html>
  `);

  const stats = core.processDocument(page.window.document, core.DEFAULT_SETTINGS);

  assert.equal(page.window.document.querySelector("#desktop-post").dataset.cleantubeHidden, "community-post");
  assert.equal(page.window.document.querySelector("#desktop-post-card").dataset.cleantubeHidden, "community-link");
  assert.equal(page.window.document.querySelector("#mobile-post").dataset.cleantubeHidden, "community-post");
  assert.equal(page.window.document.querySelector("#mobile-post-card").dataset.cleantubeHidden, "community-link");
  assert.equal(page.window.document.querySelector("#metadata-post").dataset.cleantubeHidden, "community-metadata");
  assert.equal(page.window.document.querySelector("#video-card").dataset.cleantubeHidden, undefined);
  assert.equal(stats.communityHidden, 5);
});

test("redirects Shorts pages to subscriptions", () => {
  const page = dom("<html><body></body></html>", "https://m.youtube.com/shorts/abc");
  let eventFired = false;
  page.window.addEventListener("cleantube-redirected", () => {
    eventFired = true;
  });

  const redirected = core.redirectShortsLocation(page.window, core.DEFAULT_SETTINGS);

  assert.equal(redirected, true);
  assert.equal(page.window.location.pathname, "/feed/subscriptions");
  assert.equal(eventFired, true);
});

test("respects disabled settings", () => {
  const page = dom(`
    <html><body>
      <ytd-rich-item-renderer id="short-card"><a href="/shorts/abc">Short</a></ytd-rich-item-renderer>
      <ytd-backstage-post-thread-renderer id="community-post"></ytd-backstage-post-thread-renderer>
    </body></html>
  `);

  const stats = core.processDocument(page.window.document, { enabled: false });

  assert.equal(page.window.document.querySelector("#short-card").dataset.cleantubeHidden, undefined);
  assert.equal(page.window.document.querySelector("#community-post").dataset.cleantubeHidden, undefined);
  assert.deepEqual(stats, {
    shortsHidden: 0,
    communityHidden: 0
  });
});
