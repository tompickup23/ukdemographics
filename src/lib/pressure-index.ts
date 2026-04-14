import { getEthnicProjection } from "./ethnic-projections";
import { getCrimeProfile } from "./crime-data";
import { getSendProfile } from "./send-data";
import { getAscProfile } from "./asc-data";

export interface PressureScore {
  areaCode: string;
  areaName: string;
  compositeScore: number;
  rank: number;
  components: {
    asylumRate: number | null;
    demographicChangeRate: number | null;
    crimeRate: number | null;
    sendGrowth: number | null;
    ascSpend: number | null;
  };
  availableModules: number;
}

function percentileRank(values: number[], target: number): number {
  const below = values.filter((v) => v < target).length;
  return (below / values.length) * 100;
}

/**
 * Compute a composite pressure index for an area.
 * Uses percentile ranks across available domains, weighted equally.
 * Only domains with data contribute; the score adjusts for missing modules.
 */
export function computePressureScore(
  areaCode: string,
  areaName: string,
  asylumRate: number | null,
  allAsylumRates: number[]
): PressureScore {
  const components: Array<{ domain: string; percentile: number }> = [];

  if (asylumRate !== null && allAsylumRates.length > 0) {
    components.push({ domain: "asylum", percentile: percentileRank(allAsylumRates, asylumRate) });
  }

  const ethnic = getEthnicProjection(areaCode);
  if (ethnic) {
    const absChange = Math.abs(ethnic.annualChangePp.white_british);
    const allChanges = [0.97, 0.87, 0.79, 0.60, 0.53, 0.42, 0.38, 0.35, 0.32, 0.28, 0.24, 0.21, 0.18, 0.15, 0.12, 0.10, 0.09, 0.08, 0.07, 0.06, 0.05, 0.04, 0.03, 0.02, 0.01];
    components.push({ domain: "demographic", percentile: percentileRank(allChanges, absChange) });
  }

  const crime = getCrimeProfile(areaCode);
  if (crime) {
    const allRates = [142.8, 118.4, 112.4, 108.7, 104.8, 98.2, 96.8, 89.4, 88.2, 84.7, 82.4, 82.1, 78.9, 74.8, 74.1, 72.4, 71.3, 68.7, 68.2, 62.1, 58.4, 54.8, 52.1, 48.2, 32.4];
    components.push({ domain: "crime", percentile: percentileRank(allRates, crime.totalCrimeRate) });
  }

  const send = getSendProfile(areaCode);
  if (send) {
    const allGrowth = [51.2, 46.8, 45.1, 44.8, 44.2, 43.2, 42.4, 42.1, 41.8, 41.2, 40.4, 40.1, 39.8, 39.4, 38.7, 38.2, 37.8, 36.8, 35.2, 34.2, 33.1, 32.1, 31.4, 30.2, 28.4];
    components.push({ domain: "send", percentile: percentileRank(allGrowth, send.fiveYearGrowthPct) });
  }

  const asc = getAscProfile(areaCode);
  if (asc) {
    const allSpend = [724, 624, 612, 598, 592, 578, 568, 564, 542, 528, 524, 518, 514, 512, 508, 502, 498, 498, 488, 482, 478, 472, 468, 462, 442];
    components.push({ domain: "asc", percentile: percentileRank(allSpend, asc.grossSpendPerCapita) });
  }

  const compositeScore = components.length > 0
    ? components.reduce((sum, c) => sum + c.percentile, 0) / components.length
    : 0;

  return {
    areaCode,
    areaName,
    compositeScore: Math.round(compositeScore * 10) / 10,
    rank: 0,
    components: {
      asylumRate: asylumRate,
      demographicChangeRate: ethnic ? Math.abs(ethnic.annualChangePp.white_british) : null,
      crimeRate: crime?.totalCrimeRate ?? null,
      sendGrowth: send?.fiveYearGrowthPct ?? null,
      ascSpend: asc?.grossSpendPerCapita ?? null
    },
    availableModules: components.length
  };
}
