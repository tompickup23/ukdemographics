/**
 * Share cards for place pages (maps plan Stage 3), built in the BUILD_OG=1 pass.
 *
 * For every place:
 *   population-<year>-og.png                   the page's Open Graph image (decision P2:
 *                                              population change, never ethnicity)
 *   population-<year>-portrait.png             download, 1080 by 1350
 *   white-british-share-<year>-portrait.png    download, 1080 by 1350
 *   and a WebP of each portrait, 720 wide, shown on the page beside its download link.
 *
 * PNGs are palette-quantised (issue I7). Every card goes through renderChecked, so the
 * QA gates (contrast, dashes, ranking and loaded words, branding, plates) run on each
 * one, and a card whose focus council has no plate fails the build (I6).
 */
import { createRequire } from "node:module";
import { join } from "node:path";
import { slugifyAreaName } from "../site";
import { FONT_SANS, RESVG_FONT_FILES } from "./brand";
import { areaName, focusFrame } from "./geo";
import { getIndicator, latestYear, type IndicatorId } from "./indicators";
import { renderChecked, type DrawnValue } from "./render";
import type { TemplateKey } from "./templates";

const require = createRequire(join(process.cwd(), "package.json"));

/** Palette size for the PNGs: 128 colours keeps text edges clean on the dark ground. */
export const CARD_PALETTE_COLOURS = 128;
export const CARD_WEBP_WIDTH = 720;
export const CARD_WEBP_QUALITY = 80;

const FILE_STEM: Record<IndicatorId, string> = {
  population_change: "population",
  white_british_share: "white-british-share"
};

export type CardFormat = "png" | "webp";

export interface CardSpec {
  indicator: IndicatorId;
  template: Extract<TemplateKey, "og" | "portrait">;
  year: number;
  format: CardFormat;
  /** File name without the extension, e.g. "population-2025-portrait". */
  name: string;
  width: number;
  height: number;
}

const SIZE: Record<"og" | "portrait", [number, number]> = { og: [1200, 630], portrait: [1080, 1350] };

/** The cards built for a place, in a fixed order: the OG image first. */
export function placeCardSpecs(): CardSpec[] {
  const out: CardSpec[] = [];
  const add = (indicator: IndicatorId, template: "og" | "portrait", format: CardFormat) => {
    const year = latestYear(getIndicator(indicator, { projections: false }));
    const [w, h] = SIZE[template];
    const width = format === "webp" ? CARD_WEBP_WIDTH : w;
    out.push({ indicator, template, year, format, name: `${FILE_STEM[indicator]}-${year}-${template}`, width, height: Math.round((h * width) / w) });
  };
  add("population_change", "og", "png");
  add("population_change", "portrait", "png");
  add("population_change", "portrait", "webp");
  add("white_british_share", "portrait", "png");
  add("white_british_share", "portrait", "webp");
  return out;
}

export const placeSlug = (code: string) => slugifyAreaName(areaName(code));

export const cardPath = (code: string, spec: Pick<CardSpec, "name" | "format">) =>
  `/media/places/${placeSlug(code)}/${spec.name}.${spec.format}`;

/** The Open Graph card for a place page. */
export function placeOgCard(code: string): { path: string; spec: CardSpec } {
  const spec = placeCardSpecs()[0];
  return { path: cardPath(code, spec), spec };
}

export interface CardRender {
  svg: string;
  alt: string;
  /** The focus council's value as drawn on the card. */
  focus: DrawnValue;
  drawn: DrawnValue[];
}

/** Render one card's SVG through every QA gate, and insist the focus plate is drawn (I6). */
export function renderCard(code: string, indicator: IndicatorId, template: "og" | "portrait"): CardRender {
  const ind = getIndicator(indicator, { projections: false });
  const res = renderChecked(focusFrame(code), ind, template, latestYear(ind));
  const focus = res.drawn.find((d) => d.code === code);
  if (!focus || !focus.labelled) throw new Error(`${indicator}/${code}/${template}: the focus council has no plate`);
  return { svg: res.svg, alt: res.alt, focus, drawn: res.drawn };
}

// ---------- Raster: resvg on the libuv pool, then sharp ----------

type ResvgModule = { renderAsync: (svg: string, opts: object) => Promise<{ asPng(): Uint8Array }> };
type SharpModule = (input: Buffer) => {
  png(o: object): { toBuffer(): Promise<Buffer> };
  resize(w: number): { webp(o: object): { toBuffer(): Promise<Buffer> } };
};
let resvg: ResvgModule | null = null;
let sharp: SharpModule | null = null;

const rasters = new Map<string, Promise<Buffer>>();

/** Full-size PNG of a card, straight from resvg; cached so a portrait's PNG and WebP share it. */
function raster(code: string, indicator: IndicatorId, template: "og" | "portrait"): Promise<Buffer> {
  const key = `${code}/${indicator}/${template}`;
  let hit = rasters.get(key);
  if (!hit) {
    resvg ??= require("@resvg/resvg-js") as ResvgModule;
    const { svg } = renderCard(code, indicator, template);
    hit = resvg
      .renderAsync(svg, { fitTo: { mode: "width", value: SIZE[template][0] }, font: { fontFiles: RESVG_FONT_FILES, loadSystemFonts: false, defaultFontFamily: FONT_SANS } })
      .then((r) => Buffer.from(r.asPng()));
    rasters.set(key, hit);
  }
  return hit;
}

/** Encode one card file. */
export async function buildCard(code: string, spec: CardSpec): Promise<Buffer> {
  sharp ??= require("sharp") as SharpModule;
  const raw = await raster(code, spec.indicator, spec.template);
  // Both files for a raster are built one after the other, so drop it once its WebP is out.
  if (spec.format === "webp" || spec.template === "og") rasters.delete(`${code}/${spec.indicator}/${spec.template}`);
  return spec.format === "png"
    ? sharp(raw).png({ palette: true, colours: CARD_PALETTE_COLOURS, compressionLevel: 9, effort: 7 }).toBuffer()
    : sharp(raw).resize(CARD_WEBP_WIDTH).webp({ quality: CARD_WEBP_QUALITY, effort: 4 }).toBuffer();
}
