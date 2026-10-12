/**
 * The two-model spread, summarised from the projection file so the methodology
 * page states what the data holds rather than a typed figure.
 *
 * modelSpread2051 holds, per area, the Hamilton-Perry 2051 White British share
 * (the published projection), the cohort-component share from
 * scripts/model/run_projection_v2.mjs, and spreadPp, the absolute gap between
 * them in percentage points. The comparison is only meaningful where the
 * current forward model produced the Hamilton-Perry side, which is the areas
 * with projections_detail; the place page shows it for those areas only.
 */

type SpreadArea = {
  projections_detail?: unknown;
  modelSpread2051?: { hamiltonPerry?: number; cohortComponent?: number; spreadPp?: number };
  scenarioRange2051?: { central?: number };
};

export type ModelSpreadSummary = {
  /** Areas with a two-model comparison (modelled by the current forward model). */
  compared: number;
  /** Median spreadPp across those areas, percentage points. */
  medianPp: number;
  /** Largest spreadPp across those areas. */
  maxPp: number;
  /** Areas whose spread is above the threshold (20pp by default). */
  above: number;
  threshold: number;
  /** Areas where cohort-component projects a higher White British share than Hamilton-Perry. */
  ccHigher: number;
  /** Areas where cohort-component projects a lower one. */
  ccLower: number;
  /**
   * Areas, of all in the file, whose scenarioRange2051.central differs from the
   * Hamilton-Perry figure by more than 0.5pp (the rule in
   * scripts/validate-projections.mjs).
   */
  centralMismatch: number;
};

function median(values: number[]): number {
  const s = [...values].sort((a, b) => a - b);
  const n = s.length;
  if (n === 0) return Number.NaN;
  return n % 2 ? s[(n - 1) / 2] : (s[n / 2 - 1] + s[n / 2]) / 2;
}

export function summariseModelSpread(areas: Record<string, SpreadArea>, threshold = 20): ModelSpreadSummary {
  const rows = Object.values(areas)
    .filter((a) => a.projections_detail)
    .map((a) => a.modelSpread2051)
    .filter(
      (m): m is { hamiltonPerry: number; cohortComponent: number; spreadPp: number } =>
        typeof m?.hamiltonPerry === "number" && typeof m?.cohortComponent === "number" && typeof m?.spreadPp === "number",
    );
  const spreads = rows.map((m) => m.spreadPp);
  const centralMismatch = Object.values(areas).filter((a) => {
    const c = a.scenarioRange2051?.central;
    const hp = a.modelSpread2051?.hamiltonPerry;
    return typeof c === "number" && typeof hp === "number" && Math.abs(c - hp) > 0.5;
  }).length;
  return {
    compared: rows.length,
    medianPp: median(spreads),
    maxPp: spreads.length ? Math.max(...spreads) : Number.NaN,
    above: spreads.filter((s) => s > threshold).length,
    threshold,
    ccHigher: rows.filter((m) => m.cohortComponent > m.hamiltonPerry).length,
    ccLower: rows.filter((m) => m.cohortComponent < m.hamiltonPerry).length,
    centralMismatch,
  };
}
