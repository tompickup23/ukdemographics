import { describe, expect, it } from "vitest";
import { describeRank, percentileRank } from "../src/lib/percentile";
import { getNinoTotalPercentile } from "../src/lib/nino-data";
import { getCrimeRatePercentile } from "../src/lib/crime-data";
import { getAscSpendPercentile } from "../src/lib/asc-data";
import { getSendGrowthPercentile } from "../src/lib/send-data";
import nino from "../src/data/live/nino-dashboard.json";
import crime from "../src/data/live/crime-dashboard.json";
import asc from "../src/data/live/asc-dashboard.json";
import send from "../src/data/live/send-dashboard.json";

const words = (r: ReturnType<typeof percentileRank>) => {
  const w = describeRank(r!);
  return w.lead + w.emphasis;
};
const range = (n: number) => Array.from({ length: n }, (_, i) => i + 1);

describe("percentile wording", () => {
  it("never prints a 0th or 100th percentile", () => {
    for (const n of [5, 50, 152, 199, 200, 201, 318, 500]) {
      const values = range(n);
      for (const v of values) {
        const text = words(percentileRank(values, v));
        expect(text, `${v} of ${n}`).not.toMatch(/\b0th\b|\b100th\b/);
      }
    }
  });

  it("names the lowest and highest areas by rank", () => {
    const values = range(318);
    expect(words(percentileRank(values, 1))).toBe("lowest of 318 areas");
    expect(words(percentileRank(values, 2))).toBe("2nd lowest of 318 areas");
    expect(words(percentileRank(values, 318))).toBe("highest of 318 areas");
    // 316 of 318 below rounds to 99, so the second highest keeps its percentile here...
    expect(words(percentileRank(values, 317))).toBe("at the 99th percentile");
    // ...but with 500 areas 498 below rounds to 100, so it gets a rank instead.
    expect(words(percentileRank(range(500), 499))).toBe("2nd highest of 500 areas");
    expect(words(percentileRank(values, 230))).toBe("at the 72nd percentile");
  });

  it("says joint where areas tie at an end", () => {
    expect(words(percentileRank([1, 1, 2, 3], 1))).toBe("joint lowest of 4 areas");
    expect(words(percentileRank([1, 2, 3, 3], 3))).toBe("joint highest of 4 areas");
  });

  it("leaves out areas with no value and gives no rank to an area without one", () => {
    expect(percentileRank([null, 1, 2, undefined, 3], 1)).toEqual({ percentile: 0, below: 0, above: 2, n: 3 });
    expect(percentileRank([1, 2, 3], null)).toBeNull();
    expect(percentileRank([], 1)).toBeNull();
  });
});

describe("percentile sections on place pages", () => {
  const files: Array<[string, Record<string, unknown>, (code: string) => ReturnType<typeof percentileRank>]> = [
    ["NINo", (nino as any).areas, getNinoTotalPercentile],
    ["crime", (crime as any).areas, getCrimeRatePercentile],
    ["ASC", (asc as any).areas, getAscSpendPercentile],
    ["SEND", (send as any).areas, getSendGrowthPercentile],
  ];

  for (const [name, areas, rank] of files) {
    it(`${name}: no area is described as the 0th or 100th percentile`, () => {
      for (const code of Object.keys(areas)) {
        const r = rank(code);
        if (r) expect(words(r), `${name} ${code}`).not.toMatch(/\b0th\b|\b100th\b/);
      }
    });

    it(`${name}: exactly one area, or a tie, is the lowest`, () => {
      const lowest = Object.keys(areas).filter((c) => rank(c)?.below === 0);
      expect(lowest.length, name).toBeGreaterThan(0);
      for (const c of lowest) expect(words(rank(c)), `${name} ${c}`).toMatch(/lowest of/);
    });
  }
});
