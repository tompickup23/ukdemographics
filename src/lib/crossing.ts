/**
 * When the projection takes an area's White British share below half, as the decade
 * between two published projection years, never as a single year.
 *
 * Until October 2026 the place pages, the homepage and the places index printed a year
 * interpolated in a straight line between projection decades ("around 2044"). The model
 * projects 2031, 2041, 2051 and 2061 only, so any year between them is an assumption,
 * not model output (maps plan v2.2, issue I28). Both ends of the decade returned here
 * are published model years inside the area's plausibility horizon; the start is the
 * 2021 Census as TS021 publishes it.
 */
import { publishableValue } from "./projection-plausibility";

export const PROJECTION_DECADES = [2031, 2041, 2051, 2061] as const;

export interface CrossingDecade {
  /** Last year at or above half: the 2021 Census or a projection year. */
  from: number;
  /** First projection year below half. */
  to: number;
}

type Area = Parameters<typeof publishableValue>[0] & {
  current?: { groups?: Record<string, number>; census_groups?: Record<string, number> };
};

/** The 2021 Census White British share, as TS021 gives it. */
export function censusWhiteBritish2021(area: Area | null | undefined): number | null {
  return (area?.current?.census_groups ?? area?.current?.groups)?.white_british ?? null;
}

/**
 * "already" for an area below half at the 2021 Census; the decade the published
 * projection first falls below half; or null when it does not inside the horizon.
 */
export function crossingDecade(area: Area | null | undefined): CrossingDecade | "already" | null {
  const now = censusWhiteBritish2021(area);
  if (now == null) return null;
  if (now < 50) return "already";
  let prev = 2021;
  for (const y of PROJECTION_DECADES) {
    const v = publishableValue(area, y, area?.projections?.[String(y)]?.white_british);
    if (v == null) return null;
    if (v < 50) return { from: prev, to: y };
    prev = y;
  }
  return null;
}

/** "between 2041 and 2051". */
export const decadePhrase = (d: CrossingDecade) => `between ${d.from} and ${d.to}`;
