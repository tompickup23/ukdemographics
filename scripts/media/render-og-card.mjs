#!/usr/bin/env node
/**
 * Renders the site-wide share card, public/og-card.svg, to public/og-card.png.
 *
 *   node scripts/media/render-og-card.mjs
 *
 * Social platforms do not render SVG for og:image, so pages point at the PNG.
 * The SVG stays the source: edit it, then re-run this. Text uses Arial from the
 * system fonts, so render on a machine that has Arial (macOS does).
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { Resvg } from "@resvg/resvg-js";
import sharp from "sharp";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const svg = fs.readFileSync(path.join(root, "public/og-card.svg"), "utf8");
const rendered = new Resvg(svg, {
  fitTo: { mode: "width", value: 1200 },
  font: { loadSystemFonts: true, defaultFontFamily: "Arial" },
}).render();
if (rendered.width !== 1200 || rendered.height !== 630) {
  throw new Error(`expected 1200x630, got ${rendered.width}x${rendered.height}`);
}
const png = await sharp(rendered.asPng()).png({ compressionLevel: 9 }).toBuffer();
fs.writeFileSync(path.join(root, "public/og-card.png"), png);
console.log(`public/og-card.png: 1200x630, ${png.length.toLocaleString("en-GB")} bytes`);
