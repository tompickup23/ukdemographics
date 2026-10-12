import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

/**
 * Shape and cross-source checks for the ONS mid-year estimates layer.
 *
 * No published figure is pinned here: an annual refresh must pass without editing this
 * file. What is checked is that the file agrees with itself and with the workbook's own
 * country rows, which is what would catch a mis-parsed column or a dropped area.
 */

const read = (p: string) => JSON.parse(fs.readFileSync(path.resolve(p), "utf8"));
const estimates = read("src/data/live/population-estimates.json");
const manifest = read("data/raw/manifests/ons_mye.json");
const siteCodes = Object.keys(read("src/data/live/ethnic-projections.json").areas);
const areas = Object.entries(estimates.areas) as [string, any][];

describe("population-estimates.json", () => {
  it("covers every site area and nothing else", () => {
    expect(Object.keys(estimates.areas).sort()).toEqual([...siteCodes].sort());
    expect(estimates.counts.areasEmitted).toBe(siteCodes.length);
  });

  it("names the file it was built from, by the manifest's hash", () => {
    expect(estimates.source.fileSha256).toBe(manifest.current.fileSha256);
    expect(estimates.source.title).toMatch(/Mid-Year Population Estimates/);
    expect(estimates.source.published).toMatch(/originally published/);
  });

  it("sums to the England and Wales row in the same workbook", () => {
    const total = areas.reduce((s, [, a]) => s + a.population, 0);
    expect(total).toBe(estimates.countries.K04000001.population);
    const england = areas.filter(([c]) => c.startsWith("E")).reduce((s, [, a]) => s + a.population, 0);
    expect(england).toBe(estimates.countries.E92000001.population);
  });

  it("agrees with itself for every area", () => {
    for (const [code, a] of areas) {
      const bands = Object.values(a.ageBands as Record<string, number>).reduce((s, v) => s + v, 0);
      expect(bands, code).toBe(a.population);
      expect(a.allAgesCheck, code).toBe(a.population);
      expect(a.series[String(estimates.latestYear)], code).toBe(a.population);
      expect(a.ci95.lower, code).toBeLessThanOrEqual(a.population);
      expect(a.ci95.upper, code).toBeGreaterThanOrEqual(a.population);
      expect(a.locators.population, code).toMatch(/^v1:xlsx:sheet=MYE4;row=\d+$/);
    }
  });

  it("keeps the revised mid-2022 to mid-2024 values in the series", () => {
    for (const [code, a] of areas) {
      for (const y of ["2022", "2023", "2024"]) {
        expect(a.series[y], `${code} ${y}`).toBe(a.revisions[y].revisedJuly2026);
      }
    }
  });
});
