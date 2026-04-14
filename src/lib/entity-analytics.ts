import type { EntityProfile, EntityProfileArea } from "./entities";
import type { HotelAreaSummary } from "./hotel-data";
import type { LocalRouteAreaSummary } from "./route-data";

export interface EntityExposureCoverageRow {
  key: "unresolved" | "partial" | "resolved";
  label: string;
  tone: "accent" | "warm" | "teal";
  count: number;
  sharePct: number;
}

export interface EntityExposureSummary {
  currentSiteCount: number;
  nonResolvedCurrentSiteCount: number;
  unresolvedCurrentSiteCount: number;
  partialCurrentSiteCount: number;
  resolvedCurrentSiteCount: number;
  nonResolvedSharePct: number;
  linkedAreaCount: number;
  totalSupportedAsylumAcrossLinkedAreas: number | null;
  totalContingencyAcrossLinkedAreas: number | null;
  leadArea: EntityProfileArea | null;
  coverageRows: EntityExposureCoverageRow[];
}

export interface EntityRegionSpreadRow {
  regionName: string;
  countryName: string;
  currentSiteCount: number;
  historicalSiteCount: number;
  linkedAreaCount: number;
  nonResolvedCurrentSiteCount: number;
  supportedAsylumTotal: number | null;
  contingencyAccommodationTotal: number | null;
  areaNames: string[];
  siteNames: string[];
}

export interface EntityLinkedPlaceRankingRow extends EntityProfileArea {
  rank: number;
  siteLabel: string;
}

export interface EntityTimelineEvent {
  eventId: string;
  date: string;
  kind: "site_public" | "site_latest" | "money_row";
  title: string;
  detail: string;
  href: string;
  cta: string;
}

export interface EntityTimelineSummary {
  firstEvidenceDate: string | null;
  latestEvidenceDate: string | null;
  firstCurrentSiteDate: string | null;
  latestMoneyDate: string | null;
  eventCount: number;
  events: EntityTimelineEvent[];
}

export interface EntityRegionalCoverageArea extends LocalRouteAreaSummary {
  rank: number;
  namedCurrentSiteCount: number;
  historicalNamedSiteCount: number;
  unnamedSiteCount: number;
  visibilityClass: string | null;
  directLinkedCurrentSiteCount: number;
}

export interface EntityRegionalCoverageSummary {
  geographyLabels: string[];
  coveredAreaCount: number;
  directLinkedAreaCount: number;
  namedCurrentAreaCount: number;
  unnamedOnlyAreaCount: number;
  highestPressureArea: EntityRegionalCoverageArea | null;
  topCoveredAreas: EntityRegionalCoverageArea[];
}

export interface AreaPrimeProviderCoverage {
  profile: EntityProfile;
  coverage: EntityRegionalCoverageSummary;
  area: EntityRegionalCoverageArea;
}

function toSharePct(count: number, total: number): number {
  if (total <= 0) {
    return 0;
  }

  return Number(((count / total) * 100).toFixed(1));
}

function sumNumbers(values: Array<number | null | undefined>): number | null {
  const numbers = values.filter((value): value is number => typeof value === "number");

  if (numbers.length === 0) {
    return null;
  }

  return numbers.reduce((total, value) => total + value, 0);
}

function compareAreas(left: EntityProfileArea, right: EntityProfileArea): number {
  return (
    (right.supportedAsylum ?? -1) - (left.supportedAsylum ?? -1) ||
    (right.contingencyAccommodation ?? -1) - (left.contingencyAccommodation ?? -1) ||
    right.currentSiteCount - left.currentSiteCount ||
    left.areaName.localeCompare(right.areaName)
  );
}

function parseDate(value: string | null | undefined): string | null {
  const normalized = String(value ?? "").trim();
  return normalized || null;
}

function buildHotelHref(siteName: string, status: string): string {
  const search = new URLSearchParams({
    hotel_q: siteName,
    hotel_status: status
  });

  return `/hotels/?${search.toString()}#hotel-filters`;
}

function buildMoneyHref(query: string): string {
  const search = new URLSearchParams({ money_q: query });
  return `/spending/?${search.toString()}#money-explorer`;
}

function parseCoverageLabels(value: string | null | undefined): string[] {
  return String(value ?? "")
    .split(";")
    .map((label) => label.trim())
    .filter((label) => label.length > 0);
}

function matchesCoverageLabel(label: string, area: Pick<LocalRouteAreaSummary, "regionName" | "countryName">): boolean {
  if (label === area.regionName || label === area.countryName) {
    return true;
  }

  if (label === "Midlands" && ["East Midlands", "West Midlands"].includes(area.regionName)) {
    return true;
  }

  if (label === "South of England" && ["London", "South East", "South West"].includes(area.regionName)) {
    return true;
  }

  return false;
}

function compareCoverageAreas(left: LocalRouteAreaSummary, right: LocalRouteAreaSummary): number {
  return (
    right.supportedAsylum - left.supportedAsylum ||
    right.contingencyAccommodation - left.contingencyAccommodation ||
    (right.supportedAsylumRate ?? -1) - (left.supportedAsylumRate ?? -1) ||
    left.areaName.localeCompare(right.areaName)
  );
}

export function getEntityExposureSummary(profile: EntityProfile): EntityExposureSummary {
  const currentSiteCount = profile.currentSites.length;
  const unresolvedCurrentSiteCount = profile.currentSites.filter((site) => site.entityCoverage === "unresolved").length;
  const partialCurrentSiteCount = profile.currentSites.filter((site) => site.entityCoverage === "partial").length;
  const resolvedCurrentSiteCount = profile.currentSites.filter((site) => site.entityCoverage === "resolved").length;
  const nonResolvedCurrentSiteCount = unresolvedCurrentSiteCount + partialCurrentSiteCount;
  const leadArea = [...profile.linkedAreas].sort(compareAreas)[0] ?? null;

  return {
    currentSiteCount,
    nonResolvedCurrentSiteCount,
    unresolvedCurrentSiteCount,
    partialCurrentSiteCount,
    resolvedCurrentSiteCount,
    nonResolvedSharePct: toSharePct(nonResolvedCurrentSiteCount, currentSiteCount),
    linkedAreaCount: profile.linkedAreas.length,
    totalSupportedAsylumAcrossLinkedAreas: sumNumbers(profile.linkedAreas.map((area) => area.supportedAsylum)),
    totalContingencyAcrossLinkedAreas: sumNumbers(profile.linkedAreas.map((area) => area.contingencyAccommodation)),
    leadArea,
    coverageRows: [
      {
        key: "unresolved",
        label: "Unresolved",
        tone: "accent",
        count: unresolvedCurrentSiteCount,
        sharePct: toSharePct(unresolvedCurrentSiteCount, currentSiteCount)
      },
      {
        key: "partial",
        label: "Partial",
        tone: "warm",
        count: partialCurrentSiteCount,
        sharePct: toSharePct(partialCurrentSiteCount, currentSiteCount)
      },
      {
        key: "resolved",
        label: "Resolved",
        tone: "teal",
        count: resolvedCurrentSiteCount,
        sharePct: toSharePct(resolvedCurrentSiteCount, currentSiteCount)
      }
    ]
  };
}

export function getEntityRegionSpread(profile: EntityProfile): EntityRegionSpreadRow[] {
  const rows = new Map<string, EntityRegionSpreadRow>();

  for (const site of profile.currentSites) {
    const key = `${site.regionName}|${site.countryName}`;
    const existing = rows.get(key);

    if (existing) {
      existing.currentSiteCount += 1;
      if (site.entityCoverage !== "resolved") {
        existing.nonResolvedCurrentSiteCount += 1;
      }
      existing.siteNames.push(site.siteName);
      continue;
    }

    rows.set(key, {
      regionName: site.regionName,
      countryName: site.countryName,
      currentSiteCount: 1,
      historicalSiteCount: 0,
      linkedAreaCount: 0,
      nonResolvedCurrentSiteCount: site.entityCoverage !== "resolved" ? 1 : 0,
      supportedAsylumTotal: null,
      contingencyAccommodationTotal: null,
      areaNames: [],
      siteNames: [site.siteName]
    });
  }

  for (const site of profile.historicalSites) {
    const key = `${site.regionName}|${site.countryName}`;
    const existing = rows.get(key);

    if (existing) {
      existing.historicalSiteCount += 1;
      existing.siteNames.push(site.siteName);
      continue;
    }

    rows.set(key, {
      regionName: site.regionName,
      countryName: site.countryName,
      currentSiteCount: 0,
      historicalSiteCount: 1,
      linkedAreaCount: 0,
      nonResolvedCurrentSiteCount: 0,
      supportedAsylumTotal: null,
      contingencyAccommodationTotal: null,
      areaNames: [],
      siteNames: [site.siteName]
    });
  }

  for (const area of profile.linkedAreas) {
    const key = `${area.regionName}|${area.countryName}`;
    const existing = rows.get(key);

    if (existing) {
      existing.linkedAreaCount += 1;
      existing.areaNames.push(area.areaName);
      existing.supportedAsylumTotal =
        existing.supportedAsylumTotal === null || area.supportedAsylum === null
          ? sumNumbers([existing.supportedAsylumTotal, area.supportedAsylum])
          : existing.supportedAsylumTotal + area.supportedAsylum;
      existing.contingencyAccommodationTotal =
        existing.contingencyAccommodationTotal === null || area.contingencyAccommodation === null
          ? sumNumbers([existing.contingencyAccommodationTotal, area.contingencyAccommodation])
          : existing.contingencyAccommodationTotal + area.contingencyAccommodation;
      continue;
    }

    rows.set(key, {
      regionName: area.regionName,
      countryName: area.countryName,
      currentSiteCount: 0,
      historicalSiteCount: 0,
      linkedAreaCount: 1,
      nonResolvedCurrentSiteCount: 0,
      supportedAsylumTotal: area.supportedAsylum,
      contingencyAccommodationTotal: area.contingencyAccommodation,
      areaNames: [area.areaName],
      siteNames: []
    });
  }

  return [...rows.values()]
    .map((row) => ({
      ...row,
      areaNames: [...new Set(row.areaNames)].sort((left, right) => left.localeCompare(right)),
      siteNames: [...new Set(row.siteNames)].sort((left, right) => left.localeCompare(right))
    }))
    .sort(
      (left, right) =>
        right.currentSiteCount - left.currentSiteCount ||
        right.nonResolvedCurrentSiteCount - left.nonResolvedCurrentSiteCount ||
        (right.supportedAsylumTotal ?? -1) - (left.supportedAsylumTotal ?? -1) ||
        left.regionName.localeCompare(right.regionName)
    );
}

export function getEntityLinkedPlaceRankings(
  profile: EntityProfile,
  limit = 5
): EntityLinkedPlaceRankingRow[] {
  return [...profile.linkedAreas]
    .sort(compareAreas)
    .slice(0, limit)
    .map((area, index) => ({
      ...area,
      rank: index + 1,
      siteLabel:
        area.currentSiteCount > 0
          ? `${area.currentSiteCount} current site${area.currentSiteCount === 1 ? "" : "s"}`
          : `${area.historicalSiteCount} historical site${area.historicalSiteCount === 1 ? "" : "s"}`
    }));
}

export function getEntityTimeline(profile: EntityProfile, limit = 8): EntityTimelineSummary {
  const events: EntityTimelineEvent[] = [];

  for (const site of [...profile.currentSites, ...profile.historicalSites]) {
    const firstPublicDate = parseDate(site.firstPublicDate);
    const lastPublicDate = parseDate(site.lastPublicDate);

    if (firstPublicDate) {
      events.push({
        eventId: `${site.siteId}:first`,
        date: firstPublicDate,
        kind: "site_public",
        title: `${site.siteName} enters the public record`,
        detail: `${site.areaName} appears in the visible site chain for ${profile.entityName}.`,
        href: buildHotelHref(site.siteName, site.status),
        cta: "Open hotel trail"
      });
    }

    if (site.status !== "current" && lastPublicDate && lastPublicDate !== firstPublicDate) {
      events.push({
        eventId: `${site.siteId}:latest`,
        date: lastPublicDate,
        kind: "site_latest",
        title: `${site.siteName} is last publicly visible in the historical ledger`,
        detail: `${site.areaName} remains part of the historical site chain rather than the current named estate.`,
        href: buildHotelHref(site.siteName, site.status),
        cta: "Open historical hotel trail"
      });
    }
  }

  for (const record of profile.moneyRecords) {
    const datedEvent = parseDate(record.publishedDate) ?? parseDate(record.awardDate);

    if (!datedEvent) {
      continue;
    }

    events.push({
      eventId: `${record.recordId}:money`,
      date: datedEvent,
      kind: "money_row",
      title: record.title,
      detail: `${record.buyerName} publishes a money row tied to ${profile.entityName}${record.periodLabel ? ` (${record.periodLabel})` : ""}.`,
      href: buildMoneyHref(profile.entityName),
      cta: "Open money explorer"
    });
  }

  const sortedEvents = events.sort(
    (left, right) => right.date.localeCompare(left.date) || left.title.localeCompare(right.title)
  );
  const firstEvidenceDate = [...sortedEvents].sort((left, right) => left.date.localeCompare(right.date))[0]?.date ?? null;
  const latestEvidenceDate = sortedEvents[0]?.date ?? null;
  const firstCurrentSiteDate =
    [...profile.currentSites]
      .map((site) => parseDate(site.firstPublicDate) ?? parseDate(site.lastPublicDate))
      .filter((date): date is string => date !== null)
      .sort((left, right) => left.localeCompare(right))[0] ?? null;
  const latestMoneyDate =
    profile.moneyRecords
      .map((record) => parseDate(record.publishedDate) ?? parseDate(record.awardDate))
      .filter((date): date is string => date !== null)
      .sort((left, right) => right.localeCompare(left))[0] ?? null;

  return {
    firstEvidenceDate,
    latestEvidenceDate,
    firstCurrentSiteDate,
    latestMoneyDate,
    eventCount: sortedEvents.length,
    events: sortedEvents.slice(0, limit)
  };
}

export function getEntityRegionalContractCoverage(
  profile: EntityProfile,
  areas: LocalRouteAreaSummary[],
  hotelAreas: HotelAreaSummary[],
  limit = 5
): EntityRegionalCoverageSummary | null {
  const geographyLabels = [...new Set(
    profile.moneyRecords
      .filter((record) => record.recordType === "prime_contract_scope" && record.routeFamily === "asylum_support")
      .flatMap((record) => parseCoverageLabels(record.geographyScope))
  )];

  if (geographyLabels.length === 0) {
    return null;
  }

  const hotelAreaByKey = new Map(
    hotelAreas.map((hotelArea) => [`${hotelArea.areaCode ?? hotelArea.areaName}|${hotelArea.regionName}`, hotelArea])
  );
  const linkedAreaByCode = new Map(
    profile.linkedAreas.map((area) => [area.areaCode ?? area.areaName, area])
  );
  const coveredAreas = [...areas]
    .filter((area) => geographyLabels.some((label) => matchesCoverageLabel(label, area)))
    .sort(compareCoverageAreas)
    .map((area, index) => {
      const hotelArea =
        hotelAreaByKey.get(`${area.areaCode}|${area.regionName}`) ??
        hotelAreaByKey.get(`${area.areaName}|${area.regionName}`) ??
        null;
      const linkedArea = linkedAreaByCode.get(area.areaCode) ?? linkedAreaByCode.get(area.areaName) ?? null;

      return {
        ...area,
        rank: index + 1,
        namedCurrentSiteCount: hotelArea?.currentNamedSiteCount ?? 0,
        historicalNamedSiteCount: hotelArea?.historicalNamedSiteCount ?? 0,
        unnamedSiteCount: hotelArea?.unnamedSiteCount ?? 0,
        visibilityClass: hotelArea?.visibilityClass ?? null,
        directLinkedCurrentSiteCount: linkedArea?.currentSiteCount ?? 0
      } satisfies EntityRegionalCoverageArea;
    });

  return {
    geographyLabels,
    coveredAreaCount: coveredAreas.length,
    directLinkedAreaCount: coveredAreas.filter((area) => area.directLinkedCurrentSiteCount > 0).length,
    namedCurrentAreaCount: coveredAreas.filter((area) => area.namedCurrentSiteCount > 0).length,
    unnamedOnlyAreaCount: coveredAreas.filter((area) => area.visibilityClass === "all_unnamed").length,
    highestPressureArea: coveredAreas[0] ?? null,
    topCoveredAreas: coveredAreas.slice(0, limit)
  };
}

export function getAreaRegionalPrimeProviderCoverage(
  area: LocalRouteAreaSummary,
  profiles: EntityProfile[],
  localAreas: LocalRouteAreaSummary[],
  hotelAreas: HotelAreaSummary[]
): AreaPrimeProviderCoverage | null {
  const candidates = profiles
    .filter((profile) => profile.primaryRole === "prime_provider")
    .map((profile) => {
      const fullCoverage = getEntityRegionalContractCoverage(profile, localAreas, hotelAreas, localAreas.length);

      if (!fullCoverage) {
        return null;
      }

      const coverageArea = fullCoverage.topCoveredAreas.find((coveredArea) => coveredArea.areaCode === area.areaCode) ?? null;

      if (!coverageArea) {
        return null;
      }

      return {
        profile,
        coverage: {
          ...fullCoverage,
          topCoveredAreas: fullCoverage.topCoveredAreas.slice(0, 5)
        },
        area: coverageArea
      };
    })
    .filter((candidate): candidate is AreaPrimeProviderCoverage => candidate !== null)
    .sort(
      (left, right) =>
        left.area.rank - right.area.rank ||
        right.profile.score - left.profile.score ||
        left.profile.entityName.localeCompare(right.profile.entityName)
    );

  return candidates[0] ?? null;
}
