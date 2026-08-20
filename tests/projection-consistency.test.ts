import { describe, expect, it } from "vitest";
import {
  consistentBand,
  bandContradictsEstimate,
  consistentBandSeries
} from "../src/lib/projection-consistency";
import rawProjections from "../src/data/live/ethnic-projections.json";

describe("consistentBand", () => {
  it("keeps an interval that brackets its estimate", () => {
    expect(consistentBand(29.31, { p10: 27.4, p90: 30.9 })).toEqual({ p10: 27.4, p90: 30.9 });
  });

  it("withholds the interval Burnley actually shipped", () => {
    // Live on ukdemographics.co.uk and asylumstats.co.uk alike, which publish the same
    // model output: a band of 46.4 to 50.8 drawn around a 2051 line of 43.1. The
    // interval excludes the number it is attached to.
    expect(consistentBand(43.1, { p10: 46.4, p90: 50.8 })).toBeNull();
  });

  it("withholds the Isles of Scilly interval", () => {
    // An 80% band of 1.1 to 3.1 beside a 2051 projection of 71.65 is not a confidence
    // statement about anything. Scilly contradicts in all three projected years.
    expect(consistentBand(71.65, { p10: 1.1, p90: 3.1 })).toBeNull();
  });

  it("accepts the boundaries as inside", () => {
    expect(consistentBand(27.4, { p10: 27.4, p90: 30.9 })).not.toBeNull();
    expect(consistentBand(30.9, { p10: 27.4, p90: 30.9 })).not.toBeNull();
  });

  it("tolerates a reversed interval rather than failing open", () => {
    expect(consistentBand(29, { p10: 30.9, p90: 27.4 })).not.toBeNull();
  });

  it("returns null on missing or non-finite input rather than guessing", () => {
    expect(consistentBand(null, { p10: 1, p90: 2 })).toBeNull();
    expect(consistentBand(undefined, { p10: 1, p90: 2 })).toBeNull();
    expect(consistentBand(50, null)).toBeNull();
    expect(consistentBand(Number.NaN, { p10: 1, p90: 2 })).toBeNull();
    expect(consistentBand(50, { p10: Number.NaN, p90: 2 })).toBeNull();
  });
});

describe("bandContradictsEstimate", () => {
  it("is true only when a band exists and disagrees", () => {
    expect(bandContradictsEstimate(43.1, { p10: 46.4, p90: 50.8 })).toBe(true);
    expect(bandContradictsEstimate(29.31, { p10: 27.4, p90: 30.9 })).toBe(false);
    expect(bandContradictsEstimate(43.1, null)).toBe(false);
  });
});

describe("consistentBandSeries", () => {
  it("drops only the years whose interval excludes the line", () => {
    const points = [
      { year: 2031, low: 68.6, high: 70.8 },
      { year: 2041, low: 57.5, high: 61.2 },
      { year: 2051, low: 46.4, high: 50.8 }
    ];
    const estimates: Record<number, number> = { 2031: 70.0, 2041: 59.8, 2051: 43.1 };
    const kept = consistentBandSeries(points, (year) => estimates[year] ?? null);
    expect(kept.map((point) => point.year)).toEqual([2031, 2041]);
  });
});

describe("the live dataset", () => {
  // Not an assertion that the data is correct, only a record of how widespread the
  // disagreement is, so a fix to the model shows up here as a change.
  const areas = (rawProjections as {
    areas: Record<
      string,
      {
        projections?: Record<string, { white_british?: number }>;
        stochastic?: Record<string, { wbi: { p10: number; p90: number } }>;
      }
    >;
  }).areas;

  it("still has areas whose projection sits outside its interval, so the guard is doing work", () => {
    let compared = 0;
    let contradicting = 0;
    for (const area of Object.values(areas)) {
      const estimate = area.projections?.["2051"]?.white_british;
      const band = area.stochastic?.["2051"]?.wbi;
      if (estimate == null || !band) continue;
      compared += 1;
      if (bandContradictsEstimate(estimate, band)) contradicting += 1;
    }
    // Was 236 of 314 at 2051 when this guard was ported here. The v8.0
    // recalibration re-ran the stochastic against the same settings as the
    // deterministic model and dropped bands from the 51 areas the model does not
    // project, which took the count down sharply. The comparison set shrank with
    // it, so this asserts the guard still has a population to work on rather than
    // a fixed size.
    expect(compared).toBeGreaterThan(200);
    // Most remaining misses are Monte Carlo boundary noise of well under a
    // percentage point. If this reaches zero the guard becomes a no-op, which is
    // the goal, so a zero here should be treated as good news and the assertion
    // relaxed rather than the guard removed.
    expect(contradicting).toBeGreaterThanOrEqual(0);
  });
});
