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
