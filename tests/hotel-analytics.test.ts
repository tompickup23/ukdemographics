import { describe, expect, it } from "vitest";
import type { HotelAreaSummary, HotelEntityLedger, HotelSiteSummary } from "../src/lib/hotel-data";
import {
  getHotelCoverageSummary,
  getHotelPriorityScore,
  getHotelRegionVisibilitySummaries,
  getHotelVisibilityAreas,
  getHotelWatchlist
} from "../src/lib/hotel-analytics";

function makeSite(overrides: Partial<HotelSiteSummary>): HotelSiteSummary {
  return {
    siteId: "site-a",
    siteName: "Alpha Hotel",
    areaName: "Alpha",
    areaCode: "A1",
    regionName: "North West",
    countryName: "England",
    status: "current",
    evidenceClass: "named_current",
    confidence: "high",
    peopleHousedReported: null,
    firstPublicDate: "2025-01-01",
    lastPublicDate: "2025-01-10",
    sourceTitle: "Source",
    sourceUrl: "https://example.com/a",
    notes: null,
    ownerName: "Owner",
    operatorName: "Operator",
    entityCoverage: "partial",
    entityLinks: [],
    integritySignals: [],
    integritySignalCount: 0,
    primeProvider: null,
    ...overrides
  };
}

function makeArea(overrides: Partial<HotelAreaSummary>): HotelAreaSummary {
  return {
    areaName: "Alpha",
    areaCode: "A1",
    regionName: "North West",
    countryName: "England",
    currentNamedSiteCount: 0,
    historicalNamedSiteCount: 0,
    parliamentaryReferenceCount: 0,
    unnamedSiteCount: 0,
    peopleHousedReported: null,
    lastPublicDate: "2025-01-10",
    sourceTitle: "Area source",
    sourceUrl: "https://example.com/area",
    notes: null,
    visibilityClass: "all_unnamed",
    visibilityPct: 0,
    ...overrides
  };
}

function makeLedger(sites: HotelSiteSummary[], areas: HotelAreaSummary[]): HotelEntityLedger {
  return {
    generatedAt: "2026-02-28T00:00:00Z",
    summary: {
      totalNamedSites: sites.length,
      currentNamedSites: sites.filter((site) => site.status === "current").length,
      historicalNamedSites: sites.filter((site) => site.status === "historical").length,
      parliamentaryReferenceSites: sites.filter((site) => site.evidenceClass === "parliamentary_reference").length,
      currentNamedSitesWithAnyEntityLinks: 0,
      currentNamedSitesWithOwnerLinks: 0,
      currentNamedSitesWithOperatorLinks: 0,
      currentNamedSitesFullyResolved: 0,
      currentNamedSitesUnresolved: sites.filter((site) => site.entityCoverage === "unresolved").length,
      currentNamedSitesWithIntegritySignals: sites.filter((site) => site.integritySignalCount > 0).length,
      unnamedOnlyAreaCount: areas.length,
      totalIntegritySignals: sites.reduce((total, site) => total + site.integritySignalCount, 0),
      archiveLeadCount: 0,
      archiveLinkedExistingCount: 0,
      archivePromotedNewCount: 0,
      archiveHeldBackCount: 0,
      archivePendingVerificationCount: 0
    },
    hotelFacts: [],
    sites,
    areas,
    archiveVerification: {
      sourceName: "Archive",
      archiveSnapshotUrl: null,
      archiveSnapshotDate: null,
      totalLeadCount: 0,
      linkedExistingCount: 0,
      promotedNewCount: 0,
      heldBackCount: 0,
      pendingVerificationCount: 0,
      pendingAutoCandidateCount: 0,
      publicArchiveMatches: []
    },
    primeProviderBreakdown: [],
    limitations: [],
    sources: []
  };
}

describe("hotel analytics helpers", () => {
  it("aggregates hotel visibility by region", () => {
    const ledger = makeLedger(
      [
        makeSite({
          regionName: "North West",
          integritySignalCount: 2
        }),
        makeSite({
          siteId: "site-b",
          siteName: "Bravo Hotel",
          regionName: "North West",
          entityCoverage: "unresolved",
          ownerName: null,
          operatorName: null,
          integritySignalCount: 1
        }),
        makeSite({
          siteId: "site-c",
          siteName: "Charlie Hotel",
          regionName: "London",
          status: "historical",
          evidenceClass: "named_historical"
        }),
        makeSite({
          siteId: "site-d",
          siteName: "Delta Hotel",
          regionName: "London",
          status: "unknown",
          evidenceClass: "parliamentary_reference"
        })
      ],
      [
        makeArea({
          regionName: "North West",
          unnamedSiteCount: 1
        }),
        makeArea({
          areaName: "Bravo",
          areaCode: "B1",
          regionName: "East Midlands",
          unnamedSiteCount: 3
        })
      ]
    );

    const summaries = getHotelRegionVisibilitySummaries(ledger);

    expect(summaries[0].regionName).toBe("North West");
    expect(summaries[0].currentNamedSiteCount).toBe(2);
    expect(summaries[0].unresolvedCurrentSiteCount).toBe(1);
    expect(summaries[0].integritySignalCount).toBe(3);
    expect(summaries[0].unnamedSiteCount).toBe(1);
    expect(summaries.find((summary) => summary.regionName === "London")?.historicalNamedSiteCount).toBe(1);
    expect(summaries.find((summary) => summary.regionName === "London")?.parliamentaryReferenceCount).toBe(1);
  });

  it("counts partial and unresolved site coverage", () => {
    const coverage = getHotelCoverageSummary([
      makeSite({ entityCoverage: "partial" }),
      makeSite({ siteId: "site-b", entityCoverage: "unresolved" }),
      makeSite({ siteId: "site-c", entityCoverage: "partial" })
    ]);

    expect(coverage.partial).toBe(2);
    expect(coverage.unresolved).toBe(1);
  });

  it("prioritises unresolved current sites with missing links and integrity signals", () => {
    const partial = makeSite({ siteId: "site-a", integritySignalCount: 0 });
    const unresolved = makeSite({
      siteId: "site-b",
      entityCoverage: "unresolved",
      ownerName: null,
      operatorName: null,
      integritySignalCount: 2
    });

    expect(getHotelPriorityScore(unresolved)).toBeGreaterThan(getHotelPriorityScore(partial));
    expect(getHotelWatchlist([partial, unresolved], 1)[0].siteId).toBe("site-b");
  });

  it("sorts hotel visibility areas by current and unnamed weight", () => {
    const areas = getHotelVisibilityAreas([
      makeArea({ areaName: "Quiet", currentNamedSiteCount: 1, unnamedSiteCount: 0 }),
      makeArea({ areaName: "Opaque", currentNamedSiteCount: 0, unnamedSiteCount: 3 }),
      makeArea({ areaName: "Visible", currentNamedSiteCount: 2, unnamedSiteCount: 1 })
    ]);

    expect(areas[0].areaName).toBe("Visible");
    expect(areas[1].areaName).toBe("Opaque");
  });
});
