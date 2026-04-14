import { describe, expect, it } from "vitest";
import {
  getCurrentLocalEvidencePoints,
  getFeaturedLocalEvidenceTimeline,
  getRegionLocalEvidenceAreaSummaries,
  getRegionLocalEvidenceLayers,
  getRegionLocalEvidenceTimeline
} from "../src/lib/local-evidence";

describe("local evidence layer", () => {
  it("builds current named local evidence points with region and place links", () => {
    const points = getCurrentLocalEvidencePoints();

    expect(points.length).toBeGreaterThan(0);
    expect(points.every((point) => point.regionHref.startsWith("/places/regions/"))).toBe(true);
    expect(points.some((point) => point.placeHref === "/places/E06000062/")).toBe(true);
  });

  it("groups current named sites by region for the lower-level evidence layer", () => {
    const eastMidlands = getRegionLocalEvidenceLayers().find((layer) => layer.regionName === "East Midlands");

    expect(eastMidlands?.currentNamedSiteCount).toBe(3);
    expect(eastMidlands?.uniqueAreaCount).toBe(1);
    expect(eastMidlands?.points.every((point) => point.regionName === "East Midlands")).toBe(true);
  });

  it("builds a dated regional timeline for named local evidence", () => {
    const eastMidlandsTimeline = getRegionLocalEvidenceTimeline("East Midlands");

    expect(eastMidlandsTimeline.length).toBeGreaterThan(0);
    expect(eastMidlandsTimeline[0].lastPublicDateLabel).toBeTruthy();
    expect(eastMidlandsTimeline.every((point) => point.regionName === "East Midlands")).toBe(true);
  });

  it("groups named local evidence by area for region pages", () => {
    const eastMidlandsAreas = getRegionLocalEvidenceAreaSummaries("East Midlands");

    expect(eastMidlandsAreas.length).toBeGreaterThan(0);
    expect(eastMidlandsAreas[0].latestPublicDateLabel).toBeTruthy();
    expect(eastMidlandsAreas[0].siteNames.length).toBeGreaterThan(0);
    expect(eastMidlandsAreas[0].placeHref).toBe("/places/E06000062/");
  });

  it("features one dated lead local evidence row per visible region", () => {
    const featured = getFeaturedLocalEvidenceTimeline();

    expect(featured.length).toBeGreaterThan(0);
    expect(new Set(featured.map((point) => point.regionName)).size).toBe(featured.length);
    expect(featured.every((point) => point.lastPublicDateLabel.length > 0)).toBe(true);
  });
});
