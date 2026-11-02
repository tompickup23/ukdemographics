import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  DEFAULT_SOCIAL_IMAGE_PATH,
  SITE_NAME,
  SITE_URL,
  buildPlaceStructuredData,
  buildAbsoluteUrl,
  buildReleaseCollectionStructuredData,
  getIndexableSitePaths,
  normalisePageTitle
} from "../src/lib/site";
import { getAllPcons } from "../src/lib/pcon-data";

describe("site metadata helpers", () => {
  it("normalises page titles without duplicating the site name", () => {
    expect(normalisePageTitle("National")).toBe("National | UK Demographics");
    expect(normalisePageTitle("National | UK Demographics")).toBe("National | UK Demographics");
  });

  it("uses the correct site identity", () => {
    expect(SITE_NAME).toBe("UK Demographics");
    expect(SITE_URL).toBe("https://ukdemographics.co.uk");
  });

  it("builds absolute URLs on the production domain", () => {
    expect(buildAbsoluteUrl("/national/")).toBe(`${SITE_URL}/national/`);
  });

  it("returns unique indexable paths", () => {
    const paths = getIndexableSitePaths();

    expect(paths.length).toBeGreaterThanOrEqual(6);
    expect(new Set(paths).size).toBe(paths.length);
    expect(paths).toContain("/");
    expect(paths).toContain("/places/");
    // Asylum-specific pages should not exist
    expect(paths).not.toContain("/routes/");
    expect(paths).not.toContain("/entities/");
    expect(paths).not.toContain("/spending/");
    expect(paths).not.toContain("/councils/");
  });

  it("defaults social images to the 1200x630 PNG card", () => {
    // Social platforms do not render SVG for og:image. The PNG is rendered from
    // public/og-card.svg by scripts/media/render-og-card.mjs.
    expect(DEFAULT_SOCIAL_IMAGE_PATH).toBe("/og-card.png");
    const png = fs.readFileSync(path.resolve("public/og-card.png"));
    expect(png.subarray(1, 4).toString("ascii")).toBe("PNG");
    expect(png.readUInt32BE(16)).toBe(1200);
    expect(png.readUInt32BE(20)).toBe(630);
  });

  it("builds release collection structured data with an item list", () => {
    const nodes = buildReleaseCollectionStructuredData(
      [
        {
          date: "2026-04-14",
          title: "UK Demographics launch",
          summary: "Initial release with 320 LA projections.",
          sourceUrl: "https://ukdemographics.co.uk"
        }
      ],
      {
        canonicalUrl: buildAbsoluteUrl("/releases/"),
        description: "Release diary",
        socialImageUrl: buildAbsoluteUrl("/og-card.png")
      }
    );

    expect(nodes).toHaveLength(3);
    expect(nodes[1]["@type"]).toBe("CollectionPage");
    expect(nodes[2]["@type"]).toBe("ItemList");
  });

  it("identifies place data as observed Census data plus modelled projections", () => {
    const nodes = buildPlaceStructuredData(
      {
        areaCode: "E08000025",
        areaName: "Birmingham",
        regionName: "West Midlands",
        countryName: "England",
        population: 1_144_922
      },
      {
        canonicalUrl: buildAbsoluteUrl("/places/birmingham/"),
        description: "Birmingham demographic profile.",
        socialImageUrl: buildAbsoluteUrl("/media/places/birmingham/population-2025-og.png"),
        snapshotDate: "2026-08-14"
      }
    );

    const dataset = nodes.find((node) => node["@type"] === "Dataset");
    expect(dataset?.measurementTechnique).toContain("ONS Census 2021 observations");
    expect(dataset?.citation).toEqual(expect.arrayContaining([
      expect.objectContaining({ url: "https://www.ons.gov.uk/census" })
    ]));
  });
});

describe("sitemap covers the generated pages", () => {
  it("lists every constituency page", () => {
    const paths = new Set(getIndexableSitePaths());
    const pcons = getAllPcons();

    // 632 constituency pages sat outside the sitemap until 20 Aug 2026.
    expect(pcons.length).toBeGreaterThan(500);
    for (const pcon of pcons) {
      expect(paths.has(`/constituencies/${pcon.slug}/`)).toBe(true);
    }
  });

  it("advertises far more than the hand-listed static routes", () => {
    expect(getIndexableSitePaths().length).toBeGreaterThan(900);
  });
});

describe("site-wide links", () => {
  // A link without the trailing slash 301s on GitHub Pages, on every click.
  it("gives every header menu link its trailing slash", () => {
    const header = fs.readFileSync(path.resolve("src/components/SiteHeader.astro"), "utf8");
    const hrefs = [...header.matchAll(/href: "([^"]+)"/g)].map((m) => m[1]);
    expect(hrefs.length).toBeGreaterThan(10);
    for (const href of hrefs) expect(href, href).toMatch(/^\/(?:[a-z0-9-]+\/)*$/);
  });
});
