const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const read = file => fs.readFileSync(path.join(root, file), "utf8");
const manifest = JSON.parse(read("src/Extension/manifest.json"));
const hosts = ["youtube.com", "www.youtube.com", "m.youtube.com"];
const matches = hosts.map(host => `https://${host}/*`);
const configuredMatches = manifest.content_scripts[0].matches;
if (JSON.stringify([...configuredMatches].sort()) !== JSON.stringify([...matches].sort())) {
  throw new Error("Userscript access must stay limited to the three supported YouTube addresses.");
}
const header = [
  "// ==UserScript==",
  "// @name         CleanTube",
  "// @description  Hide YouTube Shorts and community posts in Safari.",
  `// @version      ${manifest.version}`,
  ...matches.map(match => `// @match        ${match}`),
  "// @run-at       document-start",
  "// @inject-into  content",
  "// @grant        none",
  "// ==/UserScript=="
].join("\n");

const output = `${header}

// Change either value to false to allow that content. Then reload YouTube.
// To stop all blocking, turn off CleanTube in Userscripts and reload YouTube.
(function cleanTubeUserscript() {
  "use strict";
  const settings = Object.freeze({ blockShorts: true, blockPosts: true });
  if (location.protocol !== "https:" ||
      !${JSON.stringify(hosts)}.includes(location.hostname)) return;
  if (window.__cleanTubeUserscriptStarted) return;
  window.__cleanTubeUserscriptStarted = true;

  // Keep the shared blocking code inside this script.
  const coreScope = {};
  (function loadCore(globalThis) {
${read("src/Extension/core.js")}
  })(coreScope);
  const core = coreScope.CleanTubeCore;
  const styles = ${JSON.stringify(read("src/Extension/content.css"))};
${read("src/Userscript/runtime.js")}
})();
`;

const destination = path.join(root, "userscripts", "CleanTube.user.js");
fs.mkdirSync(path.dirname(destination), { recursive: true });
fs.writeFileSync(destination, output);
console.log("Created userscripts/CleanTube.user.js");
