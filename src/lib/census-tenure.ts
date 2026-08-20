import rawTenure from "../data/live/census-tenure-ethnic.json";

interface TenureByEthnic {
  Total?: number;
  Owned?: number;
  "Rented: Social rented"?: number;
  "Rented: Private rented or lives rent free"?: number;
  ownershipPct?: number;
  socialRentPct?: number;
  privateRentPct?: number;
}

export interface CensusTenureArea {
  areaName: string;
  byEthnic: Record<string, TenureByEthnic>;
}

interface CensusTenureFile {
  source: string;
  sourceUrl: string;
  referenceDate: string;
  areas: Record<string, CensusTenureArea>;
}

const data = rawTenure as unknown as CensusTenureFile;

export function getCensusTenure(areaCode: string): CensusTenureArea | null {
  return data.areas[areaCode] ?? null;
}

// Return the top-N ethnic groups by household count, excluding the "Total"
// row. Each entry includes the group's name and its tenure-rate fields.
export function getTopEthnicGroupsByTenure(
  areaCode: string,
  topN = 3,
): { group: string; data: TenureByEthnic }[] {
  const a = data.areas[areaCode];
  if (!a) return [];
  return Object.entries(a.byEthnic)
    .filter(([k]) => k !== "Total")
    .filter(([, v]) => (v.Total ?? 0) > 0)
    .sort(([, x], [, y]) => (y.Total ?? 0) - (x.Total ?? 0))
    .slice(0, topN)
    .map(([group, d]) => ({ group, data: d }));
}

export function getCensusTenureSource() {
  return { source: data.source, sourceUrl: data.sourceUrl, referenceDate: data.referenceDate };
}
