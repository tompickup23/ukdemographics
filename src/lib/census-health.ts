import rawHealth from "../data/live/census-health-ethnic.json";

interface HealthByEthnic {
  Total?: number;
  "Good health"?: number;
  "Not good health"?: number;
  notGoodHealthPct?: number;
}

export interface CensusHealthArea {
  areaName: string;
  byEthnic: Record<string, HealthByEthnic>;
}

interface CensusHealthFile {
  source: string;
  sourceUrl: string;
  referenceDate: string;
  areas: Record<string, CensusHealthArea>;
}

const data = rawHealth as unknown as CensusHealthFile;

export function getCensusHealth(areaCode: string): CensusHealthArea | null {
  return data.areas[areaCode] ?? null;
}

// Top-N ethnic groups by population, with their not-good-health %.
export function getTopEthnicGroupsByHealth(
  areaCode: string,
  topN = 3,
): { group: string; data: HealthByEthnic }[] {
  const a = data.areas[areaCode];
  if (!a) return [];
  return Object.entries(a.byEthnic)
    .filter(([k]) => k !== "Total")
    .filter(([, v]) => (v.Total ?? 0) > 0)
    .sort(([, x], [, y]) => (y.Total ?? 0) - (x.Total ?? 0))
    .slice(0, topN)
    .map(([group, d]) => ({ group, data: d }));
}

export function getCensusHealthSource() {
  return { source: data.source, sourceUrl: data.sourceUrl, referenceDate: data.referenceDate };
}
