import { loadHotelEntityLedger } from "./hotel-data";
import { loadLocalRouteLatest } from "./route-data";
import { buildPublicPlaceRegionPath } from "./site";

export interface LocalEvidencePoint {
  siteId: string;
  siteName: string;
  areaName: string;
  areaCode: string | null;
  regionName: string;
  countryName: string;
  lastPublicDate: string;
  sourceTitle: string;
  sourceUrl: string;
  entityCoverage: string;
  ownerName: string | null;
  operatorName: string | null;
  primeProviderName: string | null;
  supportedAsylum: number | null;
  supportedAsylumRate: number | null;
  contingencyAccommodation: number | null;
  placeHref: string | null;
  regionHref: string;
  chainLabel: string;
  chainSummary: string;
}

export interface LocalEvidenceTimelineEntry extends LocalEvidencePoint {
  lastPublicDateLabel: string;
}

export interface RegionLocalEvidenceLayer {
  regionName: string;
  countryName: string;
  currentNamedSiteCount: number;
  partiallyResolvedSiteCount: number;
  unresolvedSiteCount: number;
  uniqueAreaCount: number;
  points: LocalEvidencePoint[];
}

export interface RegionLocalEvidenceAreaSummary {
  areaName: string;
  areaCode: string | null;
  placeHref: string | null;
  currentNamedSiteCount: number;
  partiallyResolvedSiteCount: number;
  unresolvedSiteCount: number;
  latestPublicDate: string;
  latestPublicDateLabel: string;
  siteNames: string[];
  supportedAsylum: number | null;
  supportedAsylumRate: number | null;
  chainLabel: string;
}

function buildChainLabel(entityCoverage: string): string {
  return entityCoverage === "partial" ? "Partial chain" : "Unresolved chain";
}

function buildChainSummary(
  entityCoverage: string,
  ownerName: string | null,
  operatorName: string | null,
  primeProviderName: string | null
): string {
  if (entityCoverage === "partial") {
    return `${ownerName ? `Owner: ${ownerName}. ` : ""}${operatorName ? `Operator: ${operatorName}. ` : ""}${primeProviderName ? `Regional provider: ${primeProviderName}.` : "Some of the public chain is visible, but not all of it."}`.trim();
  }

  return primeProviderName
    ? `The site is public, but the local owner or operator chain still breaks. Regional provider: ${primeProviderName}.`
    : "The site is public, but the local owner or operator chain still breaks in the live ledger.";
}

function formatEvidenceDateLabel(value: string): string {
  return new Date(`${value}T00:00:00Z`).toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone: "UTC"
  });
}

function sortEvidencePoints(left: LocalEvidencePoint, right: LocalEvidencePoint): number {
  return (
    right.lastPublicDate.localeCompare(left.lastPublicDate) ||
    (right.supportedAsylum ?? -1) - (left.supportedAsylum ?? -1) ||
    left.areaName.localeCompare(right.areaName) ||
    left.siteName.localeCompare(right.siteName)
  );
}

function buildTimelineEntries(points: LocalEvidencePoint[]): LocalEvidenceTimelineEntry[] {
  return [...points]
    .sort(sortEvidencePoints)
    .map((point) => ({
      ...point,
      lastPublicDateLabel: formatEvidenceDateLabel(point.lastPublicDate)
    }));
}

export function getCurrentLocalEvidencePoints(): LocalEvidencePoint[] {
  const hotelLedger = loadHotelEntityLedger();
  const localRouteLatest = loadLocalRouteLatest();
  const areaByCode = new Map(localRouteLatest.areas.map((area) => [area.areaCode, area]));
  const areaByName = new Map(localRouteLatest.areas.map((area) => [area.areaName, area]));

  return hotelLedger.sites
    .filter((site) => site.status === "current")
    .map((site) => {
      const area =
        (site.areaCode ? areaByCode.get(site.areaCode) : null) ??
        areaByName.get(site.areaName) ??
        null;

      return {
        siteId: site.siteId,
        siteName: site.siteName,
        areaName: site.areaName,
        areaCode: site.areaCode,
        regionName: site.regionName,
        countryName: site.countryName,
        lastPublicDate: site.lastPublicDate,
        sourceTitle: site.sourceTitle,
        sourceUrl: site.sourceUrl,
        entityCoverage: site.entityCoverage,
        ownerName: site.ownerName,
        operatorName: site.operatorName,
        primeProviderName: site.primeProvider?.provider ?? null,
        supportedAsylum: area?.supportedAsylum ?? null,
        supportedAsylumRate: area?.supportedAsylumRate ?? null,
        contingencyAccommodation: area?.contingencyAccommodation ?? null,
        placeHref: site.areaCode ? `/places/${site.areaCode}/` : null,
        regionHref: buildPublicPlaceRegionPath(site.regionName),
        chainLabel: buildChainLabel(site.entityCoverage),
        chainSummary: buildChainSummary(
          site.entityCoverage,
          site.ownerName,
          site.operatorName,
          site.primeProvider?.provider ?? null
        )
      } satisfies LocalEvidencePoint;
    })
    .sort(sortEvidencePoints);
}

export function getRegionLocalEvidenceLayers(): RegionLocalEvidenceLayer[] {
  const buckets = new Map<string, RegionLocalEvidenceLayer>();

  for (const point of getCurrentLocalEvidencePoints()) {
    const existing =
      buckets.get(point.regionName) ??
      ({
        regionName: point.regionName,
        countryName: point.countryName,
        currentNamedSiteCount: 0,
        partiallyResolvedSiteCount: 0,
        unresolvedSiteCount: 0,
        uniqueAreaCount: 0,
        points: []
      } satisfies RegionLocalEvidenceLayer);

    existing.currentNamedSiteCount += 1;
    existing.points.push(point);

    if (point.entityCoverage === "partial") {
      existing.partiallyResolvedSiteCount += 1;
    } else {
      existing.unresolvedSiteCount += 1;
    }

    existing.uniqueAreaCount = new Set(existing.points.map((candidate) => candidate.areaCode ?? candidate.areaName)).size;
    buckets.set(point.regionName, existing);
  }

  return [...buckets.values()].sort(
    (left, right) =>
      right.currentNamedSiteCount - left.currentNamedSiteCount || left.regionName.localeCompare(right.regionName)
  );
}

export function getLocalEvidenceTimeline(limit = 6): LocalEvidenceTimelineEntry[] {
  return buildTimelineEntries(getCurrentLocalEvidencePoints()).slice(0, limit);
}

export function getRegionLocalEvidenceTimeline(regionName: string, limit = 8): LocalEvidenceTimelineEntry[] {
  return buildTimelineEntries(
    getCurrentLocalEvidencePoints().filter((point) => point.regionName === regionName)
  ).slice(0, limit);
}

export function getRegionLocalEvidenceAreaSummaries(
  regionName: string,
  limit = 6
): RegionLocalEvidenceAreaSummary[] {
  const buckets = new Map<string, RegionLocalEvidenceAreaSummary>();

  for (const point of getCurrentLocalEvidencePoints().filter((candidate) => candidate.regionName === regionName)) {
    const key = point.areaCode ?? point.areaName;
    const existing =
      buckets.get(key) ??
      ({
        areaName: point.areaName,
        areaCode: point.areaCode,
        placeHref: point.placeHref,
        currentNamedSiteCount: 0,
        partiallyResolvedSiteCount: 0,
        unresolvedSiteCount: 0,
        latestPublicDate: point.lastPublicDate,
        latestPublicDateLabel: formatEvidenceDateLabel(point.lastPublicDate),
        siteNames: [],
        supportedAsylum: point.supportedAsylum,
        supportedAsylumRate: point.supportedAsylumRate,
        chainLabel: point.chainLabel
      } satisfies RegionLocalEvidenceAreaSummary);

    existing.currentNamedSiteCount += 1;
    existing.latestPublicDate =
      point.lastPublicDate > existing.latestPublicDate ? point.lastPublicDate : existing.latestPublicDate;
    existing.latestPublicDateLabel = formatEvidenceDateLabel(existing.latestPublicDate);
    existing.supportedAsylum = point.supportedAsylum ?? existing.supportedAsylum;
    existing.supportedAsylumRate = point.supportedAsylumRate ?? existing.supportedAsylumRate;

    if (!existing.siteNames.includes(point.siteName)) {
      existing.siteNames.push(point.siteName);
    }

    if (point.entityCoverage === "partial") {
      existing.partiallyResolvedSiteCount += 1;
    } else {
      existing.unresolvedSiteCount += 1;
    }

    existing.chainLabel =
      existing.partiallyResolvedSiteCount > 0 && existing.unresolvedSiteCount > 0
        ? "Mixed chain visibility"
        : existing.partiallyResolvedSiteCount > 0
          ? "Partial chain"
          : "Unresolved chain";

    buckets.set(key, existing);
  }

  return [...buckets.values()]
    .sort(
      (left, right) =>
        right.currentNamedSiteCount - left.currentNamedSiteCount ||
        right.latestPublicDate.localeCompare(left.latestPublicDate) ||
        (right.supportedAsylum ?? -1) - (left.supportedAsylum ?? -1) ||
        left.areaName.localeCompare(right.areaName)
    )
    .slice(0, limit);
}

export function getFeaturedLocalEvidenceTimeline(limit = 4): LocalEvidenceTimelineEntry[] {
  const regionLeads = new Map<string, LocalEvidencePoint>();

  for (const point of buildTimelineEntries(getCurrentLocalEvidencePoints())) {
    if (!regionLeads.has(point.regionName)) {
      regionLeads.set(point.regionName, point);
    }
  }

  return buildTimelineEntries([...regionLeads.values()]).slice(0, limit);
}
