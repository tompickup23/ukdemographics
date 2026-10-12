/**
 * The shift-share decomposition on every place page must be computed from the
 * Census fields beside it. Until October 2026 the 2011 totals were all zero
 * and scripts/model/compute_shift_share.mjs fell back to a typed 80%, so every
 * page published a national effect of -6.4pp that the data did not support.
 * Nothing here pins a figure: each check recomputes from the file.
 */
import { describe, expect, it } from "vitest";
import rawProjections from "../src/data/live/ethnic-projections.json";
import { NO_DRIVER, SHIFT_SHARE_COMPONENT_NAMES, shiftShareDriver } from "../src/lib/shift-share-driver";

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

describe("shift-share dominant driver label", () => {
  const withShare = compared.filter(([, a]) => a.shiftShare);
  const nameToKey = new Map(SHIFT_SHARE_COMPONENT_NAMES.map(([k, n]) => [n, k]));

  it("never names a component that works against the total change as its driver", () => {
    const wrong = withShare
      .filter(([, a]) => {
        const s = a.shiftShare!;
        const label = shiftShareDriver(s);
        if (label === NO_DRIVER) return s.totalChangePp !== 0;
        const drivers = label.split(", offset by ")[0].replace(/, equally$/, "").split(" and ");
        return drivers.some((d) => Math.sign(s[nameToKey.get(d)!] as number) !== Math.sign(s.totalChangePp));
      })
      .map(([c, a]) => `${c} ${a.areaName}: ${shiftShareDriver(a.shiftShare!)}`);
    expect(wrong).toEqual([]);
  });

  it("names a component offsetting the change wherever one is at least as large as the driver", () => {
    const wrong = withShare
      .filter(([, a]) => {
        const s = a.shiftShare!;
        const sign = Math.sign(s.totalChangePp);
        const values = SHIFT_SHARE_COMPONENT_NAMES.map(([k]) => s[k] as number);
        const driver = Math.max(...values.filter((v) => Math.sign(v) === sign).map(Math.abs));
        const against = Math.max(0, ...values.filter((v) => Math.sign(v) === -sign).map(Math.abs));
        return (against >= driver) !== shiftShareDriver(s).includes(", offset by ");
      })
      .map(([c, a]) => `${c} ${a.areaName}`);
    expect(wrong).toEqual([]);
  });

  it("is the label stored in the data file", () => {
    const wrong = withShare
      .filter(([, a]) => a.shiftShare!.dominantDriver !== shiftShareDriver(a.shiftShare!))
      .map(([c, a]) => `${c} ${a.areaName}: stored "${a.shiftShare!.dominantDriver}", rule "${shiftShareDriver(a.shiftShare!)}"`);
    expect(wrong).toEqual([]);
  });

  it("handles the cases the data does not currently hold", () => {
    const base = { totalChangePp: -7.6, nationalEffectPp: -6.2, structuralEffectPp: -0.5, localEffectPp: -1 };
    expect(shiftShareDriver(base)).toBe("national trend");
    // A local effect raising the share by more than the national trend lowered it.
    expect(shiftShareDriver({ totalChangePp: -0.2, nationalEffectPp: -6.2, structuralEffectPp: -1.2, localEffectPp: 7.2 }))
      .toBe("national trend, offset by local migration");
    // A local effect leading the fall.
    expect(shiftShareDriver({ totalChangePp: -20, nationalEffectPp: -6.2, structuralEffectPp: 2, localEffectPp: -15.8 }))
      .toBe("local migration");
    // Age structure leading.
    expect(shiftShareDriver({ totalChangePp: -4, nationalEffectPp: -1, structuralEffectPp: -2.5, localEffectPp: -0.5 }))
      .toBe("age structure");
    // A rise in the share is driven by whatever raised it.
    expect(shiftShareDriver({ totalChangePp: 1.5, nationalEffectPp: -6.2, structuralEffectPp: 0.7, localEffectPp: 7 }))
      .toBe("local migration");
    expect(shiftShareDriver({ totalChangePp: -11.3, nationalEffectPp: -6.2, structuralEffectPp: 1, localEffectPp: -6.2 }))
      .toBe("national trend and local migration, equally");
    expect(shiftShareDriver({ totalChangePp: 0, nationalEffectPp: -6.2, structuralEffectPp: 0, localEffectPp: 6.2 })).toBe(NO_DRIVER);
  });
});
