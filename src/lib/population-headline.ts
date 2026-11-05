/**
 * Population first (decision R359, 4 November 2026): the homepage's first chart and
 * stat row, and the top of each place page's answer box, lead with the ONS mid-year
 * estimates the site already holds, before any ethnicity figure.
 *
 * Every number comes from src/data/live/population-estimates.json, built from the ONS
 * workbook named in its source block (table MYE4 for the mid-2025 count, the detailed
 * time series for mid-2011 to mid-2024 with the July 2026 revisions). Nothing here is
 * estimated, interpolated or typed in: the year, the publication date and every count
 * are read from that file, so an annual refresh moves the copy with the data.
 */
import rawMye from "../data/live/population-estimates.json";

interface MyeArea {
  name: string;
  population: number;
  medianAge?: number | null;
  /** Persons per square kilometre, if a later build adds it (ONS MYE5). */
  density?: number | null;
  series?: Record<string, number>;
}
const mye = rawMye as unknown as {
  source: { title: string; published: string; tables: string };
  latestYear: number;
  areas: Record<string, MyeArea>;
};

/** The first year of the held series. The detailed time series starts at mid-2011. */
export const MYE_BASE_YEAR = 2011;
/** The latest mid-year the file holds, read from the file. */
export const MYE_LATEST_YEAR: number = mye.latestYear;

/** "29 July 2026", read from the workbook's own publication note. */
export const MYE_PUBLISHED: string | null =
  /(\d{1,2} [A-Z][a-z]+ \d{4})/.exec(mye.source.published)?.[1] ?? null;

/** The source line under any mid-year figure: the ONS table and its publication date. */
export const MYE_SOURCE_LINE = `ONS mid-${MYE_LATEST_YEAR} population estimate, table MYE4${
  MYE_PUBLISHED ? `, published ${MYE_PUBLISHED}` : ""
}`;

/** The source line under the 2011 to latest series. */
export const MYE_SERIES_SOURCE_LINE = `ONS mid-year population estimates, mid-${MYE_BASE_YEAR} to mid-${MYE_LATEST_YEAR} (table MYE4 and the detailed time series${
  MYE_PUBLISHED ? `, published ${MYE_PUBLISHED}` : ""
})`;

export interface PlaceEstimate {
  year: number;
  population: number;
  baseYear: number;
  basePopulation: number;
  change: number;
  changePct: number;
  medianAge: number | null;
  density: number | null;
}

/**
 * The latest mid-year estimate for a place and its change since mid-2011, from the one
 * series. Null when the place has no record, or the series lacks either end.
 */
export function placeEstimate(areaCode: string): PlaceEstimate | null {
  const a = mye.areas[areaCode];
  const now = a?.series?.[String(MYE_LATEST_YEAR)];
  const then = a?.series?.[String(MYE_BASE_YEAR)];
  if (!a || now == null || then == null || !(then > 0)) return null;
  return {
    year: MYE_LATEST_YEAR,
    population: now,
    baseYear: MYE_BASE_YEAR,
    basePopulation: then,
    change: now - then,
    changePct: ((now - then) / then) * 100,
    medianAge: typeof a.medianAge === "number" ? a.medianAge : null,
    density: typeof a.density === "number" ? a.density : null,
  };
}

export interface SeriesPoint { year: number; population: number }
export interface CoveredSeries {
  /** How many of the requested areas the sum covers: every one, or the function throws. */
  areas: number;
  points: SeriesPoint[];
  latest: SeriesPoint;
  base: SeriesPoint;
  change: number;
  changePct: number;
}

/**
 * The sum of the given areas' series for every year from mid-2011 to the latest. An area
 * missing any year would make the years incomparable, so that throws rather than
 * summing a different set of places in different years.
 */
export function coveredSeries(areaCodes: string[]): CoveredSeries {
  const years = Array.from({ length: MYE_LATEST_YEAR - MYE_BASE_YEAR + 1 }, (_, i) => MYE_BASE_YEAR + i);
  const points = years.map((year) => {
    let population = 0;
    for (const code of areaCodes) {
      const v = mye.areas[code]?.series?.[String(year)];
      if (typeof v !== "number") throw new Error(`population-estimates.json has no mid-${year} figure for ${code}`);
      population += v;
    }
    return { year, population };
  });
  const base = points[0];
  const latest = points[points.length - 1];
  return {
    areas: areaCodes.length,
    points,
    base,
    latest,
    change: latest.population - base.population,
    changePct: ((latest.population - base.population) / base.population) * 100,
  };
}
