(function cleanTubePopup() {
  "use strict";

  const core = globalThis.CleanTubeCore;
  const storage = (globalThis.browser && browser.storage) || (globalThis.chrome && chrome.storage);
  const ids = ["enabled", "blockShorts", "redirectShorts"];

  function setControls(values) {
    const settings = core.mergeSettings(values);
    for (const id of ids) {
      const control = document.getElementById(id);
      if (control) {
        control.checked = Boolean(settings[id]);
      }
    }
  }

  function persist() {
    const next = {};
    for (const id of ids) {
      const control = document.getElementById(id);
      next[id] = Boolean(control && control.checked);
    }
    if (storage && storage.local && typeof storage.local.set === "function") {
      storage.local.set(next);
    }
  }

  function load() {
    setControls(core.DEFAULT_SETTINGS);
    if (!storage || !storage.local || typeof storage.local.get !== "function") {
      return;
    }
    const result = storage.local.get(core.DEFAULT_SETTINGS);
    if (result && typeof result.then === "function") {
      result.then(setControls).catch(function ignoreStorageError() {});
    } else {
      storage.local.get(core.DEFAULT_SETTINGS, setControls);
    }
  }

  for (const id of ids) {
    const control = document.getElementById(id);
    if (control) {
      control.addEventListener("change", persist);
    }
  }

  load();
})();
