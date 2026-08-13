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

  it("truncates the areas that ran away and leaves the rest alone", () => {
    let truncated = 0;
    let full = 0;
    for (const area of Object.values(areas)) {
      if (isTruncated(area)) truncated += 1;
      else full += 1;
    }
    // 108 of 320 when this guard was generalised from the residual categories to
    // every non-White-British group. The majority are still unaffected, which is
    // the point: this withholds divergence, it does not blank the site.
    expect(truncated).toBeGreaterThan(0);
    expect(full).toBeGreaterThan(truncated);
    expect(truncated + full).toBe(Object.keys(areas).length);
  });

  it("withholds Enfield past 2031, which published Other at 67% for 2051", () => {
    const enfield = Object.values(areas).find((a: any) => a.areaName === "Enfield");
    expect(enfield).toBeTruthy();
    expect(enfield.projections["2051"].other).toBeGreaterThan(60);
    expect(plausibleThrough(enfield)).toBe(2031);
    expect(publishableValue(enfield, 2051, enfield.projections["2051"].white_british)).toBeNull();
  });

  it("catches White Other running away, not just the residual categories", () => {
    // Barnsley: 4.27% White Other in 2021, projected 45.28% by 2061. A factor of
    // ten. This was published while Enfield's "Other" was being caught.
    const barnsley = Object.values(areas).find((a: any) => a.areaName === "Barnsley");
    expect(barnsley).toBeTruthy();
    expect(barnsley.projections["2061"].white_other).toBeGreaterThan(40);
    expect(isTruncated(barnsley)).toBe(true);
  });

  it("leaves a well-behaved area with its full horizon", () => {
    const pendle = Object.values(areas).find((a: any) => a.areaName === "Pendle");
    expect(pendle).toBeTruthy();
    expect(isTruncated(pendle)).toBe(false);
    expect(publishableValue(pendle, 2051, pendle.projections["2051"].white_british)).toBeCloseTo(
      pendle.projections["2051"].white_british
    );
  });
});
