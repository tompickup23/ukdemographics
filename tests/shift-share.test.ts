/**
 * The shift-share decomposition on every place page must be computed from the
 * Census fields beside it. Until October 2026 the 2011 totals were all zero
 * and scripts/model/compute_shift_share.mjs fell back to a typed 80%, so every
 * page published a national effect of -6.4pp that the data did not support.
 * Nothing here pins a figure: each check recomputes from the file.
 */
import { describe, expect, it } from "vitest";
import rawProjections from "../src/data/live/ethnic-projections.json";

interface Point {
  year: number;
  total_population: number;
  groups: Record<string, number>;
  groups_absolute?: Record<string, number>;
}
interface Area {
  areaName: string;
  baseline: Point;
  current: Point;
  shiftShare?: {
    totalChangePp: number;
    nationalEffectPp: number;
    structuralEffectPp: number;
    localEffectPp: number;
    dominantDriver: string;
  };
}

const areas = (rawProjections as unknown as { areas: Record<string, Area> }).areas;
const compared = Object.entries(areas).filter(([, a]) => a.baseline.year !== a.current.year);

function nationalChange(): number {
  let wb11 = 0, wb21 = 0, t11 = 0, t21 = 0;
  for (const [, a] of compared) {
    wb11 += a.baseline.groups_absolute?.white_british ?? 0;
    wb21 += a.current.groups_absolute?.white_british ?? 0;
    t11 += a.baseline.total_population;
    t21 += a.current.total_population;
  }
  return (wb21 / t21) * 100 - (wb11 / t11) * 100;
}

describe("shift-share decomposition", () => {
  it("covers every area with a 2011 baseline", () => {
    const missing = compared.filter(([, a]) => !a.shiftShare).map(([c, a]) => `${c} ${a.areaName}`);
    expect(missing).toEqual([]);
  });

  it("uses the national change computed from the file's own Census counts", () => {
    const expected = Math.round(nationalChange() * 10) / 10;
    const wrong = compared
      .filter(([, a]) => a.shiftShare && a.shiftShare.nationalEffectPp !== expected)
      .map(([c, a]) => `${c} ${a.areaName}: ${a.shiftShare!.nationalEffectPp}`);
    expect(wrong.length, `national effect should be ${expected}pp; first: ${wrong.slice(0, 5).join("; ")}`).toBe(0);
  });

  it("has a total change equal to the 2011 to 2021 White British change shown on the page", () => {
    const wrong = compared
      .filter(([, a]) => a.shiftShare)
      .filter(([, a]) => {
        const change = a.current.groups.white_british - a.baseline.groups.white_british;
        return Math.abs(a.shiftShare!.totalChangePp - change) > 0.051;
      })
      .map(([c, a]) => `${c} ${a.areaName}: ${a.shiftShare!.totalChangePp}`);
    expect(wrong).toEqual([]);
  });

  it("has three components that add up to the total, within rounding", () => {
    const wrong = compared
      .filter(([, a]) => a.shiftShare)
      .filter(([, a]) => {
        const s = a.shiftShare!;
        return Math.abs(s.nationalEffectPp + s.structuralEffectPp + s.localEffectPp - s.totalChangePp) > 0.151;
      })
      .map(([c, a]) => `${c} ${a.areaName}`);
    expect(wrong).toEqual([]);
  });
});
