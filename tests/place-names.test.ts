import fs from "node:fs";
import { describe, expect, it } from "vitest";
import identities from "../src/data/lookups/place-identities.json";
import { buildPlaceListing, profileUpdatedDate, type PlaceCoverage } from "../src/lib/search-listing";
import { councilName, placeRedirects, plainPlaceName, placeSameAs, alternateNames } from "../src/lib/place-names";
import { buildPlaceStructuredData, getPublicPlaceAreas, slugifyAreaName } from "../src/lib/site";
import config from "../astro.config.mjs";

const places = getPublicPlaceAreas();
const builtPaths = new Set(places.map((p) => `/places/${slugifyAreaName(p.areaName)}/`));

describe("plain names (R360)", () => {
  it("drops the ONS suffix for the three councils that carry one", () => {
    expect(plainPlaceName("E06000023", "Bristol, City of")).toBe("Bristol");
    expect(plainPlaceName("E06000010", "Kingston upon Hull, City of")).toBe("Kingston upon Hull");
    expect(plainPlaceName("E06000019", "Herefordshire, County of")).toBe("Herefordshire");
    expect(councilName("E06000023")).toBe("Bristol City Council");
    expect(councilName("E06000010")).toBe("Hull City Council");
    expect(councilName("E06000019")).toBe("Herefordshire Council");
  });

  it("leaves every other name as ONS publishes it", () => {
    const renamed = Object.keys((identities as any).plainNames);
    for (const p of places) {
      if (renamed.includes(p.areaCode)) continue;
      expect(plainPlaceName(p.areaCode, p.areaName)).toBe(p.areaName);
      expect(councilName(p.areaCode)).toBeNull();
    }
    // Only a trailing ", City of" or ", County of" is a suffix; no other name has one.
    for (const p of places) {
      if (/, (City|County) of$/.test(p.areaName)) expect(renamed).toContain(p.areaCode);
    }
  });

  it("keeps the arm B listing format with only the name changed", () => {
    const coverage: PlaceCoverage = {
      areaName: "Bristol, City of", censusYear: 2021, projectionTo: 2051, hasReligion: true,
      hasCountryOfBirth: true, arrivalsSince: 2002, hasHousing: true, hasSchools: true, hasServices: true,
    };
    const updated = profileUpdatedDate();
    const ons = buildPlaceListing(coverage, updated);
    const plain = buildPlaceListing({ ...coverage, areaName: plainPlaceName("E06000023", coverage.areaName) }, updated);
    expect(plain.title).toBe(ons.title.replace("Bristol, City of", "Bristol"));
    expect(plain.description).toBe(ons.description.replace("Bristol, City of", "Bristol"));
    expect(plain.title).toMatch(/^Bristol demographics \d{4}: population, ethnicity and projections to 2051$/);
  });

  it("puts sameAs on every place and alternateName where the name changed", () => {
    for (const p of places) {
      const nodes = buildPlaceStructuredData(p, {
        canonicalUrl: `https://ukdemographics.co.uk/places/${slugifyAreaName(p.areaName)}/`,
        description: "d",
        socialImageUrl: "s",
        snapshotDate: "2026-08-14",
      });
      const area = nodes.find((n: any) => n["@type"] === "AdministrativeArea" && n.identifier) as any;
      expect(area.name).toBe(plainPlaceName(p.areaCode, p.areaName));
      expect(area.sameAs).toEqual(placeSameAs(p.areaCode));
      expect(area.sameAs[0]).toMatch(/^https:\/\/www\.wikidata\.org\/wiki\/Q\d+$/);
      if (alternateNames(p.areaCode).length) {
        expect(area.alternateName).toContain(p.areaName);
      } else {
        expect(area.alternateName).toBeUndefined();
      }
    }
  });

  it("every place has exactly one Wikidata item, recorded with its query and access date", () => {
    const w = identities as any;
    expect(Object.keys(w.areas).sort()).toEqual(places.map((p) => p.areaCode).sort());
    expect(w.wikidata.accessed).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(w.wikidata.query).toMatch(/P836/);
  });
});

describe("redirect stubs for natural URLs", () => {
  const redirects = (config as any).redirects as Record<string, string>;

  it("each natural URL points at a page the site builds, and none shadows one", () => {
    const stubs = placeRedirects();
    expect(Object.keys(stubs).sort()).toEqual([
      "/places/bristol/",
      "/places/herefordshire/",
      "/places/hull/",
      "/places/kings-lynn-and-west-norfolk/",
      "/places/kingston-upon-hull/",
    ]);
    for (const [from, to] of Object.entries(stubs)) {
      expect(builtPaths.has(to), to).toBe(true);
      expect(builtPaths.has(from), from).toBe(false);
      expect(redirects[from]).toBe(to);
    }
  });

  it("keeps the redirects that were there before", () => {
    expect(redirects["/places/shepway/"]).toBe("/places/folkestone-and-hythe/");
    expect(redirects["/findings/109-areas-minority-wbi-2051/"]).toBe("/findings/86-areas-minority-wbi-2051/");
  });

  it("the place template reads the plain name for title, H1 and breadcrumb", () => {
    const tpl = fs.readFileSync("src/pages/places/[slug].astro", "utf8");
    expect(tpl).toMatch(/<h1>\{displayName\}<\/h1>/);
    expect(tpl).toMatch(/areaName: displayName,/);
    expect(tpl).toMatch(/\{ label: displayName \}/);
  });
});
