import fs from "node:fs";
import path from "node:path";

export const SITE_NAME = "UK Demographics";
export const SITE_URL = "https://ukdemographics.co.uk";
export const DEFAULT_DESCRIPTION =
  "Population data for every community. Ethnic projections, school demand, housing pressure, and demographic change across 320 local authorities — every figure sourced from ONS, Census, and DfE data.";
export const DEFAULT_SOCIAL_IMAGE_PATH = "/og-card.svg";

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
  "/places/",
  "/compare/",
  "/national/",
  "/regional/",
  "/releases/",
  "/sources/",
  "/methodology/"
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

  // ethnic-projections.json has an `areas` array with areaCode, areaName, region, country, scenarios
  if (Array.isArray(raw.areas)) {
    for (const area of raw.areas) {
      areas.push({
        areaCode: area.areaCode ?? area.code,
        areaName: area.areaName ?? area.name,
        regionName: area.regionName ?? area.region ?? "Unknown",
        countryName: area.countryName ?? area.country ?? "England",
        population: area.population,
        wbiPct2021: area.wbiPct2021 ?? area.scenarios?.central?.wbi?.[0],
        wbiPct2041: area.wbiPct2041 ?? area.scenarios?.central?.wbi?.[20],
        diversityIndex2021: area.diversityIndex2021,
        diversityIndex2041: area.diversityIndex2041,
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

  for (const region of getPublicPlaceRegions()) {
    paths.add(buildPublicPlaceRegionPath(region.regionName));
  }

  for (const area of getPublicPlaceAreas()) {
    paths.add(buildPlacePath(area));
  }

  return [...paths].sort((a, b) => a.localeCompare(b));
}

interface PlaceStructuredDataOptions {
  canonicalUrl: string;
  description: string;
  socialImageUrl: string;
  snapshotDate: string;
}

export function buildPlaceStructuredData(
  area: DemographicAreaSummary,
  options: PlaceStructuredDataOptions
): StructuredDataNode[] {
  const areaId = `${options.canonicalUrl}#area`;
  const datasetId = `${options.canonicalUrl}#dataset`;

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
          name: area.areaName,
          item: options.canonicalUrl
        }
      ]
    },
    {
      "@context": "https://schema.org",
      "@type": "AdministrativeArea",
      "@id": areaId,
      name: area.areaName,
      identifier: area.areaCode,
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
      name: `${area.areaName} demographic profile`,
      description: options.description,
      url: options.canonicalUrl,
      isAccessibleForFree: true,
      dateModified: options.snapshotDate,
      temporalCoverage: "2021/2051",
      spatialCoverage: {
        "@id": areaId
      },
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
        area.areaName
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
