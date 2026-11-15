/**
 * Counting councils into equal-width bins, for the distribution charts on the
 * dashboards (register row R636, November 2026).
 *
 * A histogram shows how many councils fall in each range of a measure. It never
 * orders or names areas, so it keeps to the rule that tests/area-order.test.ts
 * holds: no list of areas is ever ordered by a value. Every count is a count of
 * the values passed in; nothing is estimated or smoothed.
 */

export interface Bin {
  /** Inclusive lower edge. */
  from: number;
  /** Exclusive upper edge, except for the last bin, which also holds its edge. */
  to: number;
  count: number;
}

export interface Binned {
  bins: Bin[];
  /** How many values were counted (finite numbers only). */
  n: number;
  /** How many values were passed but not finite, and so left out. */
  skipped: number;
  step: number;
}

// Edges are multiples of the step; rounding to 1e-9 stops 0.1 + 0.2 style drift
// from moving a value that sits on an edge into the bin below it.
const snap = (x: number) => Math.round(x * 1e9) / 1e9;

/**
 * Count the values into bins of width `step`, from the multiple of `step` at or
 * below the smallest value to the multiple above the largest. `min` and `max`
 * widen the range (to keep zero or a cut-off on the axis); they never narrow it,
 * so no value is ever dropped for being outside the axis.
 */
export function binValues(
  values: Array<number | null | undefined>,
  step: number,
  opts: { min?: number; max?: number } = {},
): Binned {
  if (!(step > 0)) throw new Error(`binValues: step must be positive, got ${step}`);
  const finite = values.filter((v): v is number => typeof v === "number" && Number.isFinite(v));
  const skipped = values.length - finite.length;
  if (finite.length === 0) return { bins: [], n: 0, skipped, step };

  let lo = finite[0];
  let hi = finite[0];
  for (const v of finite) {
    if (v < lo) lo = v;
    if (v > hi) hi = v;
  }
  if (opts.min != null && opts.min < lo) lo = opts.min;
  if (opts.max != null && opts.max > hi) hi = opts.max;

  const start = snap(Math.floor(snap(lo / step)) * step);
  let end = snap(Math.ceil(snap(hi / step)) * step);
  if (end <= start) end = snap(start + step);

  const count = Math.round((end - start) / step);
  const bins: Bin[] = Array.from({ length: count }, (_, i) => ({
    from: snap(start + i * step),
    to: snap(start + (i + 1) * step),
    count: 0,
  }));
  for (const v of finite) {
    let i = Math.floor(snap((v - start) / step));
    if (i >= count) i = count - 1; // the top edge belongs to the last bin
    bins[i].count += 1;
  }
  return { bins, n: finite.length, skipped, step };
}

/** "−2.5", "0", "10": a true minus sign, and decimals only when the value needs them. */
export function formatEdge(x: number, step: number): string {
  const decimals = Number.isInteger(step) || Number.isInteger(x) ? 0 : Math.min(2, String(step).split(".")[1]?.length ?? 1);
  const abs = Math.abs(x).toFixed(decimals);
  return x < 0 && Number(abs) !== 0 ? `−${abs}` : abs;
}
