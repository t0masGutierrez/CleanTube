// ==UserScript==
// @name         CleanTube
// @description  Hide YouTube Shorts and community posts in Safari.
// @version      0.1.0
// @match        https://youtube.com/*
// @match        https://www.youtube.com/*
// @match        https://m.youtube.com/*
// @run-at       document-start
// @inject-into  content
// @grant        none
// ==/UserScript==

// Change either value to false to allow that content. Then reload YouTube.
// To stop all blocking, turn off CleanTube in Userscripts and reload YouTube.
(function cleanTubeUserscript() {
  "use strict";
  const settings = Object.freeze({ blockShorts: true, blockPosts: true });
  if (location.protocol !== "https:" ||
      !["youtube.com","www.youtube.com","m.youtube.com"].includes(location.hostname)) return;
  if (window.__cleanTubeUserscriptStarted) return;
  window.__cleanTubeUserscriptStarted = true;

  // Keep the shared blocking code inside this script.
  const coreScope = {};
  (function loadCore(globalThis) {
(function cleanTubeCoreFactory(root) {
  "use strict";

  const DEFAULT_SETTINGS = Object.freeze({
    blockShorts: true,
    blockPosts: false
  });

  const SHORTS_REDIRECT_TARGET = "/feed/subscriptions";

  function selectorList(selectors) {
    return selectors.join(",");
  }

  // YouTube ships separate custom elements for desktop and mobile web, and
  // renames them occasionally. Keep platform selector groups together so drift
  // can be fixed in one place.
  const SHORTS_TARGET_SELECTORS = selectorList([
    "ytd-rich-section-renderer",
    "ytd-reel-shelf-renderer",
    "ytd-rich-item-renderer",
    "ytd-video-renderer",
    "ytd-compact-video-renderer",
    "ytd-grid-video-renderer",
    "ytd-guide-entry-renderer",
    "ytd-mini-guide-entry-renderer",
    "ytm-rich-section-renderer",
    "ytm-reel-shelf-renderer",
    "ytm-rich-item-renderer",
    "ytm-video-with-context-renderer",
    "ytm-pivot-bar-item-renderer",
    "ytm-shorts-lockup-view-model",
    "ytm-shorts-carousel",
    "yt-lockup-view-model",
    "ytm-item-section-renderer",
    "li",
    "tp-yt-paper-item"
  ]);

  const ENDPOINT_METADATA_ATTRIBUTES = [
    "tab-identifier",
    "endpoint",
    "data-endpoint",
    "data-yt-endpoint",
    "data-params"
  ];

  const ENDPOINT_METADATA_SELECTOR = selectorList(ENDPOINT_METADATA_ATTRIBUTES.map(function toAttributeSelector(attribute) {
    return "[" + attribute + "]";
  }));

  const SHORTS_CANDIDATE_SELECTORS = selectorList([
    "a[href]",
    "[aria-label]",
    "[title]",
    "ytm-pivot-bar-item-renderer",
    ENDPOINT_METADATA_SELECTOR
  ]);

  const SHORTS_CONTAINER_SELECTORS = selectorList([
    "ytd-reel-shelf-renderer",
    "ytd-shorts",
    "ytm-reel-shelf-renderer",
    "ytm-shorts-lockup-view-model",
    "ytm-shorts-carousel",
    "[is-shorts]",
    "[data-content-type='shorts']"
  ]);

  const POST_CANDIDATE_SELECTORS = selectorList([
    "a[href]",
    ENDPOINT_METADATA_SELECTOR
  ]);

  const POST_TARGET_SELECTORS = selectorList([
    "ytd-rich-item-renderer",
    "ytd-video-renderer",
    "ytd-compact-video-renderer",
    "ytd-grid-video-renderer",
    "ytm-rich-item-renderer",
    "ytm-video-with-context-renderer",
    "yt-lockup-view-model",
    "ytm-item-section-renderer",
    "li"
  ]);

  const POST_CONTAINER_SELECTORS = selectorList([
    "ytd-backstage-post-renderer",
    "ytd-backstage-post-thread-renderer",
    "ytd-post-renderer",
    "ytm-backstage-post-renderer",
    "ytm-post-renderer",
    "ytm-community-post-renderer",
    "[data-content-type='post']",
    "[is-post]"
  ]);

  function mergeSettings(settings) {
    const merged = {};
    const source = settings || {};
    for (const key of Object.keys(DEFAULT_SETTINGS)) {
      if (Object.prototype.hasOwnProperty.call(source, key)) {
        merged[key] = source[key];
      } else {
        merged[key] = DEFAULT_SETTINGS[key];
      }
    }
    return merged;
  }

  function getDocument(rootNode) {
    if (!rootNode) {
      return null;
    }
    if (rootNode.nodeType === 9) {
      return rootNode;
    }
    return rootNode.ownerDocument || null;
  }

  function queryAll(rootNode, selector) {
    if (!rootNode || typeof rootNode.querySelectorAll !== "function") {
      return [];
    }
    try {
      const matches = Array.from(rootNode.querySelectorAll(selector));
      if (rootNode.matches && rootNode.matches(selector)) matches.unshift(rootNode);
      return matches;
    } catch (error) {
      return [];
    }
  }

  function safeClosest(element, selector) {
    if (!element || typeof element.closest !== "function") {
      return null;
    }
    try {
      return element.closest(selector);
    } catch (error) {
      return null;
    }
  }

  function findDescendantHref(element) {
    if (!element || element.localName !== "ytm-pivot-bar-item-renderer" || typeof element.querySelector !== "function") {
      return "";
    }
    try {
      const anchor = element.querySelector("a[href]");
      return anchor ? anchor.getAttribute("href") || "" : "";
    } catch (error) {
      return "";
    }
  }

  function normalizePath(href, baseURI) {
    if (!href || typeof href !== "string") {
      return "";
    }
    try {
      return new URL(href, baseURI || "https://www.youtube.com/").pathname;
    } catch (error) {
      return href;
    }
  }

  function isShortsUrl(href, baseURI) {
    const path = normalizePath(href, baseURI);
    return path === "/shorts" || path.startsWith("/shorts/");
  }

  function isPostUrl(href, baseURI) {
    return normalizePath(href, baseURI).startsWith("/post/");
  }

  function textLooksLikeShorts(value) {
    return /^shorts\b/i.test(String(value || "").trim());
  }

  function metadataContainsAny(element, markers) {
    for (const attribute of ENDPOINT_METADATA_ATTRIBUTES) {
      const value = element.getAttribute(attribute);
      if (!value) {
        continue;
      }
      const normalized = value.toLowerCase();
      if (markers.some(function markerMatches(marker) {
        return normalized.includes(marker);
      })) {
        return true;
      }
    }
    return false;
  }

  function metadataLooksLikeShorts(element) {
    return metadataContainsAny(element, ["feshorts", "/shorts", "\"shorts\""]);
  }

  function metadataLooksLikePost(element) {
    return metadataContainsAny(element, ["/post/", "backstagepost", "communitypost"]);
  }

  const originalState = new WeakMap();

  function hideElement(element, reason) {
    if (!element || element.dataset && element.dataset.cleantubeHidden) {
      return false;
    }
    originalState.set(element, {
      display: element.style.getPropertyValue("display"),
      priority: element.style.getPropertyPriority("display"),
      ariaHidden: element.getAttribute("aria-hidden")
    });
    if (element.dataset) {
      element.dataset.cleantubeHidden = reason || "hidden";
    } else {
      element.setAttribute("data-cleantube-hidden", reason || "hidden");
    }
    if (element.style && typeof element.style.setProperty === "function") {
      element.style.setProperty("display", "none", "important");
    }
    element.setAttribute("aria-hidden", "true");
    return true;
  }

  function revealCleanTubeHidden(rootNode) {
    let count = 0;
    for (const element of queryAll(rootNode, "[data-cleantube-hidden]")) {
      element.removeAttribute("data-cleantube-hidden");
      const saved = originalState.get(element);
      if (saved && saved.ariaHidden !== null) element.setAttribute("aria-hidden", saved.ariaHidden);
      else element.removeAttribute("aria-hidden");
      if (element.style && element.style.display === "none") {
        if (saved && saved.display) element.style.setProperty("display", saved.display, saved.priority);
        else element.style.removeProperty("display");
      }
      originalState.delete(element);
      count += 1;
    }
    return count;
  }

  function findShortsRemovalTarget(anchor) {
    if (!anchor) {
      return null;
    }
    return safeClosest(anchor, SHORTS_TARGET_SELECTORS) || anchor;
  }

  function findPostRemovalTarget(anchor) {
    if (!anchor) {
      return null;
    }
    return safeClosest(anchor, POST_TARGET_SELECTORS) || anchor;
  }

  function hideContainers(rootNode, selector, reason) {
    let hidden = 0;
    for (const element of queryAll(rootNode, selector)) {
      if (hideElement(element, reason)) {
        hidden += 1;
      }
    }
    return hidden;
  }

  function hideShorts(rootNode) {
    const doc = getDocument(rootNode);
    const baseURI = doc && doc.baseURI;
    let hidden = hideContainers(rootNode, SHORTS_CONTAINER_SELECTORS, "shorts-container");

    const candidates = queryAll(rootNode, SHORTS_CANDIDATE_SELECTORS);
    for (const element of candidates) {
      const href = element.getAttribute("href") || findDescendantHref(element);
      const title = element.getAttribute("title") || "";
      const label = element.getAttribute("aria-label") || "";
      const text = element.textContent || "";
      const isShortsLink = href && isShortsUrl(href, baseURI);
      const target = findShortsRemovalTarget(element);
      const isNavigation = target && (
        target.matches("ytd-guide-entry-renderer,ytd-mini-guide-entry-renderer,ytm-pivot-bar-item-renderer,tp-yt-paper-item") ||
        target === element && !target.matches(SHORTS_TARGET_SELECTORS) && normalizePath(href, baseURI) !== "/watch"
      );
      const isShortsNav = isNavigation && (textLooksLikeShorts(title) || textLooksLikeShorts(label) || textLooksLikeShorts(text));
      const isShortsMetadata = metadataLooksLikeShorts(element);

      if (!isShortsLink && !isShortsNav && !isShortsMetadata) {
        continue;
      }

      const reason = isShortsMetadata && !isShortsLink ? "shorts-metadata" : isShortsLink ? "shorts-link" : "shorts-nav";
      if (target && hideElement(target, reason)) {
        hidden += 1;
      }
    }

    return hidden;
  }

  function hidePosts(rootNode) {
    const doc = getDocument(rootNode);
    const baseURI = doc && doc.baseURI;
    let hidden = hideContainers(rootNode, POST_CONTAINER_SELECTORS, "post-container");

    for (const element of queryAll(rootNode, POST_CANDIDATE_SELECTORS)) {
      const href = element.getAttribute("href") || "";
      const isPostLink = href && isPostUrl(href, baseURI);
      const isPostMetadata = metadataLooksLikePost(element);
      if (!isPostLink && !isPostMetadata) {
        continue;
      }

      const target = findPostRemovalTarget(element);
      const reason = isPostMetadata && !isPostLink ? "post-metadata" : "post-link";
      if (target && hideElement(target, reason)) {
        hidden += 1;
      }
    }

    return hidden;
  }

  function updateDocumentClasses(doc, settings) {
    if (!doc || !doc.documentElement) {
      return;
    }
    const merged = mergeSettings(settings);
    doc.documentElement.classList.toggle("cleantube-shorts-allowed", !merged.blockShorts);
    doc.documentElement.classList.toggle("cleantube-posts-allowed", !merged.blockPosts);
  }

  function redirectShortsLocation(win, settings) {
    const merged = mergeSettings(settings);
    if (!merged.blockShorts || !win || !win.location) {
      return false;
    }

    if (!isShortsUrl(win.location.href, win.location.href)) {
      return false;
    }

    const target = new URL(SHORTS_REDIRECT_TARGET, win.location.origin);
    if (win.location.href === target.href) {
      return false;
    }

    if (win.history && typeof win.history.replaceState === "function") {
      win.history.replaceState(null, "", target.href);
      win.dispatchEvent(new win.Event("cleantube-redirected"));
    } else {
      win.location.replace(target.href);
    }
    return true;
  }

  function processDocument(rootNode, settings) {
    const merged = mergeSettings(settings);
    const doc = getDocument(rootNode);
    updateDocumentClasses(doc, merged);

    const stats = {
      shortsHidden: 0,
      postsHidden: 0
    };

    if (merged.blockShorts) {
      stats.shortsHidden = hideShorts(rootNode);
    }

    if (merged.blockPosts) {
      stats.postsHidden = hidePosts(rootNode);
    }

    return stats;
  }

  const api = {
    DEFAULT_SETTINGS,
    mergeSettings,
    normalizePath,
    isShortsUrl,
    isPostUrl,
    textLooksLikeShorts,
    hideElement,
    revealCleanTubeHidden,
    hideShorts,
    hidePosts,
    updateDocumentClasses,
    redirectShortsLocation,
    processDocument,
    selectors: {
      SHORTS_TARGET_SELECTORS,
      SHORTS_CONTAINER_SELECTORS,
      POST_TARGET_SELECTORS,
      POST_CONTAINER_SELECTORS,
      ENDPOINT_METADATA_ATTRIBUTES
    }
  };

  root.CleanTubeCore = api;

  if (typeof module === "object" && module && module.exports) {
    module.exports = api;
  }
})(typeof globalThis !== "undefined" ? globalThis : window);

  })(coreScope);
  const core = coreScope.CleanTubeCore;
  const styles = ":root {\n  --cleantube-hidden-display: none !important;\n}\n\nhtml:not(.cleantube-shorts-allowed) ytd-mini-guide-entry-renderer[aria-label=\"Shorts\"],\nhtml:not(.cleantube-shorts-allowed) ytd-guide-entry-renderer:has(a[title=\"Shorts\"]),\nhtml:not(.cleantube-shorts-allowed) ytd-guide-entry-renderer:has(a[href^=\"/shorts\"]),\nhtml:not(.cleantube-shorts-allowed) ytd-guide-entry-renderer:has(a[href*=\"/shorts/\"]),\nhtml:not(.cleantube-shorts-allowed) ytd-rich-item-renderer:has(a[href^=\"/shorts\"]),\nhtml:not(.cleantube-shorts-allowed) ytd-rich-item-renderer:has(a[href*=\"/shorts/\"]),\nhtml:not(.cleantube-shorts-allowed) ytd-rich-section-renderer:has(a[href^=\"/shorts\"]),\nhtml:not(.cleantube-shorts-allowed) ytd-rich-section-renderer:has(a[href*=\"/shorts/\"]),\nhtml:not(.cleantube-shorts-allowed) ytd-reel-shelf-renderer,\nhtml:not(.cleantube-shorts-allowed) ytd-shorts,\nhtml:not(.cleantube-shorts-allowed) ytm-pivot-bar-item-renderer[tab-identifier*=\"shorts\" i],\nhtml:not(.cleantube-shorts-allowed) ytm-pivot-bar-item-renderer[aria-label^=\"Shorts\" i],\nhtml:not(.cleantube-shorts-allowed) ytm-pivot-bar-item-renderer[endpoint*=\"FEshorts\"],\nhtml:not(.cleantube-shorts-allowed) ytm-pivot-bar-item-renderer[data-endpoint*=\"FEshorts\"],\nhtml:not(.cleantube-shorts-allowed) ytm-pivot-bar-item-renderer[data-yt-endpoint*=\"FEshorts\"],\nhtml:not(.cleantube-shorts-allowed) ytm-pivot-bar-item-renderer[data-params*=\"FEshorts\"],\nhtml:not(.cleantube-shorts-allowed) ytm-pivot-bar-item-renderer:has(.pivot-shorts),\nhtml:not(.cleantube-shorts-allowed) ytm-pivot-bar-item-renderer:has(a[href^=\"/shorts\"]),\nhtml:not(.cleantube-shorts-allowed) ytm-pivot-bar-item-renderer:has(a[href*=\"/shorts/\"]),\nhtml:not(.cleantube-shorts-allowed) ytm-rich-item-renderer:has(a[href^=\"/shorts\"]),\nhtml:not(.cleantube-shorts-allowed) ytm-rich-item-renderer:has(a[href*=\"/shorts/\"]),\nhtml:not(.cleantube-shorts-allowed) ytm-rich-section-renderer:has(a[href^=\"/shorts\"]),\nhtml:not(.cleantube-shorts-allowed) ytm-rich-section-renderer:has(a[href*=\"/shorts/\"]),\nhtml:not(.cleantube-shorts-allowed) ytm-reel-shelf-renderer,\nhtml:not(.cleantube-shorts-allowed) ytm-shorts-lockup-view-model,\nhtml:not(.cleantube-shorts-allowed) ytm-shorts-carousel,\nhtml:not(.cleantube-shorts-allowed) a[href^=\"/shorts\"],\nhtml:not(.cleantube-shorts-allowed) a[href*=\"/shorts/\"] {\n  display: var(--cleantube-hidden-display);\n}\n\nhtml:not(.cleantube-posts-allowed) ytd-backstage-post-renderer,\nhtml:not(.cleantube-posts-allowed) ytd-backstage-post-thread-renderer,\nhtml:not(.cleantube-posts-allowed) ytd-post-renderer,\nhtml:not(.cleantube-posts-allowed) ytm-backstage-post-renderer,\nhtml:not(.cleantube-posts-allowed) ytm-post-renderer,\nhtml:not(.cleantube-posts-allowed) ytm-community-post-renderer,\nhtml:not(.cleantube-posts-allowed) ytd-rich-item-renderer:has(a[href^=\"/post/\"]),\nhtml:not(.cleantube-posts-allowed) ytd-rich-item-renderer:has(a[href*=\"/post/\"]),\nhtml:not(.cleantube-posts-allowed) ytm-rich-item-renderer:has(a[href^=\"/post/\"]),\nhtml:not(.cleantube-posts-allowed) ytm-rich-item-renderer:has(a[href*=\"/post/\"]),\nhtml:not(.cleantube-posts-allowed) ytm-rich-item-renderer[data-yt-endpoint*=\"/post/\"],\nhtml:not(.cleantube-posts-allowed) ytm-rich-item-renderer[data-endpoint*=\"/post/\"],\nhtml:not(.cleantube-posts-allowed) ytd-rich-item-renderer[data-yt-endpoint*=\"/post/\"],\nhtml:not(.cleantube-posts-allowed) ytd-rich-item-renderer[data-endpoint*=\"/post/\"],\nhtml:not(.cleantube-posts-allowed) yt-lockup-view-model:has(a[href^=\"/post/\"]),\nhtml:not(.cleantube-posts-allowed) yt-lockup-view-model:has(a[href*=\"/post/\"]),\nhtml:not(.cleantube-posts-allowed) [data-content-type=\"post\"],\nhtml:not(.cleantube-posts-allowed) [is-post] {\n  display: var(--cleantube-hidden-display);\n}\n\n[data-cleantube-hidden] {\n  display: none !important;\n}\n";
  let scheduled = false;
  let redirecting = false;
  let fullScan = true;
  const pending = new Set();
  const boundary = [
    core.selectors.SHORTS_TARGET_SELECTORS,
    core.selectors.POST_TARGET_SELECTORS,
    core.selectors.SHORTS_CONTAINER_SELECTORS,
    core.selectors.POST_CONTAINER_SELECTORS,
    "[data-cleantube-hidden]", "a[href]", "[aria-label]", "[title]",
    ...core.selectors.ENDPOINT_METADATA_ATTRIBUTES.map(attribute => `[${attribute}]`)
  ].join(",");
  const style = document.createElement("style");
  style.setAttribute("data-cleantube-userscript", "");
  style.textContent = styles;

  function apply() {
    scheduled = false;
    if (redirecting) return;
    if (settings.blockShorts && core.isShortsUrl(location.href)) {
      // Load the destination page, so the Shorts player cannot keep running.
      redirecting = true;
      location.replace(new URL("/feed/subscriptions", location.origin).href);
      return;
    }
    if (!document.documentElement) return;
    if (!style.isConnected) (document.head || document.documentElement).appendChild(style);
    const roots = fullScan ? [document] : [...pending].filter(node => {
      if (!node.isConnected) return false;
      for (let parent = node.parentElement; parent; parent = parent.parentElement) {
        if (pending.has(parent)) return false;
      }
      return true;
    });
    fullScan = false;
    pending.clear();
    for (const root of roots) {
      // YouTube can reuse a hidden card for a normal video.
      core.revealCleanTubeHidden(root);
      core.processDocument(root, settings);
    }
  }

  function schedule() {
    if (scheduled || redirecting) return;
    scheduled = true;
    requestAnimationFrame(apply);
  }

  function queue(node) {
    const element = node.nodeType === 1 ? node : node.parentElement;
    if (!element || element === style || style.contains(element)) return;
    // Mobile tabs use the text of their children, including nested list items.
    let root = element.closest("ytm-pivot-bar-item-renderer") || element.closest(boundary) || element;
    // A previous match may have hidden a larger container.
    const hiddenParent = root.parentElement && root.parentElement.closest("[data-cleantube-hidden]");
    if (hiddenParent) root = hiddenParent;
    pending.add(root);
  }

  function rescan() {
    fullScan = true;
    schedule();
  }

  // Observe the document itself: the page root may not exist at document-start.
  const observer = new MutationObserver(records => {
    for (const record of records) {
      if (record.type === "childList") {
        // Check removals within a card too: its last blocked link may be gone.
        if (record.removedNodes.length && record.target.nodeType === 1 && record.target.closest(boundary)) queue(record.target);
        for (const node of record.addedNodes) queue(node);
      } else {
        queue(record.target);
      }
    }
    if (pending.size || !style.isConnected) schedule();
  });
  observer.observe(document, {
    childList: true,
    subtree: true,
    characterData: true,
    attributes: true,
    attributeFilter: [
      "href", "title", "aria-label", ...core.selectors.ENDPOINT_METADATA_ATTRIBUTES,
      "is-shorts", "is-post", "data-content-type"
    ]
  });
  for (const event of ["yt-navigate-start", "yt-navigate-finish", "popstate", "pageshow"]) {
    window.addEventListener(event, rescan, true);
  }
  document.addEventListener("DOMContentLoaded", rescan, { once: true });
  document.addEventListener("visibilitychange", () => {
    if (!document.hidden) rescan();
  });
  apply();

})();
