(function cleanTubeContentScript() {
  "use strict";

  const core = globalThis.CleanTubeCore;
  if (!core || window.__cleantubeStarted) {
    return;
  }
  window.__cleantubeStarted = true;

  const storage = (globalThis.browser && browser.storage) || (globalThis.chrome && chrome.storage);
  let settings = core.mergeSettings();
  let scheduled = false;
  let observer = null;
  let burstTimer = null;

  function apply(reason) {
    scheduled = false;
    core.redirectShortsLocation(window, settings);
    core.processDocument(document, settings);
  }

  function schedule(reason) {
    if (scheduled) {
      return;
    }
    scheduled = true;
    const run = function runScheduledApply() {
      apply(reason);
    };
    if (typeof requestAnimationFrame === "function") {
      requestAnimationFrame(run);
    } else {
      setTimeout(run, 16);
    }
  }

  function startObserver() {
    if (observer || !document.documentElement || typeof MutationObserver !== "function") {
      return;
    }
    observer = new MutationObserver(function handleMutations(mutations) {
      for (const mutation of mutations) {
        if (mutation.addedNodes && mutation.addedNodes.length) {
          schedule("mutation");
          return;
        }
      }
    });
    observer.observe(document.documentElement, {
      childList: true,
      subtree: true
    });
  }

  function runStartupBurst() {
    // YouTube hydrates feeds and bottom navigation after first paint, especially
    // on iOS Safari. A short burst catches those late nodes without polling forever.
    let remaining = 24;
    clearInterval(burstTimer);
    burstTimer = setInterval(function runBurstPass() {
      schedule("startup-burst");
      remaining -= 1;
      if (remaining <= 0) {
        clearInterval(burstTimer);
      }
    }, 500);
  }

  function readStoredSettings() {
    if (!storage || !storage.local || typeof storage.local.get !== "function") {
      schedule("default-settings");
      return;
    }

    try {
      const result = storage.local.get(core.DEFAULT_SETTINGS);
      if (result && typeof result.then === "function") {
        result.then(function applyStoredSettings(value) {
          settings = core.mergeSettings(value);
          schedule("stored-settings");
        }).catch(function ignoreStorageError() {
          schedule("storage-error");
        });
        return;
      }

      storage.local.get(core.DEFAULT_SETTINGS, function applyStoredSettings(value) {
        settings = core.mergeSettings(value);
        schedule("stored-settings");
      });
    } catch (error) {
      schedule("storage-exception");
    }
  }

  function watchStorage() {
    if (!storage || !storage.onChanged || typeof storage.onChanged.addListener !== "function") {
      return;
    }
    storage.onChanged.addListener(function handleStorageChange(changes, areaName) {
      if (areaName && areaName !== "local") {
        return;
      }
      const next = {};
      for (const key of Object.keys(core.DEFAULT_SETTINGS)) {
        if (changes[key]) {
          next[key] = changes[key].newValue;
        }
      }
      settings = core.mergeSettings(Object.assign({}, settings, next));
      if (!settings.blockShorts || !settings.blockPosts) {
        core.revealCleanTubeHidden(document);
      }
      schedule("settings-changed");
    });
  }

  function installNavigationHooks() {
    window.addEventListener("yt-navigate-start", function onNavigateStart() {
      schedule("yt-navigate-start");
    }, true);
    window.addEventListener("yt-navigate-finish", function onNavigateFinish() {
      schedule("yt-navigate-finish");
      runStartupBurst();
    }, true);
    window.addEventListener("popstate", function onPopstate() {
      schedule("popstate");
      runStartupBurst();
    }, true);
    document.addEventListener("visibilitychange", function onVisibilityChange() {
      if (!document.hidden) {
        schedule("visible");
      }
    }, true);
    document.addEventListener("fullscreenchange", function onFullscreenChange() {
      schedule("fullscreenchange");
    }, true);
  }

  readStoredSettings();
  watchStorage();
  installNavigationHooks();
  startObserver();
  runStartupBurst();

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", function onReady() {
      schedule("domcontentloaded");
    }, { once: true });
  } else {
    schedule("already-ready");
  }
})();
