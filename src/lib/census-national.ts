/**
 * White British share of all usual residents in England and Wales at each
 * Census, each year weighted by its own population.
 *
 * The homepage used to weight every area's 2011 share by its 2021 population,
 * and it counted the eleven authorities created after 2011, whose "baseline"
 * in the projection file is their 2021 Census, inside the 2011 figure. It
 * published 80.0% where Census 2011 table KS201EW gives 80.5%.
 *
 * 2011 comes from the England and Wales totals of KS201EW, recorded in
 * data/raw/manifests/census_ethnic_groups.json by
 * scripts/build/rebase-census-groups.mjs from the extract it rebases on, so it
 * covers the whole country on 2011 boundaries. 2021 is summed from the 318
 * areas' Census counts (TS021), which already cover England and Wales.
 */
import rawProjections from "../data/live/ethnic-projections.json";
import censusManifest from "../../data/raw/manifests/census_ethnic_groups.json";

interface Totals {
  areas: number;
  total: number;
  groups: Record<string, number>;
}

const projections = rawProjections as unknown as {
  areas: Record<string, { current?: { year?: number; total_population?: number; groups_absolute?: Record<string, number> } }>;
};
const manifest = censusManifest as unknown as { englandAndWales?: Record<string, Totals> };

export interface CensusShare {
  /** Percentage, 0 to 100. */
  pct: number;
  /** Local authorities summed, on that Census's own boundaries. */
  areas: number;
  /** All usual residents summed. */
  residents: number;
  table: "KS201EW" | "TS021";
}

/** Census 2011 White British share for England and Wales, or null if the manifest lacks it. */
export function census2011WhiteBritish(): CensusShare | null {
  const t = manifest.englandAndWales?.["2011"];
  if (!t || !(t.total > 0)) return null;
  return { pct: (t.groups.white_british / t.total) * 100, areas: t.areas, residents: t.total, table: "KS201EW" };
}

/** Census 2021 White British share, summed from the given areas' Census counts. */
export function census2021WhiteBritish(areaCodes: Iterable<string>): CensusShare | null {
  let wb = 0, total = 0, areas = 0;
  for (const code of areaCodes) {
    const c = projections.areas[code]?.current;
    if (c?.year !== 2021 || !c.groups_absolute || !(c.total_population && c.total_population > 0)) continue;
    wb += c.groups_absolute.white_british ?? 0;
    total += c.total_population;
    areas++;
  }
  if (!(total > 0)) return null;
  return { pct: (wb / total) * 100, areas, residents: total, table: "TS021" };
}
