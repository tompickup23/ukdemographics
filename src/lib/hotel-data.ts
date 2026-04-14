import { readFileSync } from "node:fs";

export interface HotelFact {
  label: string;
  value: string;
  period: string;
  detail: string;
  scope: string;
  routeId: string;
  sourceUrl: string;
}

export interface HotelEntityLink {
  linkId: string;
  entityName: string;
  companyNumber: string | null;
  linkRole: string;
  confidence: string;
  evidenceCount: number | null;
  sourceUrls: string[] | null;
  sources: Array<{ title: string; url: string }>;
  notes: string | null;
}

export interface HotelIntegritySignal {
  signalId: string;
  signalType: string;
  severity: string;
  subjectType: string;
  subjectId: string;
  headline: string | null;
  detail: string | null;
  routeFamily: string | null;
  confidence: string | null;
  sourceUrls: string[] | null;
  sourceTitle: string | null;
  generatedAt: string;
  notes: string | null;
}

export interface HotelSiteSummary {
  siteId: string;
  siteName: string;
  areaName: string;
  areaCode: string | null;
  regionName: string;
  countryName: string;
  status: string;
  evidenceClass: string;
  confidence: string;
  peopleHousedReported: number | null;
  firstPublicDate: string | null;
  lastPublicDate: string;
  sourceTitle: string;
  sourceUrl: string;
  notes: string | null;
  ownerName: string | null;
  operatorName: string | null;
  entityCoverage: string;
  entityLinks: HotelEntityLink[];
  integritySignals: HotelIntegritySignal[];
  integritySignalCount: number;
  primeProvider: {
    provider: string;
    regions: string[];
    note: string;
    sourceUrl: string;
  } | null;
}

export interface HotelAreaSummary {
  areaName: string;
  areaCode: string | null;
  regionName: string;
  countryName: string;
  currentNamedSiteCount: number;
  historicalNamedSiteCount: number;
  parliamentaryReferenceCount: number;
  unnamedSiteCount: number;
  peopleHousedReported: number | null;
  lastPublicDate: string;
  sourceTitle: string;
  sourceUrl: string;
  notes: string | null;
  visibilityClass: string;
  visibilityPct: number | null;
}

export interface HotelEntityLedger {
  generatedAt: string;
  summary: {
    totalNamedSites: number;
    currentNamedSites: number;
    historicalNamedSites: number;
    parliamentaryReferenceSites: number;
    currentNamedSitesWithAnyEntityLinks: number;
    currentNamedSitesWithOwnerLinks: number;
    currentNamedSitesWithOperatorLinks: number;
    currentNamedSitesFullyResolved: number;
    currentNamedSitesUnresolved: number;
    currentNamedSitesWithIntegritySignals: number;
    unnamedOnlyAreaCount: number;
    totalIntegritySignals: number;
    archiveLeadCount: number;
    archiveLinkedExistingCount: number;
    archivePromotedNewCount: number;
    archiveHeldBackCount: number;
    archivePendingVerificationCount: number;
  };
  hotelFacts: HotelFact[];
  sites: HotelSiteSummary[];
  areas: HotelAreaSummary[];
  archiveVerification: {
    sourceName: string;
    archiveSnapshotUrl: string | null;
    archiveSnapshotDate: string | null;
    totalLeadCount: number;
    linkedExistingCount: number;
    promotedNewCount: number;
    heldBackCount: number;
    pendingVerificationCount: number;
    pendingAutoCandidateCount: number;
    publicArchiveMatches: Array<{
      leadName: string;
      verificationStatus: string;
      siteId: string;
      siteName: string;
      areaName: string;
      areaCode: string | null;
      regionName: string;
      status: string;
      sourceTitle: string | null;
      sourceUrl: string | null;
      notes: string | null;
    }>;
  };
  primeProviderBreakdown: Array<{
    provider: string;
    currentNamedSiteCount: number;
    regions: string[];
    sourceUrl: string;
  }>;
  limitations: string[];
  sources: Array<{
    name: string;
    sourceUrl: string;
    type: string;
  }>;
}

function readProjectJson<T>(projectRelativePath: string): T {
  const fileUrl = new URL(`../../${projectRelativePath}`, import.meta.url);
  return JSON.parse(readFileSync(fileUrl, "utf8")) as T;
}

export function loadHotelEntityLedger(): HotelEntityLedger {
  return readProjectJson<HotelEntityLedger>("src/data/live/hotel-entity-ledger.json");
}
