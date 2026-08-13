/**
 * Guard against showing a confidence interval that does not contain its own estimate.
 *
 * Place pages state the deterministic Hamilton-Perry projection for 2051 and then
 * append an 80% interval taken from the stochastic run. They are two different
 * estimates from two different runs, and on 71% of area-years the projection falls
 * outside the interval drawn around it. Torridge drew a band of 87.3 to 92.0% around a
 * 2051 line of 70.1%. At the extremes the stochastic series is itself implausible:
 * Isles of Scilly, projected at 71.7% White British for 2051, carried a band of 0.8 to
 * 4.0%.
 *
 * Which series is right is an open question that cannot be settled until the model is
 * reproducible and re-run, so this does not pick a winner and does not change
 * any published figure. It withholds the interval wherever the two disagree, and lets
 * it through where they are consistent. When the model is fixed the intervals return on
 * their own, with no copy to revisit.
 */

export interface StochasticBand {
  p10: number;
  p90: number;
  median?: number;
}

/**
 * The interval, but only when it brackets `estimate`. Null means: say nothing about
 * uncertainty here rather than say something incoherent.
 */
export function consistentBand(
  estimate: number | null | undefined,
  band: StochasticBand | null | undefined
): StochasticBand | null {
  if (estimate == null || !Number.isFinite(estimate)) return null;
  if (!band || !Number.isFinite(band.p10) || !Number.isFinite(band.p90)) return null;

  const low = Math.min(band.p10, band.p90);
  const high = Math.max(band.p10, band.p90);
  return estimate >= low && estimate <= high ? band : null;
}

/** True when an interval exists but contradicts the estimate. Useful for auditing. */
export function bandContradictsEstimate(
  estimate: number | null | undefined,
  band: StochasticBand | null | undefined
): boolean {
  if (!band || estimate == null || !Number.isFinite(estimate)) return false;
  return consistentBand(estimate, band) === null;
}

/**
 * Filter a multi-year confidence band down to the years whose interval brackets the
 * matching projection, so a chart never draws a band that excludes its own line.
 */
export function consistentBandSeries<T extends { year: number; low: number; high: number }>(
  points: T[],
  estimateForYear: (year: number) => number | null | undefined
): T[] {
  return points.filter((point) =>
    consistentBand(estimateForYear(point.year), { p10: point.low, p90: point.high }) !== null
  );
}
