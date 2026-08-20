/**
 * PCON demographic aggregation.
 *
 * Aggregates local-authority-level demographic data up to Westminster
 * constituency level using the per-LA postcode-share weights stored on
 * each PconEntry. The weight is the share of the constituency's postcodes
 * that fall in that LA, which sums to approximately 1.0 across the
 * constituency's constituent LAs.
 *
 * The aggregation is population-weighted: each LA's contribution is
 * `postcodeShare * laPopulation`, normalised by the sum of weights.
 * This assumes population is uniformly distributed across postcodes
 * within an LA. That assumption breaks down where a constituency takes
 * a high-density urban core of an LA but only a small share of its
 * postcodes (or vice versa). The approximation is good enough for the
 * indicative figures shown on the constituency page but should not be
 * treated as a direct PCON-level Census observation.
 *
 * Source: every figure derives from data already published on the
 * /places/ pages. Numbers shown on /constituencies/ are derived; numbers
 * shown on /places/ are direct.
 */
import { getPconByCode, type PconEntry } from "./pcon-data";
import { getPublicPlaceAreas, type DemographicAreaSummary } from "./site";
import rawProjections from "../data/live/ethnic-projections.json";

const projData = rawProjections as {
  areas: Record<string, {
    current?: { total_population?: number; groups?: { white_british?: number } };
    projections?: Record<string, { white_british?: number }>;
    nativity?: Record<string, { foreignBornPct?: number }>;
  }>;
};

const _publicAreaByCode: Map<string, DemographicAreaSummary> = (() => {
  const m = new Map<string, DemographicAreaSummary>();
  for (const a of getPublicPlaceAreas()) m.set(a.areaCode, a);
  return m;
})();

export interface PconDemographicsResult {
  totalWeight: number;
  coverageCount: number;
  expectedCount: number;
  wbi2021: number | null;
  wbi2041: number | null;
  wbi2051: number | null;
  foreignBornPct2021: number | null;
  foreignBornPct2051: number | null;
  notes: string[];
}

/**
 * Returns null when no constituent LAs have UKD profiles (typically NI,
 * occasionally early-stage data gaps).
 */
export function getPconDemographics(pconCodeOrEntry: string | PconEntry): PconDemographicsResult | null {
  const pcon = typeof pconCodeOrEntry === "string" ? getPconByCode(pconCodeOrEntry) : pconCodeOrEntry;
  if (!pcon) return null;

  let totalWeight = 0;
  let wbi2021Acc = 0;
  let wbi2041Acc = 0;
  let wbi2051Acc = 0;
  let fb2021Acc = 0;
  let fb2051Acc = 0;
  let wbi2021Weight = 0;
  let wbi2041Weight = 0;
  let wbi2051Weight = 0;
  let fb2021Weight = 0;
  let fb2051Weight = 0;
  let coverageCount = 0;

  for (const la of pcon.constituentLas) {
    const area = _publicAreaByCode.get(la.ladCode);
    if (!area) continue;
    const proj = projData.areas[la.ladCode];
    const pop = area.population ?? proj?.current?.total_population ?? 0;
    if (!pop) continue;
    const weight = la.postcodeShare * pop;
    if (weight <= 0) continue;
    coverageCount++;
    totalWeight += weight;

    const wb2021 = area.wbiPct2021;
    const wb2041 = area.wbiPct2041;
    const wb2051 = proj?.projections?.["2051"]?.white_british;
    const fb2021 = proj?.nativity?.["2021"]?.foreignBornPct;
    const fb2051 = proj?.nativity?.["2051"]?.foreignBornPct;

    if (wb2021 != null) { wbi2021Acc += wb2021 * weight; wbi2021Weight += weight; }
    if (wb2041 != null) { wbi2041Acc += wb2041 * weight; wbi2041Weight += weight; }
    if (wb2051 != null) { wbi2051Acc += wb2051 * weight; wbi2051Weight += weight; }
    if (fb2021 != null) { fb2021Acc += fb2021 * weight; fb2021Weight += weight; }
    if (fb2051 != null) { fb2051Acc += fb2051 * weight; fb2051Weight += weight; }
  }

  if (coverageCount === 0 || totalWeight === 0) return null;

  const notes: string[] = [];
  const expectedCount = pcon.constituentLas.length;
  if (coverageCount < expectedCount) {
    notes.push(`${expectedCount - coverageCount} of ${expectedCount} constituent local authorities have no UKD profile and are excluded from the aggregate.`);
  }

  return {
    totalWeight,
    coverageCount,
    expectedCount,
    wbi2021: wbi2021Weight > 0 ? wbi2021Acc / wbi2021Weight : null,
    wbi2041: wbi2041Weight > 0 ? wbi2041Acc / wbi2041Weight : null,
    wbi2051: wbi2051Weight > 0 ? wbi2051Acc / wbi2051Weight : null,
    foreignBornPct2021: fb2021Weight > 0 ? fb2021Acc / fb2021Weight : null,
    foreignBornPct2051: fb2051Weight > 0 ? fb2051Acc / fb2051Weight : null,
    notes,
  };
}
