/**
 * make-singlefile.mjs — assemble a fully self-contained, double-clickable
 * Lexigraph.html from a normal Vite build.
 *
 * Why this exists: under file:// Chrome blocks (a) fetch() of local files and
 * (b) Worker() from local files. So both the ECDICT dictionary and the pdf.js
 * worker must be embedded. We inline JS+CSS into the HTML and inject the dict
 * and worker as data: URLs on globalThis, which the app's loaders prefer when
 * present (see src/lib/dict/ecdict.ts and src/lib/pdf/pdfjs-loader.ts).
 *
 * Usage: node scripts/make-singlefile.mjs <distDir> <outFile>
 */
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const distDir = process.argv[2] || "dist";
const outFile = process.argv[3] || "Lexigraph.html";

const html = readFileSync(join(distDir, "index.html"), "utf8");

// --- locate emitted entry assets from index.html ---
const jsMatch = html.match(/<script[^>]+src="\.?\/?(assets\/[^"]+\.js)"/);
const cssMatch = html.match(/<link[^>]+href="\.?\/?(assets\/[^"]+\.css)"/);
if (!jsMatch) throw new Error("entry JS not found in index.html");
if (!cssMatch) throw new Error("entry CSS not found in index.html");

const js = readFileSync(join(distDir, jsMatch[1]), "utf8");
const css = readFileSync(join(distDir, cssMatch[1]), "utf8");

// --- worker: find assets/pdf.worker*.mjs ---
import { readdirSync } from "node:fs";
const workerName = readdirSync(join(distDir, "assets")).find(
  (f) => f.startsWith("pdf.worker") && f.endsWith(".mjs"),
);
if (!workerName) throw new Error("pdf worker asset not found");
const workerB64 = readFileSync(join(distDir, "assets", workerName)).toString("base64");

// --- dict gz ---
const dictB64 = readFileSync(join(distDir, "dict", "ecdict-core.json.gz")).toString("base64");

// --- favicon (optional) ---
let faviconTag = "";
try {
  const svgB64 = readFileSync(join(distDir, "icon.svg")).toString("base64");
  faviconTag = `<link rel="icon" type="image/svg+xml" href="data:image/svg+xml;base64,${svgB64}" />`;
} catch { /* no icon, skip */ }

// Escape any literal </script in inlined module code so it can't close the tag.
const safeJs = js.replace(/<\/script/gi, "<\\/script");

const out = `<!doctype html>
<html lang="zh-Hant">
  <head>
    <meta charset="UTF-8" />
    ${faviconTag}
    <meta name="theme-color" content="#0369a1" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <meta name="application-name" content="Lexigraph" />
    <title>Lexigraph — Academic PDF Reader</title>
    <style>${css}</style>
  </head>
  <body>
    <div id="root"></div>
    <script>
      window.__LEXIGRAPH_DICT_URL__ = "data:application/gzip;base64,${dictB64}";
      window.__LEXIGRAPH_PDF_WORKER_URL__ = "data:text/javascript;base64,${workerB64}";
    </script>
    <script type="module">${safeJs}</script>
  </body>
</html>
`;

writeFileSync(outFile, out);
const mb = (Buffer.byteLength(out) / 1048576).toFixed(1);
console.log(`wrote ${outFile} (${mb} MB)`);
console.log(`  entry js : ${jsMatch[1]}`);
console.log(`  entry css: ${cssMatch[1]}`);
console.log(`  worker   : assets/${workerName}`);
