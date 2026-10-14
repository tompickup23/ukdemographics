/**
 * Render map cards through src/lib/map/, run every QA gate, and write a manifest of every
 * value drawn. Local only: the site's own cards are built in the BUILD_OG=1 pass by
 * src/pages/media/places/[slug]/[file].ts (Stage 3); this script sweeps every frame.
 *
 *   node scripts/media/build-cards.mjs [--out .cache/media/cards] [--png] [--sheet] [--only E07000117,...]
 *
 * Without --png it renders SVG only and checks it, which is how the whole set is swept.
 * --png rasterises with resvg (the TTFs in src/assets/fonts) and --sheet writes a contact
 * sheet of the portrait population cards. Exits 1 if any card fails QA.
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { createRequire } from "node:module";
import { runnerImport } from "vite";

const require = createRequire(join(process.cwd(), "package.json"));
const { Resvg } = require("@resvg/resvg-js");
const sharp = require("sharp");

const args = process.argv.slice(2);
const opt = (f, d) => (args.includes(f) ? args[args.indexOf(f) + 1] : d);
const OUT = opt("--out", ".cache/media/cards");
const PNG = args.includes("--png"), SHEET = args.includes("--sheet");
const ONLY = opt("--only", "")?.split(",").filter(Boolean);

const { module: M } = await runnerImport("/src/lib/map/index.ts");
const t0 = Date.now();
const log = (...a) => console.log(`[${((Date.now() - t0) / 1000).toFixed(1)}s]`, ...a);

const indicators = M.INDICATOR_IDS.map((id) => M.getIndicator(id));
const png = (svg, W) =>
  new Resvg(svg, { fitTo: { mode: "width", value: W }, font: { fontFiles: M.RESVG_FONT_FILES, loadSystemFonts: false, defaultFontFamily: M.FONT_SANS } })
    .render().asPng();

const frames = [
  ...(ONLY?.length ? ONLY : M.placeCodes()).map((c) => M.focusFrame(c)),
  ...(ONLY?.length ? [] : M.countyCodes().map((c) => M.countyFrame(c.code))),
  ...(ONLY?.length ? [] : M.regionSlugs().map((r) => M.regionFrame(r.slug)))
];
const manifest = [], failures = [], sheet = [];
let n = 0;
for (const frame of frames) {
  for (const ind of indicators) {
    // Every year for the web map (its switcher shows them all); the latest year for cards.
    const years = { inline: ind.years, portrait: [M.latestYear(ind)], story: [M.latestYear(ind)], og: [M.latestYear(ind)] };
    for (const tk of M.TEMPLATE_KEYS) for (const year of years[tk]) {
      const label = `${ind.id}/${frame.type}/${frame.id}/${tk}-${year}`;
      try {
        const res = M.renderChecked(frame, ind, tk, year);
        n++;
        const asset = `${ind.id}/${frame.type}/${frame.id}/${tk}-${year}`;
        if (tk !== "inline" || year === M.latestYear(ind)) {
          manifest.push({ asset, indicator: ind.id, frame: frame.id, frameType: frame.type, template: tk, year, kind: ind.kind(year), source: ind.source(year), alt: res.alt, values: res.drawn });
        }
        if (PNG && (tk !== "inline" || year === M.latestYear(ind))) {
          const dir = join(OUT, ind.id, frame.type, frame.id);
          mkdirSync(dir, { recursive: true });
          const buf = png(res.svg, tk === "inline" ? 1200 : res.layout.W);
          writeFileSync(join(dir, `${tk}-${year}.png`), buf);
          if (SHEET && tk === "portrait" && frame.type === "focus" && ind.id === "population_change") sheet.push({ name: frame.name, buf });
        }
      } catch (e) {
        failures.push(`${label}: ${String(e.message).split("\n").slice(0, 4).join(" | ")}`);
      }
    }
  }
}
log(`${n} renders passed QA, ${failures.length} failed, ${frames.length} frames`);
if (failures.length) console.log(failures.slice(0, 40).join("\n"));
mkdirSync(OUT, { recursive: true });
writeFileSync(join(OUT, "manifest.json"), JSON.stringify({ built: new Date().toISOString(), modelVersion: M.MODEL_VERSION, projections: M.projectionsEnabled(), assets: manifest }));

if (SHEET && sheet.length) {
  // Contact sheet: thumbnails 216 x 270, 12 to a row, A to Z.
  sheet.sort((a, b) => a.name.localeCompare(b.name));
  const tw = 216, th = 270, cols = 12, rows = Math.ceil(sheet.length / cols);
  const tiles = await Promise.all(sheet.map(async (s, i) => ({
    input: await sharp(s.buf).resize(tw, th).png().toBuffer(), left: (i % cols) * tw, top: Math.floor(i / cols) * th
  })));
  const file = join(OUT, "contact-sheet-population-portrait.png");
  await sharp({ create: { width: cols * tw, height: rows * th, channels: 3, background: "#0f1317" } }).composite(tiles).png().toFile(file);
  log("contact sheet", file, `${sheet.length} cards`);
}
process.exit(failures.length ? 1 : 0);
