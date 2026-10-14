/**
 * The UK Demographics brand for every rendered image: the Open Graph cards in
 * src/pages/og/[...slug].png.ts and the maps, share cards and clip frames in
 * src/lib/map/. One copy, so a card and a map can never drift apart.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";

// The estate ground, shared by every social and Open Graph surface on all five sites.
// The accent here is the BRIGHT value of the ukdemographics triple, not the deep one:
// deep is for links and rules on white, bright is the mark and the URL on the ground,
// and #4338ca does not clear 4.5:1 against #0f1317 while #7b74f2 does at 4.99.
// The three verdict colours are the same lightened set Asylum Stats validated, all
// above 7:1 on the ground.
export const COLORS = {
  bg: "#0f1317",
  surface: "#0f1317",
  accent: "#7b74f2",
  accentLight: "#a9a4f7",
  text: "#f4f6f7",
  muted: "#98a3ac",
  alert: "#e8b661",
  critical: "#e8897c",
  resolved: "#7fc9a8"
} as const;

/** The second colour of the mark, the right-hand half of each pyramid bar. */
export const MARK_SHADE = "#574fa8";

// The mark: the population pyramid from the site header and the favicon, on a 64 unit
// grid. It replaced rising bars with a trend line, which collided with the food hygiene
// steps at thumbnail size and whose opacity ramp made the tallest bar faintest.
const MARK_BARS: Array<[number, number, number, string]> = [
  [20, 8, 10, COLORS.accent], [34, 8, 12, MARK_SHADE],
  [16, 19, 14, COLORS.accent], [34, 19, 16, MARK_SHADE],
  [12, 30, 18, COLORS.accent], [34, 30, 20, MARK_SHADE],
  [8, 41, 22, COLORS.accent], [34, 41, 24, MARK_SHADE],
  [4, 52, 26, COLORS.accent], [34, 52, 28, MARK_SHADE]
];

/** The mark's bars as SVG rects, scaled to a square of `size` units. */
export function markRects(size: number): string {
  const u = size / 64;
  return MARK_BARS.map(
    ([x, y, w, fill]) =>
      `<rect x="${+(x * u).toFixed(2)}" y="${+(y * u).toFixed(2)}" width="${+(w * u).toFixed(2)}" height="${+(9 * u).toFixed(2)}" fill="${fill}"/>`
  ).join("");
}

/** The mark as a standalone SVG document. Satori takes it through an img. */
export const MARK_SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64" width="64" height="64">${markRects(64)}</svg>`;
export const MARK_URI = `data:image/svg+xml;base64,${Buffer.from(MARK_SVG).toString("base64")}`;

export const SITE_DOMAIN = "ukdemographics.co.uk";
export const BRAND_NAME = "UK Demographics";
export const BRAND_TAGLINE = "Population data for every community";
export const BRAND_SOURCED = "Every figure sourced.";

/** Source Serif 4 for display, Source Sans 3 for everything else, as on the site. */
export const FONT_SERIF = "Source Serif 4";
export const FONT_SANS = "Source Sans 3";

const FONT_DIR = join(process.cwd(), "src", "assets", "fonts");

/**
 * WOFF for Satori, which reads ttf, otf and woff and silently falls back on woff2, which
 * would render the cards in a font nobody chose.
 */
export function loadSatoriFont(file: "SourceSerif4-SemiBold.woff" | "SourceSans3-Regular.woff" | "SourceSans3-SemiBold.woff"): ArrayBuffer {
  return readFileSync(join(FONT_DIR, file)).buffer as ArrayBuffer;
}

/** TTF paths for resvg, which does not read WOFF. Same faces and weights as the WOFF set. */
export const RESVG_FONT_FILES = [
  "SourceSans3-Regular.ttf",
  "SourceSans3-SemiBold.ttf",
  "SourceSerif4-SemiBold.ttf"
].map((f) => join(FONT_DIR, f));
