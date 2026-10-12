/**
 * The arithmetic of the v8.1 control totals (decisions D3 and D4), kept free of
 * file reading so it can be tested on small fixtures.
 *
 * Shapes: an area is { M: { [year]: number[91] }, F: { ... } }, ages 0 to 89
 * then 90 meaning 90 and over.
 *
 * England, per local authority a, sex s, single year of age x, year t:
 *   2022 to 2025   the revised mid-year estimates (ONS, 29 July 2026).
 *   2026 onwards   P(a,s,x,t) = MYE(a,s,x,2025) * G(a,s,x,t), where
 *                  G = SNPP(a,s,x,t) / SNPP(a,s,x,2025) from the 2022-based SNPP
 *                  migration category variant; then every (s,x,t) is scaled so
 *                  the English authorities sum to the 2024-based NPP for England.
 * Wales, per authority: the same anchoring with G from the Welsh Government
 * 2022-based principal projection, and no national rescale.
 *
 * Beyond a source's last year G is extended in a straight line from its change
 * over the source's last four years (v8.0's rule for SNPP totals, applied per
 * cell), held at the last value if the line turns negative. That extension is
 * UKD's assumption, not the publisher's, and the output labels it.
 */

export const zeros = () => new Array(91).fill(0);
const SEXES = ["M", "F"];

/** Growth ratios relative to a base year, for one area and sex. */
export function growthRatios(series, baseYear, years) {
  const base = series[baseYear];
  if (!base) throw new Error(`growth: no base year ${baseYear}`);
  const baseTotal = base.reduce((a, b) => a + b, 0);
  const out = {};
  let fallbacks = 0;
  for (const y of years) {
    const row = series[y];
    if (!row) throw new Error(`growth: no year ${y}`);
    const rowTotal = row.reduce((a, b) => a + b, 0);
    out[y] = row.map((v, i) => {
      if (base[i] > 0) return v / base[i];
      fallbacks += 1;
      // An empty base cell has no ratio of its own; it takes the area's
      // all-age ratio for that sex, so a later cohort is not lost.
      return baseTotal > 0 ? rowTotal / baseTotal : 1;
    });
  }
  return { ratios: out, fallbacks };
}

/** Extend per-cell ratios beyond lastYear linearly from the change over lastYear-4 to lastYear. */
export function extendRatios(ratios, lastYear, toYear) {
  const a = ratios[lastYear - 4];
  const b = ratios[lastYear];
  if (!a || !b) throw new Error(`extend: need ${lastYear - 4} and ${lastYear}`);
  let held = 0;
  for (let y = lastYear + 1; y <= toYear; y++) {
    ratios[y] = b.map((v, i) => {
      const step = (v - a[i]) / 4;
      const r = v + step * (y - lastYear);
      if (r < 0) {
        held += 1;
        return v;
      }
      return r;
    });
  }
  return held;
}

/** P(t) = base * G(t), cell by cell. */
export function applyRatios(base, ratios, years) {
  const out = {};
  for (const y of years) out[y] = base.map((v, i) => v * ratios[y][i]);
  return out;
}

/**
 * Scale every (sex, age, year) so the areas sum to the national target.
 * targets: { M: { [year]: number[91] }, F: ... }. Mutates and returns areas.
 */
export function rescaleToNational(areas, targets, years) {
  const codes = Object.keys(areas);
  let emptyCells = 0;
  for (const s of SEXES) {
    for (const y of years) {
      const target = targets[s][y];
      if (!target) throw new Error(`rescale: national target missing for ${s} ${y}`);
      for (let x = 0; x < 91; x++) {
        let sum = 0;
        for (const c of codes) sum += areas[c][s][y][x];
        if (sum <= 0) {
          emptyCells += 1;
          continue;
        }
        const f = target[x] / sum;
        for (const c of codes) areas[c][s][y][x] *= f;
      }
    }
  }
  return { emptyCells };
}

/** Sum predecessor areas into successors; predecessors are removed. */
export function aggregateSuccessors(areaMap, successors) {
  const out = new Map(areaMap);
  for (const [succ, preds] of Object.entries(successors)) {
    const present = preds.filter((p) => out.has(p));
    if (present.length === 0) continue;
    if (present.length !== preds.length) {
      throw new Error(`successor ${succ}: only ${present.length} of ${preds.length} predecessors present`);
    }
    const first = out.get(present[0]);
    const sum = { name: null, years: {} };
    for (const y of Object.keys(first.years)) {
      sum.years[y] = zeros();
      for (const p of present) {
        const row = out.get(p).years[y];
        for (let i = 0; i < 91; i++) sum.years[y][i] += row[i];
      }
    }
    for (const p of present) out.delete(p);
    out.set(succ, sum);
  }
  return out;
}

export const range = (a, b) => Array.from({ length: b - a + 1 }, (_, i) => a + i);
