/**
 * Page weight the map block adds to each place page (maps plan issue I2): the gzipped
 * bytes between the <!-- place-map --> and <!-- /place-map --> markers in every built
 * place page, which is everything the block puts on the page (SVG, tables, bars). The
 * switcher script is a separate cached file, public/scripts/place-map.js, under 5 KB.
 *
 * Fails when any page adds more than 30 KB gzipped. Run after `npm run build`.
 *
 *   node scripts/check/place-map-weight.mjs [--dist dist]
 */
import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { gzipSync } from "node:zlib";

const i = process.argv.indexOf("--dist");
const DIST = path.resolve(i >= 0 ? process.argv[i + 1] : "dist");
const BUDGET = 30 * 1024;
const dir = path.join(DIST, "places");
const rows = [];
for (const slug of readdirSync(dir)) {
  const file = path.join(dir, slug, "index.html");
  try { if (!statSync(file).isFile()) continue; } catch { continue; }
  const html = readFileSync(file, "utf8");
  const a = html.indexOf("<!-- place-map"), b = html.indexOf("<!-- /place-map -->");
  if (a < 0) continue;
  if (b < a) throw new Error(`${slug}: unclosed place-map block`);
  const block = html.slice(a, b);
  rows.push({ slug, raw: block.length, gz: gzipSync(block).length });
}
if (rows.length === 0) throw new Error(`no place pages with a map block in ${dir}`);
rows.sort((p, q) => p.gz - q.gz);
const at = (q) => rows[Math.min(rows.length - 1, Math.floor(q * rows.length))];
const kb = (n) => `${(n / 1024).toFixed(1)} KB`;
console.log(`Map block on ${rows.length} place pages, gzipped: median ${kb(at(0.5).gz)}, p90 ${kb(at(0.9).gz)}, max ${kb(rows.at(-1).gz)} (${rows.at(-1).slug}); raw median ${kb(at(0.5).raw)}, max ${kb(Math.max(...rows.map((r) => r.raw)))}`);
const over = rows.filter((r) => r.gz > BUDGET);
if (over.length) {
  console.error(`Over the ${kb(BUDGET)} budget: ${over.map((r) => `${r.slug} ${kb(r.gz)}`).join(", ")}`);
  process.exit(1);
}
