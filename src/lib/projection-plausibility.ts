/**
 * Withhold projection years where the model has diverged rather than projected.
 *
 * The Hamilton-Perry cohort change ratios compound with no envelope on any
 * individual ethnic group, and the ratio clamp permits a group to quintuple in a
 * single ten-year step, which is 625x over four steps. On a thin 2021 base that
 * is enough to carry a residual Census category to a plurality: Enfield's "Other"
 * group is projected from 12.1% in 2021 to 67% by 2051 and 82% by 2061. Ninety
 * two area-years across the dataset are in that state.
 *
 * Those are arithmetic outputs, not demographic forecasts, and they were live on
 * both this site and the sister site.
 *
 * This picks no winner between modelling approaches and changes no figure. Like
 * consistentBand for the confidence intervals, it withholds what is incoherent
 * and lets everything else through. Divergence compounds, so once a year is
 * diverged every later year is too, and the horizon is truncated rather than
 * holed: an area whose 2031 and 2041 are sound keeps them and loses only 2051
 * and 2061.
 *
 * When the model is reconciled these years return on their own, with no copy to
 * revisit.
 */

/**
 * Every group except White British is tested. The first version of this guard
 * only checked the residual categories ("other", "mixed") on the reasoning that
 * a residual cannot credibly become the plurality. That was too narrow: the
 * divergence signature is a group multiplying several-fold off a modest base to
 * reach an implausible share, and that is not special to residual categories.
 * White Other does it too, and harder in places. Barnsley is projected from 4.3%
 * White Other in 2021 to 45.3% by 2061, which is a factor of ten; Boston goes
 * 20.1% to 62.9%. Those were being published while Enfield's "Other" was caught.
 *
 * The Barnsley figure above came from a duplicate record filed under a second
 * ONS code, which carried a superseded model run and was removed on 29 August
 * 2026. Barnsley's live record projects White Other from 4.3% to 13.6% by 2061
 * and no longer truncates. The reasoning stands; the example no longer resolves
 * against the data. See src/lib/area-codes.ts.
 *
 * White British is excluded because it is the base group and starts near the top
 * in most areas, so the multiple test is meaningless for it, and it is falling
 * rather than compounding upward everywhere the model runs.
 */
const CHECKED_GROUPS = [
  "other",
  "mixed",
  "white_other",
  "asian",
  "black",
] as const;

/** Share at which a group stops being plausible as a projection. */
export const RUNAWAY_CEILING_PCT = 25;

/** And the multiple of its own 2021 base that marks it as runaway rather than growth. */
export const RUNAWAY_MULTIPLE = 3;

export const PROJECTION_YEARS = [2031, 2041, 2051, 2061] as const;

type Groups = Record<string, number | undefined>;

export function yearHasDiverged(
  projected: Groups | null | undefined,
  base2021: Groups | null | undefined
): boolean {
  if (!projected) return false;
  for (const group of CHECKED_GROUPS) {
    const now = base2021?.[group] ?? 0;
    const then = projected[group];
    if (then == null) continue;
    if (then >= RUNAWAY_CEILING_PCT && (now === 0 || then >= now * RUNAWAY_MULTIPLE)) {
      return true;
    }
  }
  return false;
}

/**
 * The last projected year that can be published for this area, or null when even
 * the first projected year has diverged. Areas that never diverge return their
 * final available year, which is the overwhelming majority.
 */
export function plausibleThrough(area: {
  projections?: Record<string, Groups>;
  current?: { groups?: Groups };
} | null | undefined): number | null {
  const proj = area?.projections;
  if (!proj) return null;
  const base = area?.current?.groups;

  let last: number | null = null;
  for (const year of PROJECTION_YEARS) {
    const row = proj[String(year)];
    if (!row) continue;
    if (yearHasDiverged(row, base)) return last;
    last = year;
  }
  return last;
}

/** True when at least one projected year had to be withheld. */
export function isTruncated(area: Parameters<typeof plausibleThrough>[0]): boolean {
  const proj = area?.projections;
  if (!proj) return false;
  const available = PROJECTION_YEARS.filter((y) => proj[String(y)]);
  if (available.length === 0) return false;
  const through = plausibleThrough(area);
  return through === null || through < available[available.length - 1];
}

/** Filter a year-keyed series down to the years this area can publish. */
export function publishableYears(
  area: Parameters<typeof plausibleThrough>[0],
  years: readonly number[]
): number[] {
  const through = plausibleThrough(area);
  if (through === null) return [];
  return years.filter((y) => y <= through);
}

/** Guard a single projected value: the number, or null if its year is withheld. */
export function publishableValue(
  area: Parameters<typeof plausibleThrough>[0],
  year: number,
  value: number | null | undefined
): number | null {
  if (value == null) return null;
  const through = plausibleThrough(area);
  return through !== null && year <= through ? value : null;
}
