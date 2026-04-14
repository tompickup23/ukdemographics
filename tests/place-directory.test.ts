import { describe, expect, it } from "vitest";
import { getPlaceDirectory } from "../src/lib/place-directory";

describe("place directory", () => {
  it("builds region and place summaries for the public place layer", () => {
    const directory = getPlaceDirectory();

    expect(directory.publicPlaceCount).toBeGreaterThan(0);
    expect(directory.regions.length).toBeGreaterThan(0);
    expect(directory.featuredAreas.length).toBeGreaterThan(0);
    expect(directory.regions[0].supportedAsylum).toBeGreaterThanOrEqual(directory.regions[1].supportedAsylum);
    expect(directory.regions.every((region) => region.publicPlaceCount === region.areas.length)).toBe(true);
    expect(directory.regions.every((region) => region.anchorId.startsWith("region-"))).toBe(true);
    expect(directory.regions.every((region) => region.regionSlug.length > 0)).toBe(true);
    expect(directory.regions.every((region) => region.regionPath.startsWith("/places/regions/"))).toBe(true);
    expect(directory.featuredAreas[0].nationalRank).toBeGreaterThan(0);
    expect(directory.featuredAreas.every((row) => row.hotelSummary.length > 0)).toBe(true);
  });

  it("carries named hotel evidence into the relevant place rows", () => {
    const directory = getPlaceDirectory();
    const westNorthamptonshire = directory.regions
      .flatMap((region) => region.areas)
      .find((row) => row.area.areaCode === "E06000062");

    expect(westNorthamptonshire?.namedCurrentSiteCount).toBe(3);
    expect(westNorthamptonshire?.hotelSignal).toBe("named");
    expect(westNorthamptonshire?.hotelSummary).toContain("3 named current sites");
  });
});
