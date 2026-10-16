// Compare scripts with the same local feed. This measures script work, not Safari.
const fs = require("node:fs");
const { JSDOM } = require("jsdom");
const { performance } = require("node:perf_hooks");

async function measure(file) {
  const dom = new JSDOM(`<body>${'<ytm-rich-item-renderer><a href="/watch?v=one">Video</a></ytm-rich-item-renderer>'.repeat(500)}</body>`, {
    url: "https://m.youtube.com/", runScripts: "outside-only"
  });
  const win = dom.window;
  const frames = [];
  win.requestAnimationFrame = callback => frames.push(callback);
  let scans = 0;
  let documentScans = 0;
  let matches = 0;
  let elapsed = 0;
  for (const prototype of [win.Document.prototype, win.Element.prototype]) {
    const query = prototype.querySelectorAll;
    prototype.querySelectorAll = function (selector) {
      const result = query.call(this, selector);
      scans++;
      if (this.nodeType === 9) documentScans++;
      matches += result.length;
      return result;
    };
  }
  async function flush() {
    await new Promise(resolve => setImmediate(resolve));
    while (frames.length) {
      const start = performance.now();
      frames.shift()();
      elapsed += performance.now() - start;
      await Promise.resolve();
    }
  }
  win.eval(fs.readFileSync(file, "utf8"));
  await flush();
  documentScans = scans = matches = elapsed = 0;
  const link = win.document.querySelector("a");
  for (let index = 0; index < 20; index++) {
    link.href = `/watch?v=${index}`;
    await flush();
  }
  console.log(JSON.stringify({ file, cards: 500, changes: 20, documentScans, scans, matches, scriptMs: +elapsed.toFixed(2) }));
  win.close();
}
(async () => {
  for (const file of process.argv.slice(2).length ? process.argv.slice(2) : ["userscripts/CleanTube.user.js"]) await measure(file);
})().catch(error => { console.error(error); process.exitCode = 1; });
