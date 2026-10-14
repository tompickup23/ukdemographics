/**
 * The indicator registry: one entry per measure a map can show. The renderer knows
 * nothing about any topic; adding a topic means adding an entry here.
 *
 * Every value comes from a file the repo holds, and every entry names its source per
 * year. Nothing is interpolated: annual indicators have a value for every year, census
 * indicators only for census years.
 *
 * Projected years (the UK Demographics model) are off unless MAPS_PROJECTIONS=1. Tom
 * decided on 13 October 2026 that projected maps wait until every council is on one
 * model run (v8.1); until then ethnicity maps show Census 2011 and 2021 only, and with
 * the flag on, councils still on the older run show "n/a, older model run".
 */
import rawProjections from "../../data/live/ethnic-projections.json";
import rawMye from "../../data/live/population-estimates.json";
import rawCensusTotals from "../../../data/raw/manifests/census_ethnic_groups.json";

export type Kind = "census" | "estimate" | "projection";
/**
 * ok: a value is shown. absent: the source has no value for this council and year.
 * formed_since: a council formed after 2011 with no 2011 figure in any held file.
 * older_run: a projected year for a council still on the older model run.
 */
export type Status = "ok" | "absent" | "formed_since" | "older_run";

export interface Scale {
  /** Class boundaries, ascending. A value v takes the colour after every break it is at or above. */
  breaks: number[];
  colours: string[];
  /** One label per break, drawn at the break. */
  labels: string[];
  type: "sequential" | "diverging";
}

export interface Indicator {
  id: string;
  topic: "ethnicity" | "population";
  title: string;
  definition: string;
  years: number[];
  kind: (year: number) => Kind;
  status: (code: string, year: number) => Status;
  /** The value drawn, or null when status is not ok. */
  value: (code: string, year: number) => number | null;
  format: (v: number) => string;
  /** A second line under the value, or null. */
  sub: (code: string, year: number) => string | null;
  /** Text for a status other than ok, shown where the sub-line would be. */
  statusText: Partial<Record<Status, string>>;
  scale: Scale;
  reference: (year: number) => { label: string; value: number } | null;
  source: (year: number) => string;
  /** Footer notes for a year, given the councils on the map. */
  notes: (year: number, codes: string[]) => string[];
  motion: { hold: number; tween: number; labels: "fade" | "snap" };
  /** Ethnicity, migration and asylum: never posted automatically, extra presentation rules. */
  sensitive: boolean;
}

interface CensusSide {
  year: number;
  total_population: number;
  groups: Record<string, number>;
  /** Census 2021 only: TS021 shares as published. groups is the model base there. */
  census_groups: Record<string, number>;
  groups_absolute: Record<string, number>;
}
interface ModelArea {
  areaName: string;
  baseline: CensusSide;
  current: CensusSide;
  projections?: Record<string, Record<string, number>>;
  stochastic?: Record<string, unknown>;
}
const model = rawProjections as unknown as { modelVersion: string; lastUpdated: string; areas: Record<string, ModelArea> };
const mye = rawMye as unknown as {
  source: { title: string; published: string; fileName: string };
  areas: Record<string, { name: string; series?: Record<string, number> }>;
};
const censusTotals = rawCensusTotals as unknown as {
  englandAndWales: Record<string, { total: number; groups: Record<string, number> }>;
  resolution: { baseline2011: { predecessors: string[] } };
};
/**
 * Councils formed since 2011 whose 2011 figure in ethnic-projections.json is the exact sum
 * of their whole 2011 districts (scripts/build/rebase-census-groups.mjs records them as
 * "<code> from <districts>"). src/data/live/census-2011-successors.json holds the same sums,
 * derived separately, and tests/map.test.ts checks the two agree cell for cell.
 */
const summed2011 = new Set(censusTotals.resolution.baseline2011.predecessors.map((line) => line.split(" ")[0]));
export const isSummed2011 = (code: string): boolean => summed2011.has(code);

export const MODEL_VERSION = model.modelVersion.split("-")[0];
export const PROJECTED_YEARS = [2031, 2041, 2051];

/** MAPS_PROJECTIONS=1 turns projected years on. Off by default. */
export const projectionsEnabled = (): boolean => process.env.MAPS_PROJECTIONS === "1";

// Formatting. U+2212 is the minus sign, not a dash.
const MINUS = "−";
const pct1 = (v: number) => `${v.toFixed(1)}%`;
const signedPct = (v: number) => {
  const r = Number(v.toFixed(1));
  return `${r > 0 ? "+" : r < 0 ? MINUS : ""}${Math.abs(r).toFixed(1)}%`;
};
const count = (v: number) => v.toLocaleString("en-GB");

/**
 * Fixed classes for every year and every model version, so a colour always means the same
 * value. The top of the sequential ramp stops at a mid-light indigo: a near-white fill for
 * a "White British" measure would carry a meaning of its own. No red for any group.
 */
export const SEQUENTIAL = ["#25233e", "#2e2b5c", "#39357b", "#46419c", "#5751be", "#6d66de", "#8c86f5"];
// The neutral class (about no change) is a mid grey: the darker #3d434b it replaced was
// 0.032 from the first indigo class in OKLab under tritanopia; #6e747a keeps every adjacent
// pair at least 0.09 apart under protan, deutan and tritan simulation (tests/map.test.ts).
export const DIVERGING = ["#b0703a", "#7a5636", "#6e747a", "#3b3878", "#524dad", "#7b74f2", "#b9b5f9"];

const PUBLISHED = /(\d{1,2} [A-Z][a-z]+ \d{4})/.exec(mye.source.published)?.[1];
const MYE_SOURCE = `ONS, ${mye.source.title}, table MYE4${PUBLISHED ? ` (published ${PUBLISHED})` : ""}`;

/**
 * The six groups' shares of usual residents at a Census, straight from the Census counts
 * (KS201EW for 2011, TS021 for 2021), rounded to 2 places: the composition bars on the
 * ethnicity cards (maps plan v2.2, issue I27). Null where the council has no record.
 */
export function censusGroupShares(code: string, year: 2011 | 2021): Record<string, number> | null {
  const a = model.areas[code];
  const side = year === 2011 ? a?.baseline : a?.current;
  if (!side || side.year !== year || !(side.total_population > 0)) return null;
  return Object.fromEntries(Object.entries(side.groups_absolute).map(([g, n]) => [g, Math.round((n / side.total_population) * 10000) / 100]));
}

function ewShare(year: number): number | null {
  const t = censusTotals.englandAndWales?.[String(year)];
  return t ? (t.groups.white_british / t.total) * 100 : null;
}

function whiteBritishShare(projections: boolean): Indicator {
  const isProjected = (y: number) => y > 2021;
  const status = (code: string, y: number): Status => {
    const a = model.areas[code];
    if (!a) return "absent";
    if (y === 2011) return a.baseline?.year === 2011 ? "ok" : "formed_since";
    if (y === 2021) return a.current?.year === 2021 ? "ok" : "absent";
    if (!projections) return "absent";
    if (!a.stochastic?.[String(y)]) return "older_run";
    return a.projections?.[String(y)]?.white_british != null ? "ok" : "absent";
  };
  const value = (code: string, y: number): number | null => {
    if (status(code, y) !== "ok") return null;
    const a = model.areas[code];
    if (y === 2011) return a.baseline.groups.white_british;
    if (y === 2021) return a.current.census_groups.white_british; // TS021 as published, not the model base
    return a.projections![String(y)].white_british;
  };
  return {
    id: "white_british_share",
    topic: "ethnicity",
    title: "White British share of residents",
    definition: "Share of usual residents in the White: English, Welsh, Scottish, Northern Irish or British group.",
    years: projections ? [2011, 2021, ...PROJECTED_YEARS] : [2011, 2021],
    kind: (y) => (isProjected(y) ? "projection" : "census"),
    status,
    value,
    format: pct1,
    sub: (code, y) => {
      if (y !== 2021) return null;
      const now = value(code, 2021), then = value(code, 2011);
      if (now == null || then == null) return null;
      const d = Number((now - then).toFixed(1));
      if (d === 0) return "no change from 2011";
      return `${d < 0 ? "fell" : "rose"} ${Math.abs(d).toFixed(1)} points from 2011`;
    },
    statusText: { formed_since: "no 2011 figure", older_run: "older model run" },
    scale: {
      breaks: [40, 50, 60, 70, 80, 90],
      colours: SEQUENTIAL,
      labels: ["40", "50", "60", "70", "80", "90%"],
      type: "sequential"
    },
    reference: (y) => {
      const v = ewShare(y > 2021 ? 2021 : y);
      return v == null ? null : { label: `England and Wales ${y > 2021 ? 2021 : y}`, value: v };
    },
    source: (y) =>
      y === 2011 ? "ONS Census 2011, table KS201EW"
        : y === 2021 ? "ONS Census 2021, table TS021; change from Census 2011, table KS201EW"
          : `UK Demographics model ${MODEL_VERSION} (Hamilton-Perry, 2021 base, ONS SNPP 2022-based totals), updated ${model.lastUpdated}`,
    notes: (y, codes) => {
      const out: string[] = [];
      const summed = codes.filter(isSummed2011).map((c) => model.areas[c].areaName).sort();
      if (y <= 2021 && summed.length)
        out.push(`2011 ${summed.length > 1 ? "figures" : "figure"} summed from the 2011 districts now in ${summed.length > 1 ? "each council" : "the council"}: ${summed.join("; ")}.`);
      if (y === 2011 && codes.some((c) => status(c, 2011) === "formed_since"))
        out.push("n/a in 2011: councils formed since 2011 have no 2011 figure in this dataset.");
      if (isProjected(y)) out.push("Projection, not a count.");
      if (isProjected(y) && codes.some((c) => status(c, y) === "older_run"))
        out.push(`n/a, older model run: councils not yet on model ${MODEL_VERSION}.`);
      return out;
    },
    motion: { hold: 1.1, tween: 0.7, labels: "fade" },
    sensitive: true
  };
}

function populationChange(): Indicator {
  const series = (code: string) => mye.areas[code]?.series;
  const status = (code: string, y: number): Status =>
    series(code)?.[String(y)] != null && series(code)?.["2011"] != null ? "ok" : "absent";
  return {
    id: "population_change",
    topic: "population",
    title: "Population change since 2011",
    definition: "Change in the estimated resident population at 30 June, compared with mid-2011.",
    years: Array.from({ length: 15 }, (_, i) => 2011 + i),
    kind: () => "estimate",
    status,
    value: (code, y) => {
      if (status(code, y) !== "ok") return null;
      const s = series(code)!;
      return (s[String(y)] / s["2011"] - 1) * 100;
    },
    format: signedPct,
    sub: (code, y) => (status(code, y) === "ok" ? `${count(series(code)![String(y)])} people` : null),
    statusText: {},
    scale: {
      breaks: [-4, -1, 1, 4, 8, 12],
      colours: DIVERGING,
      labels: [`${MINUS}4`, `${MINUS}1`, "+1", "+4", "+8", "+12%"],
      type: "diverging"
    },
    reference: () => null,
    source: () => MYE_SOURCE,
    notes: () => [],
    motion: { hold: 0.45, tween: 0.2, labels: "snap" },
    sensitive: false
  };
}

export type IndicatorId = "white_british_share" | "population_change";
export const INDICATOR_IDS: IndicatorId[] = ["population_change", "white_british_share"];

export function getIndicator(id: IndicatorId, opts: { projections?: boolean } = {}): Indicator {
  const projections = opts.projections ?? projectionsEnabled();
  return id === "white_british_share" ? whiteBritishShare(projections) : populationChange();
}

export const KIND_TAG: Record<Kind, string> = {
  census: "CENSUS · OBSERVED",
  estimate: "ONS ESTIMATE",
  projection: `PROJECTION · MODEL ${MODEL_VERSION}`
};

/** The fill for a value: fixed classes, the same in every year. */
export function colourFor(ind: Indicator, v: number): string {
  return ind.scale.colours[ind.scale.breaks.filter((b) => v >= b).length];
}

/** The latest year an indicator shows. */
export const latestYear = (ind: Indicator): number => ind.years[ind.years.length - 1];
