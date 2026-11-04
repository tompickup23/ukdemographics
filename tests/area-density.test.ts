import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { KNOWN_MISSING, densityAnswerLines, getAreaDensity } from "../src/lib/area-density";
import { placeCodes, placeRows } from "../src/lib/place-downloads";

/**
 * Area, density and median age from ONS MYE5 and MYE6. No published figure is pinned:
 * an annual refresh must pass without editing this file. What is checked is coverage,
 * provenance and agreement with the other tables in the same workbook.
 */

const read = (p: string) => JSON.parse(fs.readFileSync(path.resolve(p), "utf8"));
const density = read("src/data/live/ons-mye5-density.json");
const estimates = read("src/data/live/population-estimates.json");
const manifest = read("data/raw/manifests/ons_mye5_density.json");
const myeManifest = read("data/raw/manifests/ons_mye.json");
const siteCodes = Object.keys(read("src/data/live/ethnic-projections.json").areas);
const DASHES = /[\u2013\u2014]| - /;

describe("ons-mye5-density.json", () => {
  it("has a row for every place, or lists it as known missing with a reason", () => {
    const missing = new Map(KNOWN_MISSING.map((m) => [m.code, m.reason]));
    for (const code of siteCodes) {
      if (missing.has(code)) {
        expect(getAreaDensity(code), code).toBeUndefined();
        expect(missing.get(code)!.length, code).toBeGreaterThan(10);
      } else {
        expect(getAreaDensity(code), `${code} has no MYE5 row and is not in KNOWN_MISSING`).toBeDefined();
      }
    }
    expect([...density.missing].sort()).toEqual([...missing.keys()].sort());
    expect(Object.keys(density.areas).every((c) => siteCodes.includes(c))).toBe(true);
  });

  it("names the workbook it was built from, by the manifest's hash", () => {
    expect(density.source.fileSha256).toBe(manifest.current.fileSha256);
    expect(density.source.fileSha256).toBe(estimates.source.fileSha256);
    expect(manifest.current.fileSha256).toBe(myeManifest.current.fileSha256);
    const last = manifest.attempts[manifest.attempts.length - 1];
    expect(last.url).toBe(manifest.current.sourceUrl);
    expect(last.url).not.toMatch(/nomisweb/);
    expect(last.blob_sha256).toBe(manifest.current.fileSha256);
    expect(density.source.tables.MYE5).toMatch(/^MYE5: Population density/);
    expect(density.source.tables.MYE6).toMatch(/^MYE6: Median age/);
    expect(density.source.published).toMatch(/^\d{1,2} [A-Z][a-z]+ \d{4}$/);
    expect(manifest.edition.published).toBe(density.source.published);
    expect(estimates.source.published).toContain(density.source.published);
    expect(density.source.referenceDate).toBe(estimates.source.referenceDate);
  });

  it("agrees with MYE4 and MYE6 as already held in population-estimates.json", () => {
    for (const [code, a] of Object.entries(density.areas) as [string, any][]) {
      expect(a.population, code).toBe(estimates.areas[code].population);
      expect(a.medianAge, code).toBe(estimates.areas[code].medianAge);
    }
  });

  it("publishes a density that is the population over the land area, rounded", () => {
    for (const [code, a] of Object.entries(density.areas) as [string, any][]) {
      expect(a.areaSqKm, code).toBeGreaterThan(0);
      expect(Number.isInteger(a.densityPerSqKm), code).toBe(true);
      // ONS divides the unrounded figures; the area here is published to four places.
      expect(Math.abs(a.population / a.areaSqKm - a.densityPerSqKm), code).toBeLessThanOrEqual(0.51);
      expect(a.medianAge, code).toBeGreaterThan(15);
      expect(a.medianAge, code).toBeLessThan(70);
      expect(a.locators.density, code).toMatch(/^v1:xlsx:sheet=MYE5;row=\d+$/);
    }
  });

  it("states the unit and that no conversion was made, with no dashes", () => {
    expect(density.units.areaSqKm).toMatch(/square kilometres/);
    expect(density.units.areaSqKm).toMatch(/no conversion/);
    expect(fs.readFileSync(path.resolve("src/data/live/ons-mye5-density.json"), "utf8")).not.toMatch(DASHES);
  });
});

describe("density answer lines and CSV rows", () => {
  it("names the table and edition on each line, and nothing for an unknown code", () => {
    for (const code of siteCodes) {
      const d = getAreaDensity(code);
      if (!d) continue;
      const [densityLine, ageLine] = densityAnswerLines(code);
      expect(densityLine.text).toBe(`Density: ${d.densityPerSqKm.toLocaleString("en-GB")} people per sq km`);
      expect(densityLine.source).toBe(`ONS ${d.period} population estimates, MYE5 (area and density), published ${manifest.edition.published}`);
      expect(ageLine.text).toBe(`Median age: ${d.medianAge.toFixed(1)}`);
      expect(ageLine.source).toBe(`ONS ${d.period} population estimates, MYE6 (median age), published ${manifest.edition.published}`);
      for (const line of [densityLine, ageLine]) expect(`${line.text} (${line.source})`).not.toMatch(DASHES);
    }
    expect(densityAnswerLines("E99999999")).toEqual([]);
    expect(getAreaDensity("E99999999")).toBeUndefined();
  });

  it("re-reads area and density into the place CSV from the held file", () => {
    for (const code of placeCodes()) {
      const d = getAreaDensity(code);
      const rows = placeRows(code);
      const area = rows.find((r) => r.measure === "land_area");
      const dens = rows.find((r) => r.measure === "population_density");
      if (!d) {
        expect(area).toBeUndefined();
        expect(dens).toBeUndefined();
        continue;
      }
      expect(area?.value, code).toBe(d.areaSqKm);
      expect(dens?.value, code).toBe(d.densityPerSqKm);
      expect(dens?.source_id).toBe("ons-mye5");
      expect(String(dens?.source_locator)).toMatch(/^sheet=MYE5;row=\d+$/);
    }
  });
});
