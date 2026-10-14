import { describe, expect, it } from "vitest";
import { getEthnicCompositionTimeline } from "../src/lib/ethnic-projections";
import rawProjections from "../src/data/live/ethnic-projections.json";

const areas = (rawProjections as any).areas as Record<string, any>;

describe("ethnic composition timeline", () => {
  const codes = Object.keys(areas);

  it("has one point per year for every area", () => {
    for (const code of codes) {
      const years = getEthnicCompositionTimeline(code)!.map((p) => p.year);
      expect(new Set(years).size, `${areas[code].areaName}: ${years.join(", ")}`).toBe(years.length);
    }
  });

  it("is sorted by year", () => {
    for (const code of codes) {
      const years = getEthnicCompositionTimeline(code)!.map((p) => Number(p.year));
      expect(years, areas[code].areaName).toEqual([...years].sort((a, b) => a - b));
    }
  });

  it("keeps every observed and projected year the data holds", () => {
    for (const code of codes) {
      const a = areas[code];
      const expected = new Set([String(a.baseline.year), String(a.current.year), ...Object.keys(a.projections)]);
      const years = getEthnicCompositionTimeline(code)!.map((p) => p.year);
      expect(new Set(years), a.areaName).toEqual(expected);
    }
  });

  it("shows the current Census, not a projection or the baseline, in the Census year", () => {
    for (const code of codes) {
      const a = areas[code];
      const point = getEthnicCompositionTimeline(code)!.find((p) => p.year === String(a.current.year))!;
      expect(point.isProjection, a.areaName).toBe(false);
      expect(point.groups, a.areaName).toEqual(a.current.census_groups);
    }
  });

  it("shows both Censuses for every area, the councils formed since 2011 included", () => {
    // Until October 2026 eleven councils had a 2021 baseline and so one observed point.
    for (const code of codes) {
      const observed = getEthnicCompositionTimeline(code)!.filter((p) => !p.isProjection).map((p) => p.year);
      expect(observed, areas[code].areaName).toEqual(["2011", "2021"]);
    }
  });

  it("returns null for an unknown area", () => {
    expect(getEthnicCompositionTimeline("E99999999")).toBeNull();
  });
});
