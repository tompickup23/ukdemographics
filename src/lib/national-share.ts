import rawProjections from "../data/live/ethnic-projections.json";
import { plausibleThrough } from "./projection-plausibility";

/**
 * Population-weighted White British share across a set of areas, on two rules.
 *
 * Each year divides by the population of the areas that year covers, which sounds
 * obvious and was not what the homepage did: 2061 accumulated a numerator over the
 * areas the model reaches that far and divided it by the population of all 318,
 * counting the rest as areas with no White British residents.
 *
 * And a year counts for an area only where that year is publishable for it. Where
 * a residual Census group runs away past a quarter of the population at several
 * times its 2021 share, the place page withholds the year, and an aggregate that
 * swallows what the page refuses to print is running a second rule in public.
 *
 * wb2051on2061Geo carries 2051 recomputed over exactly the areas publishable to
 * 2061, because a 2051 share over one set of areas against a 2061 share over a
 * smaller set is not a decade of change.
 *
 * The areas the current model cannot produce are exactly those carrying a 2051
 * projection and no 2061 one: the v8 pipeline runs an area to 2061 or not at all.
 * They are derived here rather than listed, so a disclosure built on nLegacy cannot
 * go stale the way a typed-in count does.
 *
 * Every share is weighted by the 2021 Census population (current.total_population)
 * throughout, for consistency between years.
 *
 * The homepage calls this, and tests/majority-counts.test.ts checks the prose in
 * the findings and the methodology page against it, so a page and a sentence
 * quoting the same figure cannot drift apart.
 */
export interface NationalWhiteBritishAggregate {
  pop: number;
  wb2011: number;
  wb2021: number;
  wb2051: number;
  wb2061: number;
  wb2051on2061Geo: number;
  wb2051Current: number;
  nCurrent: number;
  nLegacy: number;
  legacyPopPct: number;
  n2051: number;
  n2061: number;
}

export function nationalWhiteBritishAggregate(
  areaCodes: Iterable<string>,
  areas: Record<string, any> = (rawProjections as any).areas
): NationalWhiteBritishAggregate {
  let totalPop = 0, pop2051 = 0, pop2061 = 0, popCurrent = 0, legacyPop = 0;
  let wb2011 = 0, wb2021 = 0, wb2051 = 0, wb2061 = 0, wb2051on2061Geo = 0, wb2051Current = 0;
  let n2051 = 0, n2061 = 0, nLegacy = 0;
  for (const code of areaCodes) {
    const a = areas[code];
    const pop = a?.current?.total_population ?? 0;
    if (!pop) continue;
    totalPop += pop;
    wb2011 += (a?.baseline?.groups?.white_british ?? 0) * pop;
    wb2021 += (a?.current?.groups?.white_british ?? 0) * pop;

    const through = plausibleThrough(a);
    const p51 = through != null && through >= 2051 ? a?.projections?.["2051"]?.white_british : null;
    const p61 = through != null && through >= 2061 ? a?.projections?.["2061"]?.white_british : null;
    if (p51 != null) {
      wb2051 += p51 * pop; pop2051 += pop; n2051++;
      if (a?.projections?.["2061"] == null) { legacyPop += pop; nLegacy++; }
      else { wb2051Current += p51 * pop; popCurrent += pop; }
    }
    if (p61 != null) {
      wb2061 += p61 * pop; pop2061 += pop; n2061++;
      if (p51 != null) wb2051on2061Geo += p51 * pop;
    }
  }
  return {
    pop: totalPop,
    wb2011: totalPop > 0 ? wb2011 / totalPop : 0,
    wb2021: totalPop > 0 ? wb2021 / totalPop : 0,
    wb2051: pop2051 > 0 ? wb2051 / pop2051 : 0,
    wb2061: pop2061 > 0 ? wb2061 / pop2061 : 0,
    wb2051on2061Geo: pop2061 > 0 ? wb2051on2061Geo / pop2061 : 0,
    wb2051Current: popCurrent > 0 ? wb2051Current / popCurrent : 0,
    nCurrent: n2051 - nLegacy,
    nLegacy,
    legacyPopPct: pop2051 > 0 ? (legacyPop / pop2051) * 100 : 0,
    n2051,
    n2061,
  };
}
