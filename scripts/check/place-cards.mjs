/**
 * Share cards on place pages, checked over the built site (maps plan Stage 3, issues I6,
 * I7 and I20). Run after `BUILD_OG=1 npm run build`.
 *
 * For every place page:
 * - og:image is the population card, a palette PNG of 1200 by 630 in dist/;
 * - its og:image:alt is the card's own alt text, and the focus council's value in it is
 *   the change the page's population table prints for that council (card for card);
 * - each "Download this card" link is a palette PNG of 1080 by 1350 in dist/, and each
 *   card image on the page is a WebP in dist/.
 * Then dist/ must be under 600 MB. Prints the asset counts and mean sizes.
 *
 *   node scripts/check/place-cards.mjs [--dist dist]
 */
import { readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";

const i = process.argv.indexOf("--dist");
const DIST = path.resolve(i >= 0 ? process.argv[i + 1] : "dist");
const DIST_BUDGET = 600 * 1024 * 1024;
const SITE = "https://ukdemographics.co.uk";

const decode = (s) => s.replace(/&amp;/g, "&").replace(/&#39;|&#x27;/g, "'").replace(/&quot;/g, '"').replace(/&lt;/g, "<").replace(/&gt;/g, ">");
const meta = (html, prop) => {
  const m = html.match(new RegExp(`<meta property="${prop}" content="([^"]*)"`));
  return m ? decode(m[1]) : null;
};
const fileFor = (url) => path.join(DIST, decodeURIComponent(url.replace(SITE, "")));

function png(file) {
  const b = readFileSync(file);
  if (b.subarray(1, 4).toString("latin1") !== "PNG") return { error: "not a PNG" };
  return { w: b.readUInt32BE(16), h: b.readUInt32BE(20), type: b[25], bytes: b.length };
}

const errors = [];
const sizes = { og: [], portrait: [], webp: [] };
let pages = 0;
const dir = path.join(DIST, "places");
for (const slug of readdirSync(dir)) {
  const page = path.join(dir, slug, "index.html");
  try { if (!statSync(page).isFile()) continue; } catch { continue; }
  const html = readFileSync(page, "utf8");
  if (!html.includes("<!-- place-map")) continue;
  pages++;
  const fail = (m) => errors.push(`${slug}: ${m}`);

  const og = meta(html, "og:image");
  if (!og || !/\/media\/places\/[^/]+\/population-\d{4}-og\.png$/.test(og)) { fail(`og:image is ${og}, not the population card`); continue; }
  try {
    const p = png(fileFor(og));
    if (p.error || p.w !== 1200 || p.h !== 630 || p.type !== 3) fail(`og card ${JSON.stringify(p)}`);
    else sizes.og.push(p.bytes);
  } catch { fail(`og card missing: ${og}`); }

  // Card for card: the focus value in the card's alt is the page's own figure.
  const alt = meta(html, "og:image:alt") ?? "";
  if (!alt.startsWith("Map: Population change")) fail(`og:image:alt is not the card's alt: "${alt.slice(0, 60)}"`);
  const focusRow = html.match(/<section[^>]*id="map"[\s\S]*?<tr class="pm-focus"><th scope="row">([^<]+)<\/th><td>[^<]*<\/td><td>[^<]*<\/td><td>([^<]+)<\/td><\/tr>/);
  if (!focusRow) fail("no focus row in the population table");
  else {
    const [, name, change] = focusRow.map(decode);
    const esc = name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const onCard = alt.match(new RegExp(`(?:\\. |; )${esc} ([+\\-\u2212]?\\d[\\d.,]*%|n/a)(?:;|\\.$)`));
    const norm = (s) => s.replace(/−/g, "-").trim();
    if (!onCard || norm(onCard[1]) !== norm(change)) fail(`card says "${onCard?.[1]}" for ${name}, page says "${change}"`);
  }

  const downloads = [...html.matchAll(/<a href="([^"]+\.png)" download="[^"]+\.png">Download this card<\/a>/g)].map((m) => decode(m[1]));
  if (downloads.length !== 2) fail(`${downloads.length} download links, expected 2`);
  for (const d of downloads) {
    try {
      const p = png(fileFor(d));
      if (p.error || p.w !== 1080 || p.h !== 1350 || p.type !== 3) fail(`${d} ${JSON.stringify(p)}`);
      else sizes.portrait.push(p.bytes);
    } catch { fail(`download missing: ${d}`); }
  }
  const webps = [...html.matchAll(/<figure class="pm-share"[^>]*>\s*<picture[^>]*>\s*<source type="image\/webp" srcset="([^"]+\.webp)"/g)].map((m) => decode(m[1]));
  if (webps.length !== 2) fail(`${webps.length} card images, expected 2`);
  for (const w of webps) {
    try {
      const b = readFileSync(fileFor(w));
      if (b.subarray(8, 12).toString("latin1") !== "WEBP") fail(`${w} is not a WebP`);
      else sizes.webp.push(b.length);
    } catch { fail(`card image missing: ${w}`); }
  }
}

function du(p) {
  const s = statSync(p);
  if (!s.isDirectory()) return s.size;
  return readdirSync(p).reduce((t, f) => t + du(path.join(p, f)), 0);
}
const total = du(DIST);
const kb = (a) => (a.length ? (a.reduce((x, y) => x + y, 0) / a.length / 1024).toFixed(1) : "n/a");
console.log(`${pages} place pages checked`);
console.log(`og cards ${sizes.og.length}, mean ${kb(sizes.og)} KB; portrait PNGs ${sizes.portrait.length}, mean ${kb(sizes.portrait)} KB; WebPs ${sizes.webp.length}, mean ${kb(sizes.webp)} KB`);
const media = (() => { try { return du(path.join(DIST, "media")); } catch { return 0; } })();
console.log(`dist/ ${(total / 1048576).toFixed(1)} MB (budget 600 MB), of which media/ ${(media / 1048576).toFixed(1)} MB`);
if (pages === 0) errors.push(`no place pages with a map block in ${dir}`);
if (total > DIST_BUDGET) errors.push(`dist/ is ${(total / 1048576).toFixed(1)} MB, over 600 MB`);
if (errors.length) {
  console.error(`${errors.length} problems:\n${errors.slice(0, 40).join("\n")}`);
  process.exit(1);
}
