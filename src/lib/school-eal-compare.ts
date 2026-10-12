/**
 * How a district's share of pupils with a first language other than English
 * compares with the published figure for its upper-tier county.
 *
 * District pages used to say the county-wide figure "is much lower because it
 * averages every district in the county". A county figure averages its
 * districts, so it is lower than some and higher than others: in 2025/26 the
 * sentence was untrue on 106 of the 180 pages that showed it.
 *
 * The comparison is made on the two shares as the page prints them, to one
 * decimal place. Where they differ by less than SIMILAR_WITHIN_PP percentage
 * points the county figure is called similar; otherwise higher or lower. No
 * comparison is made when the two figures are for different academic years.
 */
export const SIMILAR_WITHIN_PP = 1;

export type CountyComparison = "higher" | "lower" | "similar";

export interface CountyEalComparison {
  direction: CountyComparison;
  /** The county share as printed, one decimal place. */
  countyPct: number;
  /** The district share as printed, one decimal place. */
  districtPct: number;
}

const oneDp = (n: number) => Math.round(n * 10) / 10;

export function compareCountyEal(
  districtPct: number | null | undefined,
  countyPct: number | null | undefined,
  districtYear: string | null | undefined,
  countyYear: string | null | undefined,
): CountyEalComparison | null {
  if (districtPct == null || countyPct == null || !Number.isFinite(districtPct) || !Number.isFinite(countyPct)) return null;
  if (!districtYear || !countyYear || districtYear !== countyYear) return null;
  const d = oneDp(districtPct);
  const c = oneDp(countyPct);
  // Compare in tenths to avoid floating point at the threshold.
  const diffTenths = Math.round(c * 10) - Math.round(d * 10);
  const direction: CountyComparison =
    Math.abs(diffTenths) < SIMILAR_WITHIN_PP * 10 ? "similar" : diffTenths > 0 ? "higher" : "lower";
  return { direction, countyPct: c, districtPct: d };
}
