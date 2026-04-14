import type { HotelAreaSummary, HotelEntityLedger, HotelSiteSummary } from "./hotel-data";

export interface HotelRegionVisibilitySummary {
  regionName: string;
  currentNamedSiteCount: number;
  historicalNamedSiteCount: number;
  parliamentaryReferenceCount: number;
  unnamedOnlyAreaCount: number;
  unnamedSiteCount: number;
  unresolvedCurrentSiteCount: number;
  integritySignalCount: number;
}

export interface HotelCoverageSummary {
  partial: number;
  unresolved: number;
}

function createRegionSummary(regionName: string): HotelRegionVisibilitySummary {
  return {
    regionName,
    currentNamedSiteCount: 0,
    historicalNamedSiteCount: 0,
    parliamentaryReferenceCount: 0,
    unnamedOnlyAreaCount: 0,
    unnamedSiteCount: 0,
    unresolvedCurrentSiteCount: 0,
    integritySignalCount: 0
  };
}

export function getHotelRegionVisibilitySummaries(ledger: HotelEntityLedger): HotelRegionVisibilitySummary[] {
  const regions = new Map<string, HotelRegionVisibilitySummary>();

  for (const site of ledger.sites) {
    const summary = regions.get(site.regionName) ?? createRegionSummary(site.regionName);

    if (site.status === "current") {
      summary.currentNamedSiteCount += 1;
      summary.integritySignalCount += site.integritySignalCount;

      if (site.entityCoverage === "unresolved") {
        summary.unresolvedCurrentSiteCount += 1;
      }
    } else if (site.status === "historical") {
      summary.historicalNamedSiteCount += 1;
    }

    if (site.evidenceClass === "parliamentary_reference") {
      summary.parliamentaryReferenceCount += 1;
    }

    regions.set(site.regionName, summary);
  }

  for (const area of ledger.areas) {
    if (area.visibilityClass !== "all_unnamed") {
      continue;
    }

    const summary = regions.get(area.regionName) ?? createRegionSummary(area.regionName);
    summary.unnamedOnlyAreaCount += 1;
    summary.unnamedSiteCount += area.unnamedSiteCount;
    regions.set(area.regionName, summary);
  }

  return [...regions.values()].sort((a, b) => {
    return (
      b.currentNamedSiteCount - a.currentNamedSiteCount ||
      b.unnamedSiteCount - a.unnamedSiteCount ||
      b.integritySignalCount - a.integritySignalCount ||
      a.regionName.localeCompare(b.regionName)
    );
  });
}

export function getHotelCoverageSummary(sites: HotelSiteSummary[]): HotelCoverageSummary {
  return sites.reduce<HotelCoverageSummary>(
    (summary, site) => {
      if (site.entityCoverage === "unresolved") {
        summary.unresolved += 1;
      } else {
        summary.partial += 1;
      }

      return summary;
    },
    { partial: 0, unresolved: 0 }
  );
}

export function getHotelPriorityScore(site: HotelSiteSummary): number {
  let score = 0;

  if (site.status === "current") {
    score += 2;
  }

  if (site.entityCoverage === "unresolved") {
    score += 6;
  } else {
    score += 3;
  }

  if (!site.ownerName) {
    score += 2;
  }

  if (!site.operatorName) {
    score += 2;
  }

  score += site.integritySignalCount * 3;

  return score;
}

export function getHotelWatchlist(sites: HotelSiteSummary[], limit = 4): HotelSiteSummary[] {
  return [...sites]
    .sort((a, b) => {
      return (
        getHotelPriorityScore(b) - getHotelPriorityScore(a) ||
        b.integritySignalCount - a.integritySignalCount ||
        a.siteName.localeCompare(b.siteName)
      );
    })
    .slice(0, limit);
}

export function getHotelVisibilityAreas(areas: HotelAreaSummary[]): HotelAreaSummary[] {
  return [...areas].sort((a, b) => {
    const aWeight =
      a.currentNamedSiteCount * 4 +
      a.unnamedSiteCount * 3 +
      a.historicalNamedSiteCount * 2 +
      a.parliamentaryReferenceCount;
    const bWeight =
      b.currentNamedSiteCount * 4 +
      b.unnamedSiteCount * 3 +
      b.historicalNamedSiteCount * 2 +
      b.parliamentaryReferenceCount;

    return bWeight - aWeight || b.unnamedSiteCount - a.unnamedSiteCount || a.areaName.localeCompare(b.areaName);
  });
}
