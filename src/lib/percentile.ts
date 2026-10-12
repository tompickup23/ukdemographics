import { ordinal } from "./ordinal";

/**
 * Where one area's value sits among all areas with a value.
 *
 * `percentile` keeps the definition the place pages have always used: the share
 * of areas with a strictly lower value, rounded to a whole number. At the ends
 * that rounding misleads. The lowest area is always "0th", and with more than
 * 200 areas so is the second lowest (1 of 318 is 0.3%); at the top, "100th" can
 * mean the highest or the second highest. Burnley's page printed "0th
 * percentile". describeRank() therefore gives a rank of n wherever the rounded
 * percentile would be 0 or 100.
 */
export interface PercentileRank {
  percentile: number;
  /** Areas with a strictly lower value. */
  below: number;
  /** Areas with a strictly higher value. */
  above: number;
  /** Areas with a value, this one included. */
  n: number;
}

export function percentileRank(
  values: ReadonlyArray<number | null | undefined>,
  value: number | null | undefined,
): PercentileRank | null {
  if (value == null || !Number.isFinite(value)) return null;
  const known = values.filter((v): v is number => v != null && Number.isFinite(v));
  if (known.length === 0) return null;
  const below = known.filter((v) => v < value).length;
  const above = known.filter((v) => v > value).length;
  return { percentile: Math.round((below / known.length) * 100), below, above, n: known.length };
}

export interface RankWording {
  /** Words before the emphasised part: "at the " for a percentile, otherwise empty. */
  lead: string;
  /** The emphasised part: "72nd percentile", "lowest of 318 areas", "2nd highest of 318 areas". */
  emphasis: string;
}

export function describeRank(r: PercentileRank): RankWording {
  const tied = r.n - r.below - r.above > 1 ? "joint " : "";
  const of = `of ${r.n.toLocaleString("en-GB")} areas`;
  if (r.below === 0) return { lead: "", emphasis: `${tied}lowest ${of}` };
  if (r.above === 0) return { lead: "", emphasis: `${tied}highest ${of}` };
  if (r.percentile <= 0) return { lead: "", emphasis: `${tied}${ordinal(r.below + 1)} lowest ${of}` };
  if (r.percentile >= 100) return { lead: "", emphasis: `${tied}${ordinal(r.above + 1)} highest ${of}` };
  return { lead: "at the ", emphasis: `${ordinal(r.percentile)} percentile` };
}
