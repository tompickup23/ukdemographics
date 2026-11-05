import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  MYE_BASE_YEAR,
  MYE_LATEST_YEAR,
  MYE_PUBLISHED,
  MYE_SOURCE_LINE,
  MYE_SERIES_SOURCE_LINE,
  coveredSeries,
  placeEstimate,
} from "../src/lib/population-headline";
import { getParentUtla } from "../src/lib/area-hierarchy";
import { PLACE_COUNT } from "../src/lib/coverage";

/**
 * Population first (decision R359, 4 November 2026). Every figure is re-read from the
 * held file here rather than pinned, so the annual refresh passes without editing this
 * test. The rendered order on the built pages is checked in tests/desktop-layout.spec.ts.
 */
const read = (p: string) => JSON.parse(fs.readFileSync(path.resolve(p), "utf8"));
const estimates = read("src/data/live/population-estimates.json");
const BRISTOL = "E06000023", BURNLEY = "E07000117", CAMBRIDGE = "E07000008";

describe("population headline helpers", () => {
  it("reads the year and the publication date from the workbook's own note", () => {
    expect(MYE_LATEST_YEAR).toBe(estimates.latestYear);
    expect(MYE_PUBLISHED).not.toBeNull();
    expect(estimates.source.published).toContain(MYE_PUBLISHED);
    expect(MYE_SOURCE_LINE).toBe(`ONS mid-${estimates.latestYear} population estimate, table MYE4, published ${MYE_PUBLISHED}`);
    expect(MYE_SERIES_SOURCE_LINE).toContain("MYE4");
    expect(MYE_SERIES_SOURCE_LINE).toContain(`published ${MYE_PUBLISHED}`);
  });

  it("gives each fixture its latest estimate and change since 2011 from the one series", () => {
    expect(getParentUtla(CAMBRIDGE)).not.toBeNull(); // a district that falls back to its county
    for (const code of [BRISTOL, BURNLEY, CAMBRIDGE]) {
      const s = estimates.areas[code].series;
      const e = placeEstimate(code)!;
      expect(e.population, code).toBe(s[String(MYE_LATEST_YEAR)]);
      expect(e.population, code).toBe(estimates.areas[code].population);
      expect(e.basePopulation, code).toBe(s[String(MYE_BASE_YEAR)]);
      expect(e.change, code).toBe(s[String(MYE_LATEST_YEAR)] - s[String(MYE_BASE_YEAR)]);
      expect(e.changePct, code).toBeCloseTo((e.change / e.basePopulation) * 100, 10);
      expect(e.medianAge, code).toBe(estimates.areas[code].medianAge ?? null);
    }
  });

  it("returns null for a code the file does not hold", () => {
    expect(placeEstimate("E99999999")).toBeNull();
  });

  it("sums the covered areas to the workbook's England and Wales row in every year", () => {
    const codes = Object.keys(estimates.areas);
    expect(codes.length).toBe(PLACE_COUNT);
    const series = coveredSeries(codes);
    expect(series.areas).toBe(PLACE_COUNT);
    expect(series.points.map((p) => p.year)).toEqual(
      Array.from({ length: MYE_LATEST_YEAR - MYE_BASE_YEAR + 1 }, (_, i) => MYE_BASE_YEAR + i)
    );
    for (const p of series.points) {
      expect(p.population, String(p.year)).toBe(estimates.countries.K04000001.series[String(p.year)]);
    }
  });

  it("refuses to sum a set of areas that lacks a year", () => {
    expect(() => coveredSeries(["E99999999"])).toThrow(/no mid-2011 figure/);
  });
});

describe("homepage and place page templates", () => {
  const home = fs.readFileSync(path.resolve("src/pages/index.astro"), "utf8");
  const place = fs.readFileSync(path.resolve("src/pages/places/[slug].astro"), "utf8");

  it("names population in the homepage's first chart heading", () => {
    const firstH2 = /<h2[^>]*>([\s\S]*?)<\/h2>/.exec(home)?.[1] ?? "";
    expect(firstH2).toMatch(/^Population\b/);
  });

  it("leads the homepage stat row with population, before the White British share", () => {
    const strip = home.slice(home.indexOf('class="impact-strip-inner"'));
    expect(strip.indexOf("impact-item--population")).toBeGreaterThan(0);
    expect(strip.indexOf("impact-item--population")).toBeLessThan(strip.indexOf("White British share"));
  });

  it("drops the care and health demand promise from the homepage", () => {
    expect(home).not.toMatch(/health\s+demand/i);
    expect(home).not.toMatch(/care\s+demand/i);
    expect(home).not.toMatch(/care\s+and\s+health/i);
  });

  it("renders the mid-year estimate before the Census paragraph in the answer box", () => {
    const box = place.slice(place.indexOf('<section class="place-answer"'));
    expect(box.indexOf("placeMye.population")).toBeGreaterThan(0);
    expect(box.indexOf("placeMye.population")).toBeLessThan(box.indexOf("{directAnswer}"));
  });
});
