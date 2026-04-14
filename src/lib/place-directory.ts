import { loadHotelEntityLedger } from "./hotel-data";
import { getRegionPressureSummaries } from "./route-analytics";
import { loadLocalRouteLatest, type LocalRouteAreaSummary } from "./route-data";
import { buildPublicPlaceRegionPath, buildPublicPlaceRegionSlug, getPublicPlaceAreas } from "./site";

export interface PlaceDirectoryArea {
  area: LocalRouteAreaSummary;
  nationalRank: number;
  namedCurrentSiteCount: number;
  unnamedSiteCount: number;
  hotelSignal: "named" | "unnamed" | "none";
  hotelSummary: string;
}

export interface PlaceDirectoryRegion {
  regionName: string;
  countryName: string;
  regionSlug: string;
  regionPath: string;
  anchorId: string;
  supportedAsylum: number;
  supportedAsylumRate: number;
  contingencyAccommodation: number;
  publicPlaceCount: number;
  hotelLinkedPlaceCount: number;
  namedCurrentSiteCount: number;
  unnamedOnlyPlaceCount: number;
  leadArea: PlaceDirectoryArea | null;
  areas: PlaceDirectoryArea[];
}

export interface PlaceDirectory {
  snapshotDate: string;
  publicPlaceCount: number;
  hotelLinkedPlaceCount: number;
  namedCurrentSiteCount: number;
  unnamedOnlyPlaceCount: number;
  regions: PlaceDirectoryRegion[];
  featuredAreas: PlaceDirectoryArea[];
}

function buildRegionAnchorId(regionName: string): string {
  return `region-${buildPublicPlaceRegionSlug(regionName)}`;
}

function formatHotelSummary(namedCurrentSiteCount: number, unnamedSiteCount: number): string {
  if (namedCurrentSiteCount > 0 && unnamedSiteCount > 0) {
    return `${namedCurrentSiteCount} named current site${namedCurrentSiteCount === 1 ? "" : "s"} and ${unnamedSiteCount} unnamed acknowledged site${unnamedSiteCount === 1 ? "" : "s"}`;
  }

  if (namedCurrentSiteCount > 0) {
    return `${namedCurrentSiteCount} named current site${namedCurrentSiteCount === 1 ? "" : "s"}`;
  }

  if (unnamedSiteCount > 0) {
    return `${unnamedSiteCount} unnamed acknowledged site${unnamedSiteCount === 1 ? "" : "s"}`;
  }

  return "No public hotel evidence yet";
}

function matchesArea(
  candidate: Pick<LocalRouteAreaSummary, "areaCode" | "areaName">,
  areaCode: string | null,
  areaName: string
): boolean {
  if (areaCode && candidate.areaCode === areaCode) {
    return true;
  }

  return candidate.areaName === areaName;
}

export function getPlaceDirectory(): PlaceDirectory {
  const localRouteLatest = loadLocalRouteLatest();
  const hotelLedger = loadHotelEntityLedger();
  const publicAreas = getPublicPlaceAreas();
  const regionalPressure = new Map(
    getRegionPressureSummaries(localRouteLatest.areas).map((region) => [region.regionName, region])
  );
  const rankedAreas = [...localRouteLatest.areas].sort(
    (left, right) => right.supportedAsylum - left.supportedAsylum || left.areaName.localeCompare(right.areaName)
  );
  const nationalRankByAreaCode = new Map(rankedAreas.map((area, index) => [area.areaCode, index + 1]));
  const regionBuckets = new Map<string, PlaceDirectoryRegion>();

  const areaRows = publicAreas
    .map((area) => {
      const namedCurrentSiteCount = hotelLedger.sites.filter(
        (site) => site.status === "current" && matchesArea(area, site.areaCode, site.areaName)
      ).length;
      const hotelArea = hotelLedger.areas.find((candidate) => matchesArea(area, candidate.areaCode, candidate.areaName));
      const unnamedSiteCount = hotelArea?.unnamedSiteCount ?? 0;
      const hotelSignal = namedCurrentSiteCount > 0 ? "named" : unnamedSiteCount > 0 ? "unnamed" : "none";

      return {
        area,
        nationalRank: nationalRankByAreaCode.get(area.areaCode) ?? 0,
        namedCurrentSiteCount,
        unnamedSiteCount,
        hotelSignal,
        hotelSummary: formatHotelSummary(namedCurrentSiteCount, unnamedSiteCount)
      } satisfies PlaceDirectoryArea;
    })
    .sort((left, right) => right.area.supportedAsylum - left.area.supportedAsylum || left.area.areaName.localeCompare(right.area.areaName));

  for (const row of areaRows) {
    const existing =
      regionBuckets.get(row.area.regionName) ??
      ({
        regionName: row.area.regionName,
        countryName: row.area.countryName,
        regionSlug: buildPublicPlaceRegionSlug(row.area.regionName),
        regionPath: buildPublicPlaceRegionPath(row.area.regionName),
        anchorId: buildRegionAnchorId(row.area.regionName),
        supportedAsylum: regionalPressure.get(row.area.regionName)?.supportedAsylum ?? 0,
        supportedAsylumRate: regionalPressure.get(row.area.regionName)?.supportedAsylumRate ?? 0,
        contingencyAccommodation: regionalPressure.get(row.area.regionName)?.contingencyAccommodation ?? 0,
        publicPlaceCount: 0,
        hotelLinkedPlaceCount: 0,
        namedCurrentSiteCount: 0,
        unnamedOnlyPlaceCount: 0,
        leadArea: null,
        areas: []
      } satisfies PlaceDirectoryRegion);

    existing.publicPlaceCount += 1;
    existing.namedCurrentSiteCount += row.namedCurrentSiteCount;
    existing.areas.push(row);

    if (row.hotelSignal !== "none") {
      existing.hotelLinkedPlaceCount += 1;
    }

    if (row.hotelSignal === "unnamed") {
      existing.unnamedOnlyPlaceCount += 1;
    }

    if (!existing.leadArea || row.area.supportedAsylum > existing.leadArea.area.supportedAsylum) {
      existing.leadArea = row;
    }

    regionBuckets.set(row.area.regionName, existing);
  }

  const regions = [...regionBuckets.values()].sort(
    (left, right) => right.supportedAsylum - left.supportedAsylum || left.regionName.localeCompare(right.regionName)
  );

  return {
    snapshotDate: localRouteLatest.snapshotDate,
    publicPlaceCount: areaRows.length,
    hotelLinkedPlaceCount: areaRows.filter((row) => row.hotelSignal !== "none").length,
    namedCurrentSiteCount: areaRows.reduce((total, row) => total + row.namedCurrentSiteCount, 0),
    unnamedOnlyPlaceCount: areaRows.filter((row) => row.hotelSignal === "unnamed").length,
    regions,
    featuredAreas: areaRows.slice(0, 12)
  };
}
