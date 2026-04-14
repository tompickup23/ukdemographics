import { describe, expect, it } from "vitest";
import { getPlaceDirectory } from "../src/lib/place-directory";
import { getPublicPlaceAreas } from "../src/lib/site";
import { getPublicSearchEntries } from "../src/lib/site-search";

describe("site search index", () => {
  it("returns the place-led static pages and public place profiles", () => {
    const entries = getPublicSearchEntries();
    const publicPlaces = getPublicPlaceAreas();
    const placeDirectory = getPlaceDirectory();
    const pageEntries = entries.filter((entry) => entry.kind === "page");
    const regionEntries = entries.filter((entry) => entry.kind === "region");
    const placeEntries = entries.filter((entry) => entry.kind === "place");

    expect(pageEntries.map((entry) => entry.href)).toContain("/");
    expect(pageEntries.map((entry) => entry.href)).toContain("/places/");
    expect(pageEntries.map((entry) => entry.href)).toContain("/compare/");
    expect(pageEntries.map((entry) => entry.href)).not.toContain("/entities/");
    expect(pageEntries.map((entry) => entry.href)).not.toContain("/hotels/");
    expect(regionEntries).toHaveLength(placeDirectory.regions.length);
    expect(regionEntries.some((entry) => entry.href === "/places/regions/north-west/")).toBe(true);
    expect(regionEntries.some((entry) => entry.searchText.includes("regional pressure"))).toBe(true);
    expect(placeEntries).toHaveLength(publicPlaces.length);
    expect(placeEntries.every((entry) => entry.href.startsWith("/places/"))).toBe(true);
    expect(placeEntries.some((entry) => entry.searchText.includes("local authority"))).toBe(true);
    expect(placeEntries.map((entry) => entry.href)).toContain("/places/birmingham/");
  });
});
