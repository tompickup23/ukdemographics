import { describe, expect, it } from "vitest";
import {
  getAreasBelowWhiteBritishMajority,
  getSignificantDemographicShifts
} from "../src/lib/ethnic-projections";
import rawProjections from "../src/data/live/ethnic-projections.json";

const areas = (rawProjections as any).areas as Record<string, any>;
const wb = (a: any, year: number) => a?.projections?.[String(year)]?.white_british;
const wbNow = (a: any) => a?.current?.groups?.white_british;

describe("areas below a White British majority", () => {
  it("counts every area under 50% in the year, not only the ones that cross into it", () => {
    // The bug this guards: the homepage and the national page both counted
    // threshold crossings under a label promising a stock. An area already under
    // 50% at the 2021 Census records no crossing, so 33 of them, Birmingham and
    // Leicester and Luton and Slough among them, were missing from a published
    // count of areas under 50%. The site said 60 where the projections say 92.
    const below = getAreasBelowWhiteBritishMajority(2051);
    const crossings = getSignificantDemographicShifts(2051);
    const alreadyBelow = Object.values(areas).filter((a) => wbNow(a) < 50).length;

    expect(below.count).toBe(crossings.length + alreadyBelow - 1);
    expect(below.count).toBeGreaterThan(crossings.length);
  });

  it("agrees with a direct scan of the projections", () => {
    for (const year of [2031, 2041, 2051, 2061]) {
      const direct = Object.values(areas).filter((a) => wb(a, year) != null && wb(a, year) < 50);
      const covered = Object.values(areas).filter((a) => wb(a, year) != null);
      const result = getAreasBelowWhiteBritishMajority(year);
      expect(result.count).toBe(direct.length);
      expect(result.covered).toBe(covered.length);
    }
  });

  it("reports 2061 coverage below the full area count, so a caller cannot imply otherwise", () => {
    // 269 of 318. Any 2061 figure on this site is a figure about those 269, and a
    // count that does not carry its denominator invites the comparison that is wrong.
    const y2061 = getAreasBelowWhiteBritishMajority(2061);
    const y2051 = getAreasBelowWhiteBritishMajority(2051);
    expect(y2051.covered).toBe(Object.keys(areas).length);
    expect(y2061.covered).toBeLessThan(y2051.covered);
  });
});

describe("national White British share", () => {
  // The bug this guards: 2061 summed a numerator over the 269 areas the model
  // reaches and divided it by the population of all 318, counting the missing 49
  // as areas with no White British in them. It published 39.1% where the areas it
  // actually covers give 45.9%. Those 49 are 14.9% of the population and average
  // 89% White British, so the error was large and one-directional.
  const weighted = (year: number | "now") => {
    let num = 0;
    let den = 0;
    for (const a of Object.values(areas)) {
      const pop = a?.current?.total_population ?? 0;
      const share = year === "now" ? wbNow(a) : wb(a, year);
      if (!pop || share == null) continue;
      num += share * pop;
      den += pop;
    }
    return num / den;
  };

  it("divides each year by the population of the areas that year covers", () => {
    const fullPop = Object.values(areas).reduce(
      (s, a) => s + (a?.current?.total_population ?? 0), 0);
    const pop2061 = Object.values(areas).reduce(
      (s, a) => s + (wb(a, 2061) != null ? (a?.current?.total_population ?? 0) : 0), 0);

    expect(pop2061).toBeLessThan(fullPop);
    // The figure the site publishes, and the one the broken denominator produced.
    expect(weighted(2061)).toBeCloseTo(45.9, 1);
    expect(weighted(2061) * (pop2061 / fullPop)).toBeCloseTo(39.1, 1);
  });

  it("keeps a 2061 comparison on the geography 2061 covers", () => {
    // 55.1% in 2051 across 318 areas against 45.9% in 2061 across 269 is not a
    // decade of change. On the 269 the step is 52.9 to 45.9.
    let num51 = 0;
    let den = 0;
    for (const a of Object.values(areas)) {
      const pop = a?.current?.total_population ?? 0;
      if (!pop || wb(a, 2061) == null || wb(a, 2051) == null) continue;
      num51 += wb(a, 2051) * pop;
      den += pop;
    }
    expect(num51 / den).toBeCloseTo(52.9, 1);
    expect(weighted(2051)).toBeCloseTo(55.1, 1);
  });
});
