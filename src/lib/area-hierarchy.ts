import rawLookup from "../data/lookups/district-to-utla.json";

interface DistrictEntry {
  districtName: string;
  countyCode: string;
  countyName: string;
}

interface Lookup {
  source: string;
  sourceUrl: string;
  lastFetched: string;
  description: string;
  districts: Record<string, DistrictEntry>;
}

const data = rawLookup as unknown as Lookup;

// For E07 non-metropolitan districts, return the parent E10 county info.
// All other code prefixes (E06 unitary, E08 met district, E09 London borough,
// E10 county, W06 Welsh unitary) deliver ASC/SEND themselves and need no fallback.
export function getParentUtla(
  areaCode: string,
): { countyCode: string; countyName: string } | null {
  if (!areaCode.startsWith("E07")) return null;
  const entry = data.districts[areaCode];
  if (!entry) return null;
  return { countyCode: entry.countyCode, countyName: entry.countyName };
}

export function isDistrict(areaCode: string): boolean {
  return areaCode.startsWith("E07");
}
