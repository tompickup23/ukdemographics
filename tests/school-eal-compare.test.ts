/**
 * District pages compare the district's share of pupils with a first language
 * other than English with the published figure for its county. Until October
 * 2026 they always said the county figure was "much lower", which in 2025/26 was
 * untrue on most of the pages that said it. Nothing here pins a figure.
 */
import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import district from "../src/data/live/school-eal-district.json";
import upperTier from "../src/data/live/school-eal.json";
import { compareCountyEal, SIMILAR_WITHIN_PP } from "../src/lib/school-eal-compare";

const districts = (district as any).areas as Record<string, any>;
const counties = (upperTier as any).areas as Record<string, any>;
const year = (district as any).academicYear as string;
const shown = Object.entries(districts).filter(
  ([code, d]) => d.totalPupils > 0 && d.parentUtlaName && d.parentUtlaName !== d.areaName && d.parentUtlaCode !== code,
);

describe("county comparison rule", () => {
  it("calls a difference under the threshold similar, on the printed one-decimal figures", () => {
    expect(SIMILAR_WITHIN_PP).toBe(1);
    expect(compareCountyEal(10.0, 10.9, "2025/26", "2025/26")!.direction).toBe("similar");
    expect(compareCountyEal(10.0, 10.96, "2025/26", "2025/26")!.direction).toBe("higher"); // prints 11.0
    expect(compareCountyEal(10.0, 11.0, "2025/26", "2025/26")!.direction).toBe("higher");
    expect(compareCountyEal(12.0, 11.0, "2025/26", "2025/26")!.direction).toBe("lower");
    expect(compareCountyEal(12.0, 11.06, "2025/26", "2025/26")!.direction).toBe("similar"); // prints 11.1
  });

  it("makes no comparison across academic years or with a missing figure", () => {
    expect(compareCountyEal(10, 20, "2025/26", "2024/25")).toBeNull();
    expect(compareCountyEal(10, 20, undefined, "2025/26")).toBeNull();
    expect(compareCountyEal(10, null, "2025/26", "2025/26")).toBeNull();
  });
});

describe("county comparison on district pages", () => {
  it("has a county figure for the same academic year on every district page that shows one", () => {
    const missing = shown.filter(([, d]) => counties[d.parentUtlaCode]?.latestYear !== year).map(([c, d]) => `${c} ${d.areaName}`);
    expect(missing).toEqual([]);
  });

  it("says higher, lower or similar as the printed figures show", () => {
    const tally = { higher: 0, lower: 0, similar: 0 };
    for (const [code, d] of shown) {
      const c = counties[d.parentUtlaCode];
      const r = compareCountyEal(d.ealPct, c.ealPct, year, c.latestYear)!;
      const diff = Number(c.ealPct.toFixed(1)) - Number(d.ealPct.toFixed(1));
      const expected = Math.abs(diff) < SIMILAR_WITHIN_PP - 1e-9 ? "similar" : diff > 0 ? "higher" : "lower";
      expect(r.direction, `${code} ${d.areaName}: district ${d.ealPct}, county ${c.ealPct}`).toBe(expected);
      tally[r.direction]++;
    }
    // The old sentence ("much lower") was wrong wherever the county is not lower.
    expect(tally.lower).toBeLessThan(shown.length);
  });

  it("no longer types the comparison into the page", () => {
    const page = fs.readFileSync(path.resolve("src/pages/places/[slug].astro"), "utf8");
    expect(page).not.toMatch(/much lower/);
  });
});
