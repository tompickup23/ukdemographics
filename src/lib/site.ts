import { publicCounties, countyPath, countyForDistrict } from "./counties";
import fs from "node:fs";
import path from "node:path";

import { getAllPcons } from "./pcon-data";
import { canonicalAreaCode } from "./area-codes";
import { formatPlaceCount } from "./coverage";
import { alternateNames, placeSameAs, plainPlaceName } from "./place-names";

export const SITE_NAME = "UK Demographics";
export const SITE_URL = "https://ukdemographics.co.uk";
export const DEFAULT_DESCRIPTION =
  `Population data for every community. Ethnic projections, school demand, housing pressure, and demographic change across ${formatPlaceCount()}. Every figure sourced from ONS, Census, and DfE data.`;
export const DEFAULT_SOCIAL_IMAGE_PATH = "/og-card.png";

export type StructuredDataNode = Record<string, unknown>;

export interface ReleaseEntry {
  date: string;
  title: string;
  summary: string;
  sourceUrl: string;
}

export interface DemographicAreaSummary {
  areaCode: string;
  areaName: string;
  regionName: string;
  countryName: string;
  population?: number;
  wbiPct2021?: number;
  wbiPct2041?: number;
  diversityIndex2021?: number;
  diversityIndex2041?: number;
}

const INDEXABLE_STATIC_PATHS = [
  "/",
  "/accessibility/",
  "/compare/",
  "/constituencies/",
  "/data/",
  "/findings/",
  "/glossary/",
  "/housing/",
  "/methodology/",
  "/migration/",
  "/national/",
  "/maps/",
  "/places/",
  "/places/counties/",
  "/pressure/",
  "/privacy/",
  "/regional/",
  "/releases/",
  "/schools/",
  "/sources/",
  "/terms/",
  "/your-area/"
] as const;

function slugifyRegionName(regionName: string): string {
  return regionName.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");
}

export function slugifyAreaName(areaName: string): string {
  return areaName.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");
}

export function buildPlacePath(area: { areaCode: string; areaName: string }): string {
  return `/places/${slugifyAreaName(area.areaName)}/`;
}

export function normalisePageTitle(title: string): string {
  return /uk\s*demographics/i.test(title) ? title : `${title} | ${SITE_NAME}`;
}

export function buildAbsoluteUrl(pathname: string): string {
  const normalizedPath = pathname.startsWith("/") ? pathname : `/${pathname}`;
  return new URL(normalizedPath, SITE_URL).toString();
}

export function buildPublicPlaceRegionSlug(regionName: string): string {
  return slugifyRegionName(regionName);
}

export function buildPublicPlaceRegionPath(regionName: string): string {
  return `/places/regions/${buildPublicPlaceRegionSlug(regionName)}/`;
}

/**
 * Return all areas from the ethnic projections dataset.
 * Unlike asylumstats (which filters by asylum support thresholds),
 * UK Demographics publishes every local authority with projection data.
 */
export function getPublicPlaceAreas(): DemographicAreaSummary[] {
  const dataPath = path.resolve("src/data/live/ethnic-projections.json");
  if (!fs.existsSync(dataPath)) return [];

  const raw = JSON.parse(fs.readFileSync(dataPath, "utf8"));
  const areas: DemographicAreaSummary[] = [];

  // Build region lookup from local-route-latest (only source of regionName)
  const regionLookup = new Map<string, { regionName: string; countryName: string }>();
  const routePath = path.resolve("src/data/live/local-route-latest.json");
  if (fs.existsSync(routePath)) {
    const routeData = JSON.parse(fs.readFileSync(routePath, "utf8"));
    // Home Office local route data files Barnsley and Sheffield under the codes
    // ONS reissued in 2025, while the projections are keyed on the codes the
    // Census 2021 model uses. Resolving here is what stops those two showing a
    // region of "Unknown" and dropping out of the regional summary.
    for (const routeArea of routeData.areas ?? []) {
      regionLookup.set(canonicalAreaCode(routeArea.areaCode), {
        regionName: routeArea.regionName ?? "Unknown",
        countryName: routeArea.countryName ?? "England",
      });
    }
  }

  // ethnic-projections.json has areas as object keyed by area code (e.g. "E08000025")
  if (raw.areas && typeof raw.areas === "object" && !Array.isArray(raw.areas)) {
    for (const [areaCode, areaData] of Object.entries(raw.areas)) {
      const data = areaData as Record<string, any>;
      const region = regionLookup.get(areaCode);
      areas.push({
        areaCode,
        areaName: data.areaName ?? areaCode,
        regionName: region?.regionName ?? "Unknown",
        countryName: region?.countryName ?? "England",
        population: data.current?.total_population,
        wbiPct2021: (data.current?.census_groups ?? data.current?.groups)?.white_british,
        wbiPct2041: data.projections?.["2041"]?.white_british,
        diversityIndex2021: data.diversityIndex?.entropy,
        diversityIndex2041: undefined,
      });
    }
  }

  return areas;
}

export function getPublicPlaceRegions(): Array<{ regionName: string; countryName: string; publicPlaceCount: number }> {
  const regionMap = new Map<string, { regionName: string; countryName: string; publicPlaceCount: number }>();

  for (const area of getPublicPlaceAreas()) {
    const existing =
      regionMap.get(area.regionName) ??
      {
        regionName: area.regionName,
        countryName: area.countryName,
        publicPlaceCount: 0
      };

    existing.publicPlaceCount += 1;
    regionMap.set(area.regionName, existing);
  }

  return [...regionMap.values()].sort((left, right) => left.regionName.localeCompare(right.regionName));
}

export function getIndexableSitePaths(): string[] {
  const paths = new Set<string>(INDEXABLE_STATIC_PATHS);
  for (const county of publicCounties) paths.add(countyPath(county.name));

  for (const region of getPublicPlaceRegions()) {
    paths.add(buildPublicPlaceRegionPath(region.regionName));
  }

  for (const area of getPublicPlaceAreas()) {
    paths.add(buildPlacePath(area));
  }

  // Constituency pages are generated by src/pages/constituencies/[slug].astro.
  // They were absent from the sitemap until 20 Aug 2026, which left 632 of the
  // site's 999 pages advertised nowhere and reachable only by crawl.
  for (const pcon of getAllPcons()) {
    paths.add(`/constituencies/${pcon.slug}/`);
  }

  return [...paths].sort((a, b) => a.localeCompare(b));
}

/** The licence the site's data is published under (/terms/ and /data/ say the same). */
export const DATA_LICENCE_URL = "https://www.nationalarchives.gov.uk/doc/open-government-licence/version/3/";

interface PlaceStructuredDataOptions {
  canonicalUrl: string;
  description: string;
  socialImageUrl: string;
  /** The date the profile's data was last revised, read from the data files. */
  snapshotDate: string;
  /** The place's CSV under /data/places/, where the site builds one. */
  csv?: { path: string; dateModified: string | null } | null;
  /** The projection model version, as the projection file states it. */
  modelVersion?: string | null;
}

export function buildPlaceStructuredData(
  area: DemographicAreaSummary,
  options: PlaceStructuredDataOptions
): StructuredDataNode[] {
  const areaId = `${options.canonicalUrl}#area`;
  const datasetId = `${options.canonicalUrl}#dataset`;
  // Plain name first ("Bristol"), with the ONS name and others as alternateName
  // and the Wikidata item for the area code as sameAs (R360, place-names.ts).
  const name = plainPlaceName(area.areaCode, area.areaName);
  const alternates = alternateNames(area.areaCode);
  const sameAs = placeSameAs(area.areaCode);

  return [
    {
      "@context": "https://schema.org",
      "@type": "BreadcrumbList",
      itemListElement: [
        {name: "Home", item: SITE_URL},
        {name: "Places", item: buildAbsoluteUrl("/places/")},
        {name: area.regionName, item: buildAbsoluteUrl(buildPublicPlaceRegionPath(area.regionName))},
        ...(countyForDistrict(area.areaCode) ? [{name: countyForDistrict(area.areaCode)!.countyName, item: buildAbsoluteUrl(countyPath(countyForDistrict(area.areaCode)!.countyName))}] : []),
        {name, item: options.canonicalUrl}
      ].map((item,index)=>({"@type":"ListItem",position:index+1,...item}))
    },
    {
      "@context": "https://schema.org",
      "@type": "AdministrativeArea",
      "@id": areaId,
      name,
      ...(alternates.length ? { alternateName: alternates } : {}),
      identifier: area.areaCode,
      ...(sameAs.length ? { sameAs } : {}),
      address: {
        "@type": "PostalAddress",
        addressRegion: area.regionName,
        addressCountry: area.countryName
      },
      containedInPlace: [
        {
          "@type": "AdministrativeArea",
          name: area.regionName
        },
        {
          "@type": "Country",
          name: area.countryName
        }
      ],
      subjectOf: {
        "@id": datasetId
      }
    },
    {
      "@context": "https://schema.org",
      "@type": "Dataset",
      "@id": datasetId,
      name: `${name} demographic profile`,
      description: options.description,
      url: options.canonicalUrl,
      identifier: area.areaCode,
      isAccessibleForFree: true,
      license: DATA_LICENCE_URL,
      dateModified: options.snapshotDate,
      ...(options.modelVersion ? { version: options.modelVersion } : {}),
      includedInDataCatalog: {
        "@type": "DataCatalog",
        name: "UK Demographics data downloads",
        url: buildAbsoluteUrl("/data/")
      },
      ...(options.csv ? {
        distribution: [{
          "@type": "DataDownload",
          name: `${name}: population estimates and Census ethnic group counts`,
          encodingFormat: "text/csv",
          contentUrl: buildAbsoluteUrl(options.csv.path),
          license: DATA_LICENCE_URL,
          ...(options.csv.dateModified ? { dateModified: options.csv.dateModified } : {})
        }]
      } : {}),
      temporalCoverage: "2021/2051",
      measurementTechnique: [
        "ONS Census 2021 observations",
        "Hamilton-Perry cohort change ratio projection model"
      ],
      spatialCoverage: {
        "@id": areaId
      },
      citation: [
        {
          "@type": "CreativeWork",
          name: "ONS Census 2021",
          url: "https://www.ons.gov.uk/census"
        },
        {
          "@type": "WebPage",
          name: "UK Demographics methodology and limitations",
          url: buildAbsoluteUrl("/methodology/")
        }
      ],
      creator: {
        "@id": `${SITE_URL}/#organization`
      },
      publisher: {
        "@id": `${SITE_URL}/#organization`
      },
      keywords: [
        "population projections",
        "ethnic composition",
        "demographic change",
        "Census 2021",
        name
      ],
      variableMeasured: [
        "Ethnic composition",
        "Population projections",
        "Diversity index",
        "Fertility rates",
        "Migration patterns"
      ]
    }
  ];
}

interface ConstituencyStructuredDataOptions {
  canonicalUrl: string;
  description: string;
  snapshotDate: string | null;
  generalElectionYear: number | null;
}

/**
 * Constituency pages get the same shape as places: a breadcrumb, the area and a
 * Dataset whose description is the page's meta description.
 */
export function buildConstituencyStructuredData(
  pcon: { code: string; name: string; country: string },
  options: ConstituencyStructuredDataOptions
): StructuredDataNode[] {
  const areaId = `${options.canonicalUrl}#area`;
  const datasetId = `${options.canonicalUrl}#dataset`;
  const ge = options.generalElectionYear;

  return [
    {
      "@context": "https://schema.org",
      "@type": "BreadcrumbList",
      itemListElement: [
        { "@type": "ListItem", position: 1, name: "Home", item: SITE_URL },
        { "@type": "ListItem", position: 2, name: "Constituencies", item: buildAbsoluteUrl("/constituencies/") },
        { "@type": "ListItem", position: 3, name: pcon.name, item: options.canonicalUrl }
      ]
    },
    {
      "@context": "https://schema.org",
      "@type": "AdministrativeArea",
      "@id": areaId,
      name: `${pcon.name} (UK Parliament constituency)`,
      identifier: pcon.code,
      containedInPlace: { "@type": "Country", name: pcon.country },
      subjectOf: { "@id": datasetId }
    },
    {
      "@context": "https://schema.org",
      "@type": "Dataset",
      "@id": datasetId,
      name: `${pcon.name} constituency profile`,
      description: options.description,
      url: options.canonicalUrl,
      isAccessibleForFree: true,
      ...(options.snapshotDate ? { dateModified: options.snapshotDate } : {}),
      measurementTechnique: [
        ge != null ? `UK Parliament general election results, ${ge}` : "UK Parliament general election results",
        "DWP Stat-Xplore Personal Independence Payment claimant counts",
        "Local authority Census 2021 profiles aggregated by postcode share and population"
      ],
      spatialCoverage: { "@id": areaId },
      citation: [
        { "@type": "WebPage", name: "UK Parliament Members API", url: "https://members-api.parliament.uk/" },
        { "@type": "WebPage", name: "DWP Stat-Xplore", url: "https://stat-xplore.dwp.gov.uk/" },
        { "@type": "CreativeWork", name: "ONS Census 2021", url: "https://www.ons.gov.uk/census" },
        { "@type": "WebPage", name: "UK Demographics methodology and limitations", url: buildAbsoluteUrl("/methodology/") }
      ],
      creator: { "@id": `${SITE_URL}/#organization` },
      publisher: { "@id": `${SITE_URL}/#organization` },
      keywords: ["constituency profile", "general election result", "PIP claimants", "demographics", pcon.name],
      variableMeasured: [
        "Sitting MP",
        "General election vote shares",
        "PIP claimants",
        "Ethnic composition (derived)",
        "Country of birth (derived)"
      ]
    }
  ];
}

interface ReleaseCollectionStructuredDataOptions {
  canonicalUrl: string;
  description: string;
  socialImageUrl: string;
}

export function buildReleaseCollectionStructuredData(
  releases: ReleaseEntry[],
  options: ReleaseCollectionStructuredDataOptions
): StructuredDataNode[] {
  const listId = `${options.canonicalUrl}#release-list`;

  return [
    {
      "@context": "https://schema.org",
      "@type": "BreadcrumbList",
      itemListElement: [
        {
          "@type": "ListItem",
          position: 1,
          name: "Home",
          item: SITE_URL
        },
        {
          "@type": "ListItem",
          position: 2,
          name: "Releases",
          item: options.canonicalUrl
        }
      ]
    },
    {
      "@context": "https://schema.org",
      "@type": "CollectionPage",
      name: "UK Demographics release diary",
      description: options.description,
      url: options.canonicalUrl,
      mainEntity: {
        "@id": listId
      },
      about: [
        "UK population projections",
        "ethnic composition data",
        "demographic research releases"
      ]
    },
    {
      "@context": "https://schema.org",
      "@type": "ItemList",
      "@id": listId,
      name: "Release diary entries",
      numberOfItems: releases.length,
      itemListOrder: "https://schema.org/ItemListOrderDescending",
      itemListElement: releases.map((release, index) => ({
        "@type": "ListItem",
        position: index + 1,
        item: {
          "@type": "CreativeWork",
          name: release.title,
          description: release.summary,
          url: release.sourceUrl,
          datePublished: release.date
        }
      }))
    }
  ];
}

export interface HubItem {
  name: string;
  path: string;
}

interface HubStructuredDataOptions {
  canonicalUrl: string;
  name: string;
  description: string;
  /** Breadcrumb trail after Home, ending with this page. */
  trail: Array<{ name: string; path: string }>;
  items: HubItem[];
  order?: "ascending" | "descending" | "unordered";
}

/**
 * Hub pages (the places, constituencies, counties, region and findings
 * indexes): a breadcrumb, the CollectionPage and an ItemList of every page
 * the hub links to, in the order the hub lists them.
 */
export function buildHubStructuredData(options: HubStructuredDataOptions): StructuredDataNode[] {
  const listId = `${options.canonicalUrl}#list`;
  const order = options.order ?? "ascending";
  return [
    {
      "@context": "https://schema.org",
      "@type": "BreadcrumbList",
      itemListElement: [{ name: "Home", path: "/" }, ...options.trail].map((item, index) => ({
        "@type": "ListItem",
        position: index + 1,
        name: item.name,
        item: buildAbsoluteUrl(item.path)
      }))
    },
    {
      "@context": "https://schema.org",
      "@type": "CollectionPage",
      name: options.name,
      description: options.description,
      url: options.canonicalUrl,
      isPartOf: { "@id": `${SITE_URL}/#website` },
      mainEntity: { "@id": listId }
    },
    {
      "@context": "https://schema.org",
      "@type": "ItemList",
      "@id": listId,
      name: options.name,
      numberOfItems: options.items.length,
      itemListOrder: order === "descending" ? "https://schema.org/ItemListOrderDescending"
        : order === "unordered" ? "https://schema.org/ItemListUnordered"
        : "https://schema.org/ItemListOrderAscending",
      itemListElement: options.items.map((item, index) => ({
        "@type": "ListItem",
        position: index + 1,
        name: item.name,
        url: buildAbsoluteUrl(item.path)
      }))
    }
  ];
}
