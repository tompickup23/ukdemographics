import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import config from "../astro.config.mjs";
import { buildPlaceListing, modelProvenance, profileUpdatedDate, type PlaceCoverage } from "../src/lib/search-listing";
import { plainPlaceName } from "../src/lib/place-names";
import { placeCodes, placeCsvDate, placeCsvFor, placeCsvPath } from "../src/lib/place-downloads";
import {
  DATA_LICENCE_URL,
  buildAbsoluteUrl,
  buildHubStructuredData,
  buildPlaceStructuredData,
  getPublicPlaceAreas,
  slugifyAreaName,
} from "../src/lib/site";
import { publicCounties, countyPath } from "../src/lib/counties";
import { getAllPcons } from "../src/lib/pcon-data";

const places = getPublicPlaceAreas();
const ONS_SUFFIX = /, (City|County) of$/;
const DASHES = /[\u2013\u2014]|\s-\s/;
const mye = JSON.parse(fs.readFileSync(path.resolve("src/data/live/population-estimates.json"), "utf8"));
const projections = JSON.parse(fs.readFileSync(path.resolve("src/data/live/ethnic-projections.json"), "utf8"));
const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
/** "29 July 2026" anywhere in a publication note, as ISO. */
function isoFromNote(note: string): string {
  const m = /(\d{1,2}) ([A-Z][a-z]+) (\d{4})/.exec(note);
  if (!m || !MONTHS.includes(m[2])) throw new Error(`no publication date in "${note}"`);
  return `${m[3]}-${String(MONTHS.indexOf(m[2]) + 1).padStart(2, "0")}-${m[1].padStart(2, "0")}`;
}

function placeNodes(p: (typeof places)[number]) {
  const csv = placeCsvFor(p.areaCode);
  return buildPlaceStructuredData(p, {
    canonicalUrl: buildAbsoluteUrl(`/places/${slugifyAreaName(p.areaName)}/`),
    description: "d",
    socialImageUrl: "s",
    snapshotDate: profileUpdatedDate()!,
    csv: csv ? { path: csv, dateModified: placeCsvDate() } : null,
    modelVersion: modelProvenance().version,
  }) as any[];
}

describe("plain names in every title, H1 and breadcrumb", () => {
  it("no place title or H1 ends with an ONS suffix", () => {
    const full: Omit<PlaceCoverage, "areaName"> = {
      censusYear: 2021, projectionTo: 2051, hasReligion: true, hasCountryOfBirth: true,
      arrivalsSince: 2002, hasHousing: true, hasSchools: true, hasServices: true,
    };
    for (const p of places) {
      const h1 = plainPlaceName(p.areaCode, p.areaName);
      expect(h1, p.areaName).not.toMatch(ONS_SUFFIX);
      const { title } = buildPlaceListing({ ...full, areaName: h1 }, profileUpdatedDate());
      expect(title, title).not.toMatch(/, (City|County) of\b/);
      expect(title, title).toMatch(new RegExp(`^${h1.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")} demographics \\d{4}: `));
      const crumbs = placeNodes(p).find((n) => n["@type"] === "BreadcrumbList").itemListElement;
      expect(crumbs.at(-1).name).toBe(h1);
    }
  });

  it("the H1 subtitle gives the formal ONS name where the plain name differs", () => {
    const tpl = fs.readFileSync("src/pages/places/[slug].astro", "utf8");
    expect(tpl).toMatch(/displayName !== area\.areaName/);
    expect(tpl).toMatch(/ONS name: \{area\.areaName\}/);
  });
});

describe("place Dataset", () => {
  it("every place has a licence, its own CSV as distribution and dates read from the data", () => {
    const csvCodes = new Set(placeCodes());
    for (const p of places) {
      const ds = placeNodes(p).find((n) => n["@type"] === "Dataset");
      expect(ds.license).toBe(DATA_LICENCE_URL);
      expect(ds.dateModified).toBe(profileUpdatedDate());
      expect(ds.identifier).toBe(p.areaCode);
      expect(csvCodes.has(p.areaCode), p.areaName).toBe(true);
      expect(ds.distribution).toHaveLength(1);
      const dl = ds.distribution[0];
      expect(dl["@type"]).toBe("DataDownload");
      expect(dl.encodingFormat).toBe("text/csv");
      expect(dl.contentUrl).toBe(buildAbsoluteUrl(placeCsvPath(p.areaName)));
      expect(dl.dateModified).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      expect(JSON.stringify(ds)).not.toMatch(DASHES);
    }
  });

  it("the CSV date is the newest source publication, not a build date", () => {
    // The ONS mid-year estimates are the newest source in the CSV; their publication date
    // is read from the workbook's own note in population-estimates.json.
    expect(placeCsvDate()).toBe(isoFromNote(mye.source.published));
  });

  it("the Dataset version is the model version held in the projection file", () => {
    const version = modelProvenance().version;
    expect(version).not.toBeNull();
    expect(String(projections.modelVersion).startsWith(version!)).toBe(true);
    for (const p of places.slice(0, 5)) {
      expect(placeNodes(p).find((n) => n["@type"] === "Dataset").version).toBe(version);
    }
  });
});

describe("redirect stubs", () => {
  const redirects = (config as any).redirects as Record<string, string>;
  const findingPaths = new Set(
    fs.readdirSync(path.resolve("src/content/findings")).filter((f) => f.endsWith(".md")).map((f) => `/findings/${f.replace(/\.md$/, "")}/`)
  );
  const placePaths = new Set(places.map((p) => `/places/${slugifyAreaName(p.areaName)}/`));

  it("every stub's canonical target is a page the site builds", () => {
    expect(Object.keys(redirects).length).toBeGreaterThanOrEqual(8);
    for (const [from, to] of Object.entries(redirects)) {
      expect(placePaths.has(to) || findingPaths.has(to), `${from} to ${to}`).toBe(true);
      expect(placePaths.has(from) || findingPaths.has(from), from).toBe(false);
    }
  });

  it("covers the three natural URLs from the audit", () => {
    expect(redirects["/places/bristol/"]).toBe("/places/bristol-city-of/");
    expect(redirects["/places/kingston-upon-hull/"]).toBe("/places/kingston-upon-hull-city-of/");
    expect(redirects["/places/herefordshire/"]).toBe("/places/herefordshire-county-of/");
  });

  it("every plain name that slugs differently from its page has a stub", () => {
    for (const p of places) {
      const plain = `/places/${slugifyAreaName(plainPlaceName(p.areaCode, p.areaName))}/`;
      const real = `/places/${slugifyAreaName(p.areaName)}/`;
      if (plain !== real) expect(redirects[plain], plain).toBe(real);
    }
  });
});

describe("hub ItemList", () => {
  it("lists every item in order with absolute URLs", () => {
    const nodes = buildHubStructuredData({
      canonicalUrl: buildAbsoluteUrl("/places/counties/"),
      name: "County council areas",
      description: "d",
      trail: [{ name: "Places", path: "/places/" }, { name: "County council areas", path: "/places/counties/" }],
      items: publicCounties.map((c) => ({ name: c.name, path: countyPath(c.name) })),
    }) as any[];
    expect(nodes.map((n) => n["@type"])).toEqual(["BreadcrumbList", "CollectionPage", "ItemList"]);
    const list = nodes[2];
    expect(list.numberOfItems).toBe(publicCounties.length);
    expect(list.itemListElement[0]).toMatchObject({ "@type": "ListItem", position: 1, name: publicCounties[0].name });
    expect(list.itemListElement.at(-1).position).toBe(publicCounties.length);
    for (const item of list.itemListElement) expect(item.url).toMatch(/^https:\/\/ukdemographics\.co\.uk\/places\/counties\/[a-z0-9-]+\/$/);
    expect(nodes[1].mainEntity["@id"]).toBe(list["@id"]);
  });

  it("each hub page declares one", () => {
    for (const file of [
      "src/pages/places/index.astro",
      "src/pages/constituencies/index.astro",
      "src/pages/places/counties/index.astro",
      "src/pages/places/regions/[region].astro",
      "src/pages/findings/index.astro",
    ]) {
      const src = fs.readFileSync(file, "utf8");
      expect(src, file).toMatch(/buildHubStructuredData\(/);
      expect(src, file).toMatch(/structuredData=\{structuredData\}/);
    }
    expect(getAllPcons().length).toBeGreaterThan(600);
  });

  it("the sitemap dates the hubs from what they list", () => {
    const src = fs.readFileSync("src/pages/sitemap.xml.ts", "utf8");
    expect(src).toMatch(/"\/places\/": placeDate/);
    expect(src).toMatch(/"\/places\/counties\/": countyDate/);
    expect(src).toMatch(/"\/constituencies\/": pconDate/);
    expect(src).toMatch(/lastmod\.set\("\/findings\/", newestFinding\)/);
  });
});
