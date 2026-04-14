import { describe, expect, it } from "vitest";
import { getPlaceDirectory } from "../src/lib/place-directory";
import { buildPlaceRegionMapViews } from "../src/lib/region-map-explorer";
import { getRegionPressureSummaries } from "../src/lib/route-analytics";
import { loadLocalRouteLatest } from "../src/lib/route-data";

describe("region map explorer", () => {
  it("builds the three core place-led regional views", () => {
    const placeDirectory = getPlaceDirectory();
    const regionalPressure = getRegionPressureSummaries(loadLocalRouteLatest().areas);
    const views = buildPlaceRegionMapViews(placeDirectory, regionalPressure);

    expect(views.map((view) => view.id)).toEqual(["supported_total", "supported_rate", "hotel_visibility"]);
    expect(views.every((view) => view.items.length === placeDirectory.regions.length)).toBe(true);
  });

  it("describes hotel visibility as a publication footprint rather than a full hotel map", () => {
    const placeDirectory = getPlaceDirectory();
    const regionalPressure = getRegionPressureSummaries(loadLocalRouteLatest().areas);
    const hotelView = buildPlaceRegionMapViews(placeDirectory, regionalPressure).find(
      (view) => view.id === "hotel_visibility"
    );

    expect(hotelView?.legendBody).toMatch(/publication footprint/i);
    expect(hotelView?.valueLabel).toBe("place pages with hotel evidence");
  });

  it("builds selected-region summaries with stats, next links, and an evidence note", () => {
    const placeDirectory = getPlaceDirectory();
    const regionalPressure = getRegionPressureSummaries(loadLocalRouteLatest().areas);
    const totalView = buildPlaceRegionMapViews(placeDirectory, regionalPressure).find((view) => view.id === "supported_total");
    const northWestSummary = totalView?.summaries?.["North West"];

    expect(northWestSummary?.stats?.length).toBeGreaterThan(0);
    expect(northWestSummary?.links?.length).toBeGreaterThan(0);
    expect(northWestSummary?.note).toMatch(/latest named public site|publication gap/i);
  });
});
