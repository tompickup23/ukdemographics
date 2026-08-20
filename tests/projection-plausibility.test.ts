import { describe, expect, it } from "vitest";
import {
  yearHasDiverged,
  plausibleThrough,
  isTruncated,
  publishableValue,
  publishableYears,
} from "../src/lib/projection-plausibility";
import rawProjections from "../src/data/live/ethnic-projections.json";

const base = { other: 12.14, mixed: 6.5, white_british: 31.3 };

describe("yearHasDiverged", () => {
  it("flags a residual category above the ceiling and several times its base", () => {
    // Enfield 2051 as published: Other at 67.11 against a 2021 base of 12.14.
    expect(yearHasDiverged({ other: 67.11 }, base)).toBe(true);
  });

  it("does not flag ordinary growth below the ceiling", () => {
    expect(yearHasDiverged({ other: 18 }, base)).toBe(false);
  });

  it("does not flag a large share that was already large in 2021", () => {
    // A group at 30% that was 28% at the Census has not run away, it is just big.
    expect(yearHasDiverged({ other: 30 }, { other: 28 })).toBe(false);
  });

  it("flags growth from a zero base once it clears the ceiling", () => {
    expect(yearHasDiverged({ other: 26 }, { other: 0 })).toBe(true);
    expect(yearHasDiverged({ other: 24 }, { other: 0 })).toBe(false);
  });

  it("returns false rather than guessing when there is no data", () => {
    expect(yearHasDiverged(null, base)).toBe(false);
    expect(yearHasDiverged({}, base)).toBe(false);
  });
});

describe("plausibleThrough", () => {
  const area = (proj: Record<string, any>) => ({ projections: proj, current: { groups: base } });

  it("returns the last year before divergence", () => {
    expect(
      plausibleThrough(
        area({
          "2031": { other: 20 },
          "2041": { other: 24 },
          "2051": { other: 67 },
          "2061": { other: 82 },
        })
      )
    ).toBe(2041);
  });

  it("returns the final year when nothing diverges", () => {
    expect(
      plausibleThrough(area({ "2031": { other: 13 }, "2041": { other: 14 }, "2051": { other: 15 } }))
    ).toBe(2051);
  });

  it("returns null when even the first projected year has diverged", () => {
    expect(plausibleThrough(area({ "2031": { other: 70 } }))).toBeNull();
  });

  it("returns null for an area with no projections", () => {
    expect(plausibleThrough(null)).toBeNull();
    expect(plausibleThrough({} as any)).toBeNull();
  });
});

describe("publishableValue and publishableYears", () => {
  const area = {
    projections: { "2031": { other: 20 }, "2041": { other: 24 }, "2051": { other: 67 } },
    current: { groups: base },
  };

  it("passes a value inside the horizon and withholds one past it", () => {
    expect(publishableValue(area, 2041, 55.4)).toBe(55.4);
    expect(publishableValue(area, 2051, 6.1)).toBeNull();
  });

  it("never invents a value", () => {
    expect(publishableValue(area, 2031, null)).toBeNull();
  });

  it("filters a year list to the horizon", () => {
    expect(publishableYears(area, [2031, 2041, 2051, 2061])).toEqual([2031, 2041]);
  });
});

describe("the live dataset", () => {
  const areas = (rawProjections as { areas: Record<string, any> }).areas;

  // The v8.0 calibration fixed most divergence at source: the growth ceiling
  // selected on the out-of-sample test took runaway area-years from 177 to 19
  // and truncated areas from 108 to 14. These assertions therefore describe a
  // backstop, not the main defence, and deliberately avoid pinning to particular
  // areas so that a further model improvement does not fail the suite.

  it("leaves the great majority of areas with their full horizon", () => {
    let truncated = 0;
    for (const area of Object.values(areas)) if (isTruncated(area)) truncated += 1;
    expect(truncated).toBeLessThan(Object.keys(areas).length * 0.1);
  });

  it("still withholds anything that does diverge", () => {
    for (const area of Object.values(areas)) {
      const through = plausibleThrough(area);
      for (const year of [2031, 2041, 2051, 2061]) {
        const row = area.projections?.[String(year)];
        if (!row) continue;
        const withheld = through === null || year > through;
        if (yearHasDiverged(row, area.current?.groups)) {
          expect(withheld).toBe(true);
        }
      }
    }
  });

  it("publishes nothing where a group exceeds the ceiling off a small base", () => {
    let published = 0;
    for (const area of Object.values(areas)) {
      const through = plausibleThrough(area);
      if (through === null) continue;
      for (const year of [2031, 2041, 2051, 2061]) {
        if (year > through) continue;
        const row = area.projections?.[String(year)];
        if (row && yearHasDiverged(row, area.current?.groups)) published += 1;
      }
    }
    expect(published).toBe(0);
  });

  it("keeps a well-behaved area intact", () => {
    const pendle = Object.values(areas).find((a: any) => a.areaName === "Pendle");
    expect(pendle).toBeTruthy();
    expect(isTruncated(pendle)).toBe(false);
    expect(publishableValue(pendle, 2051, pendle.projections["2051"].white_british)).toBeCloseTo(
      pendle.projections["2051"].white_british
    );
  });
});
