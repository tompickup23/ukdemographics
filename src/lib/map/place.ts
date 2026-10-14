/**
 * The map block on each place page (Stage 2): one inline SVG carrying both measures
 * (decision D7), the A to Z tables under it, the composition bars beside it (P3) and the
 * summary sentences above it.
 *
 * The SVG is the inline template rendered once per measure, with the second measure's
 * fills, texts and titles merged into the first as data- attributes, so the geometry is
 * drawn once. Population change comes first (P2, D7): it is the neutral measure, and the
 * map a reader sees with no script.
 *
 * Every figure here is read through the indicator registry or from the same files it
 * reads; tests/place-map.test.ts re-derives each one from the source files.
 */
import rawMye from "../../data/live/population-estimates.json";
import rawProjections from "../../data/live/ethnic-projections.json";
import { areaName, focusFrame, type Frame } from "./geo";
import { getIndicator, latestYear, type Indicator, type IndicatorId } from "./indicators";
import { renderStill, yearPhrase, type RenderResult } from "./render";
import { ETHNIC_PALETTE } from "../ethnic-palette";

/** Measure keys used in the SVG's data- attributes and by public/scripts/place-map.js. */
export const MEASURES: Array<{ key: "p" | "e"; id: IndicatorId; tab: string }> = [
  { key: "p", id: "population_change", tab: "Population since 2011" },
  { key: "e", id: "white_british_share", tab: "Ethnic groups" }
];

/** The six groups in fixed order, coloured from the one site palette (src/lib/ethnic-palette.ts). */
export const GROUPS = ETHNIC_PALETTE.map((g) => ({ key: g.key, label: g.label, colour: g.fill }));
export type GroupKey = (typeof ETHNIC_PALETTE)[number]["key"];

interface CensusSide { year: number; total_population: number; groups: Record<string, number>; groups_absolute: Record<string, number> }
const model = rawProjections as unknown as { areas: Record<string, { areaName: string; baseline: CensusSide; current: CensusSide }> };
const mye = rawMye as unknown as { areas: Record<string, { series?: Record<string, number> }> };

/**
 * Census shares for the six groups, as the place page and the map read them. Every area's
 * baseline is the 2011 Census (Stage 2a): the councils formed since 2011 carry the sum of
 * their 2011 districts, checked cell for cell against census-2011-successors.json in
 * tests/map.test.ts.
 */
export function censusShares(code: string, year: 2011 | 2021): Record<GroupKey, number> | null {
  const a = model.areas[code];
  const side = year === 2011 ? a?.baseline : a?.current;
  if (side?.year !== year) return null;
  return Object.fromEntries(GROUPS.map((g) => [g.key, side.groups[g.key]])) as Record<GroupKey, number>;
}

export const populationCount = (code: string, year: number): number | null => mye.areas[code]?.series?.[String(year)] ?? null;

export interface PlaceMap {
  frame: Frame;
  svg: string;
  /** Per measure: indicator, years, the year shown first, and the render for that year. */
  measures: Array<{ key: "p" | "e"; tab: string; ind: Indicator; years: number[]; year: number; res: RenderResult }>;
  /** Councils on the map, A to Z, focus included. */
  members: string[];
}

const attrEsc = (s: string) => s.replace(/[$]/g, "$$$$");

/** Merge measure B's attributes and chunks into measure A's SVG. */
function merge(a: RenderResult, b: RenderResult): string {
  const pa = a.measure!, pb = b.measure!;
  if (pa.chunks.length !== pb.chunks.length) throw new Error("measures drew different chunk counts");
  const La = a.layout, Lb = b.layout;
  if (JSON.stringify(La.panel) !== JSON.stringify(Lb.panel)) throw new Error(`${La.frame.id}: the two measures place the map panel differently`);
  if (JSON.stringify(La.shapes) !== JSON.stringify(Lb.shapes)) throw new Error(`${La.frame.id}: the two measures project the geometry differently`);
  let svg = a.svg;
  svg = svg.replace(/^<svg([^>]*?) viewBox=/, (_, attrs) => `<svg${attrs}${attrEsc(pb.rootAttrs)} data-measures="${pa.key} ${pb.key}" data-m="${pa.key}" viewBox=`);
  svg = svg.replace(/<title id="([^"]+)" data-alt=""/, (whole) => `${whole}${attrEsc(pb.altAttrs)}`);
  for (const code of Object.keys(pa.shapeAttrs)) {
    const shape = `data-code="${code}"`;
    if (!svg.includes(shape)) throw new Error(`${code}: no shape to merge into`);
    svg = svg.replace(shape, `${shape}${attrEsc(pb.shapeAttrs[code] ?? "")}`);
    svg = svg.replace(`data-tc="${code}"`, `data-tc="${code}"${attrEsc(pb.titleAttrs[code] ?? "")}`);
  }
  pa.chunks.forEach((_, i) => {
    const end = `<!--/m${i}-->`;
    if (!svg.includes(end)) throw new Error(`chunk ${i} missing`);
    const hidden = pb.chunks[i].replace(/^<g data-measure="([^"]+)">/, `<g data-measure="$1" display="none">`);
    svg = svg.replace(end, `${end}${attrEsc(hidden)}`);
  });
  return svg.replace(/<!--\/?m\d+-->/g, "");
}

const cache = new Map<string, PlaceMap>();

export function placeMap(code: string): PlaceMap {
  const hit = cache.get(code);
  if (hit) return hit;
  const frame = focusFrame(code);
  const measures = MEASURES.map((m) => {
    const ind = getIndicator(m.id, { projections: false });
    const year = latestYear(ind);
    const res = renderStill(frame, ind, "inline", year, { measure: m.key });
    return { key: m.key, tab: m.tab, ind, years: ind.years, year, res };
  });
  const svg = merge(measures[0].res, measures[1].res);
  const members = [...frame.members].sort((p, q) => areaName(p).localeCompare(areaName(q)));
  const out = { frame, svg, measures, members };
  cache.set(code, out);
  return out;
}

// ---------- Summary sentences: from the registry, neutral verbs only ----------

const nf = (v: number) => v.toLocaleString("en-GB");

/**
 * Two sentences, one per measure, each with its figure and source. The only verbs for a
 * change are "rose" and "fell", and a change that rounds to zero is "no change".
 */
export function summarySentences(code: string): string[] {
  const name = areaName(code);
  const out: string[] = [];
  const pop = getIndicator("population_change", { projections: false });
  const y = latestYear(pop);
  const now = populationCount(code, y), then = populationCount(code, 2011);
  if (pop.status(code, y) === "ok" && now != null && then != null) {
    const d = Number((((now / then) - 1) * 100).toFixed(1));
    const change = d === 0 ? "showed no change" : `${d > 0 ? "rose" : "fell"} ${Math.abs(d).toFixed(1)}%`;
    out.push(`${name}'s estimated population ${change} between mid-2011 and mid-${y}, from ${nf(then)} to ${nf(now)} (ONS mid-year estimates, table MYE4).`);
  }
  const wb = getIndicator("white_british_share", { projections: false });
  const w21 = wb.value(code, 2021), w11 = wb.value(code, 2011);
  if (w21 != null && w11 != null) {
    const d = Number((w21 - w11).toFixed(1));
    const change = d === 0 ? "showed no change" : `${d > 0 ? "rose" : "fell"} ${Math.abs(d).toFixed(1)} points`;
    out.push(`Its White British share ${change} between the 2011 and 2021 Censuses, from ${w11.toFixed(1)}% to ${w21.toFixed(1)}% (ONS Census 2011 table KS201EW, Census 2021 table TS021).`);
  } else if (w21 != null) {
    out.push(`Its White British share was ${w21.toFixed(1)}% at the 2021 Census (ONS Census 2021 table TS021).`);
  }
  return out;
}

/** "Census 2021", "mid-2025 estimate": the phrase for a measure's year, for captions. */
export const yearLabel = (ind: Indicator, y: number) => yearPhrase(ind, y);
