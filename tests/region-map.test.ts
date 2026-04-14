import { describe, expect, it } from "vitest";
import { getPlaceDirectory } from "../src/lib/place-directory";
import { getRegionMapGeometry } from "../src/lib/region-map";

describe("region map geometry", () => {
  it("covers every public region in the place directory", () => {
    const directory = getPlaceDirectory();

    expect(directory.regions.length).toBeGreaterThan(0);
    expect(directory.regions.every((region) => getRegionMapGeometry(region.regionName))).toBe(true);
  });
});
