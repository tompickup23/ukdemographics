/**
 * The homepage's Census years are observed shares of England and Wales, each
 * weighted by its own population. The 2011 figure used to weight 2011 shares
 * by 2021 population and to count eleven authorities whose baseline is 2021,
 * which published 80.0% where Census 2011 KS201EW gives 80.5%. Nothing here
 * pins a figure: each check compares two sources for the same population.
 */
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import rawProjections from "../src/data/live/ethnic-projections.json";
import censusManifest from "../data/raw/manifests/census_ethnic_groups.json";
import { census2011WhiteBritish, census2021WhiteBritish } from "../src/lib/census-national";

const areas = (rawProjections as unknown as {
  areas: Record<string, { baseline: { year: number; total_population: number }; current: { total_population: number } }>;
}).areas;
const manifest = censusManifest as unknown as {
  englandAndWales?: Record<string, { areas: number; total: number; groups: Record<string, number> }>;
};

describe("Census national White British share", () => {
  it("has England and Wales totals for both Censuses in the manifest", () => {
    expect(manifest.englandAndWales?.["2011"]?.total ?? 0).toBeGreaterThan(0);
    expect(manifest.englandAndWales?.["2021"]?.total ?? 0).toBeGreaterThan(0);
  });

  it("2021 summed from the area records is the same population as TS021 for England and Wales", () => {
    const fromAreas = census2021WhiteBritish(Object.keys(areas));
    const ew = manifest.englandAndWales?.["2021"];
    expect(fromAreas).not.toBeNull();
    expect(fromAreas!.residents).toBe(ew?.total);
    expect(Math.abs(fromAreas!.pct - (ew!.groups.white_british / ew!.total) * 100)).toBeLessThan(0.005);
  });

  it("every area has a 2011 baseline, and the areas add up to England and Wales exactly", () => {
    // Since October 2026 the eleven councils formed after 2011 carry the sum of
    // their whole 2011 districts, so each 2011 district is counted once.
    const notIn2011 = Object.entries(areas).filter(([, a]) => a.baseline.year !== 2011).map(([c]) => c);
    expect(notIn2011).toEqual([]);
    const census2011 = census2011WhiteBritish();
    expect(census2011).not.toBeNull();
    const fileTotal = Object.values(areas).reduce((s, a) => s + a.baseline.total_population, 0);
    expect(fileTotal).toBe(56075912);
    expect(census2011!.residents).toBe(fileTotal);
  });

  it("the homepage takes its Census years from these helpers, not from baseline shares", () => {
    const page = readFileSync("src/pages/index.astro", "utf8");
    expect(page).toContain("census2011WhiteBritish()");
    expect(page).not.toMatch(/baseline\?*\.groups\?*\.white_british/);
  });
});
