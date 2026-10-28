import { describe, expect, it } from "vitest";
import { COLUMNS, SOURCES, placeCodes, placeCsvPath, placeRows, toCsv } from "../src/lib/place-downloads";
import { PLACE_COUNT } from "../src/lib/coverage";
import rawMye from "../src/data/live/population-estimates.json";
import rawProjections from "../src/data/live/ethnic-projections.json";

const mye = rawMye as unknown as { areas: Record<string, { series: Record<string, number>; population: number }> };
const model = rawProjections as unknown as { areas: Record<string, { areaName: string; current: { total_population: number; groups_absolute: Record<string, number> } }> };
// "MYE2 - Persons" is ONS's own sheet name, quoted verbatim.
const DASHES = /[\u2013\u2014]| - /;
const unquoteSheet = (s: string) => s.replaceAll("MYE2 - Persons", "");

describe("place CSV downloads", () => {
  it("covers every place, with one file path each", () => {
    expect(placeCodes()).toHaveLength(PLACE_COUNT);
    const paths = new Set(placeCodes().map((c) => placeCsvPath(model.areas[c].areaName)));
    expect(paths.size).toBe(PLACE_COUNT);
  });

  it("names a known source on every row, and carries no projection or score", () => {
    const ids = new Set(SOURCES.map((s) => s.id));
    for (const code of placeCodes()) {
      const rows = placeRows(code);
      expect(rows.length).toBeGreaterThan(20);
      for (const r of rows) {
        expect(ids.has(String(r.source_id))).toBe(true);
        expect(Number.isFinite(Number(r.value))).toBe(true);
        expect(String(r.measure)).not.toMatch(/project|score|health_demand/i);
      }
    }
  });

  it("re-reads each value from the held source files", () => {
    for (const code of placeCodes()) {
      const rows = placeRows(code);
      for (const [year, v] of Object.entries(mye.areas[code].series)) {
        expect(rows.find((r) => r.measure === "population_estimate" && r.period === `mid-${year}`)?.value).toBe(v);
      }
      const c = model.areas[code].current;
      const groups = rows.filter((r) => r.measure === "census_ethnic_group" && r.period === "Census 2021");
      expect(groups).toHaveLength(6);
      expect(groups.reduce((s, r) => s + Number(r.value), 0)).toBe(c.total_population);
    }
  });

  it("writes no dashes and no unquoted commas", () => {
    const all = toCsv(COLUMNS, placeCodes().flatMap(placeRows));
    expect(unquoteSheet(all)).not.toMatch(DASHES);
    const sources = toCsv(Object.keys(SOURCES[0]), SOURCES as unknown as Array<Record<string, string>>);
    expect(unquoteSheet(sources)).not.toMatch(DASHES);
    for (const line of all.trim().split("\n")) {
      const unquoted = line.replace(/"[^"]*"/g, "");
      expect(unquoted.split(",")).toHaveLength(COLUMNS.length);
    }
  });

  it("gives every source a URL, file and SHA-256", () => {
    for (const s of SOURCES) {
      expect(s.url).toMatch(/^https:\/\//);
      expect(s.file).not.toBe("");
      expect(s.sha256).toMatch(/^[0-9a-f]{64}$/);
    }
  });
});
