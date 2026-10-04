#!/usr/bin/env node
/**
 * Click rate by listing-test arm, from a Search Console Pages export.
 *
 *   node scripts/seo/ctr-by-arm.mjs docs/seo/baseline-2026-10/pages-3m.csv
 *
 * Joins the export's "Top pages" URLs to docs/seo/listing-arms-2026-10.csv by
 * slug and prints pages, clicks, impressions and clicks per impression for
 * each arm. Place pages missing from the export (no impressions in the window,
 * or past the export's 1,000-row cap) count as zero and are reported.
 * Decide on clicks per impression, not clicks (docs/seo/README.md).
 */
import fs from "node:fs";
import path from "node:path";

const exportPath = process.argv[2];
if (!exportPath) {
  console.error("usage: node scripts/seo/ctr-by-arm.mjs <Pages.csv>");
  process.exit(1);
}

function parseCsv(text) {
  const rows = [];
  for (const line of text.trim().split(/\r?\n/)) {
    const cells = [];
    let cur = "", quoted = false;
    for (const ch of line) {
      if (ch === '"') quoted = !quoted;
      else if (ch === "," && !quoted) { cells.push(cur); cur = ""; }
      else cur += ch;
    }
    cells.push(cur);
    rows.push(cells);
  }
  return rows;
}

const armsCsv = path.resolve(path.dirname(new URL(import.meta.url).pathname), "../../docs/seo/listing-arms-2026-10.csv");
const [armHeader, ...armRows] = parseCsv(fs.readFileSync(armsCsv, "utf8"));
const slugIdx = armHeader.indexOf("slug");
const armIdx = armHeader.indexOf("arm");
const armBySlug = new Map(armRows.map((r) => [r[slugIdx], r[armIdx]]));

const [, ...pageRows] = parseCsv(fs.readFileSync(exportPath, "utf8"));
const totals = new Map([...new Set(armBySlug.values())].map((a) => [a, { pages: 0, seen: 0, clicks: 0, impressions: 0 }]));
for (const a of armBySlug.values()) totals.get(a).pages += 1;

for (const [url, clicks, impressions] of pageRows) {
  const m = url.match(/^https:\/\/ukdemographics\.co\.uk\/places\/([^/]+)\/$/);
  if (!m || m[1] === "regions") continue;
  const arm = armBySlug.get(m[1]);
  if (!arm) continue;
  const t = totals.get(arm);
  t.seen += 1;
  t.clicks += Number(clicks);
  t.impressions += Number(impressions);
}

console.log(`Export: ${exportPath}`);
console.log("arm      pages  in export  clicks  impressions  clicks/impression");
for (const [arm, t] of [...totals].sort()) {
  const rate = t.impressions ? (100 * t.clicks / t.impressions).toFixed(3) + "%" : "n/a";
  console.log(`${arm.padEnd(8)} ${String(t.pages).padStart(5)}  ${String(t.seen).padStart(9)}  ${String(t.clicks).padStart(6)}  ${String(t.impressions).padStart(11)}  ${rate.padStart(17)}`);
}
