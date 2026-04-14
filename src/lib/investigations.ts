import type { HotelAreaSummary, HotelEntityLedger, HotelSiteSummary } from "./hotel-data";
import type { MoneyLedger, MoneyRecord } from "./money-data";
import type { LocalRouteAreaSummary } from "./route-data";

type InvestigationTone = "" | "accent" | "teal" | "warm";
type MoneyMatchType = "direct" | "provider" | "none";

export interface InvestigationStep {
  label: string;
  body: string;
  href: string;
  cta: string;
}

export interface InvestigationTrail {
  id: string;
  kind: "site" | "area";
  kicker: string;
  title: string;
  summary: string;
  tone: InvestigationTone;
  chips: string[];
  steps: InvestigationStep[];
  footnote?: string;
  areaName: string;
  areaCode: string | null;
  siteId: string | null;
  siteName: string | null;
  moneyMatchType: MoneyMatchType;
  moneyLeadTitle: string | null;
  recordIds: string[];
}

interface MoneyMatch {
  matchType: MoneyMatchType;
  records: MoneyRecord[];
  providerName: string | null;
}

interface SiteTrailCandidate {
  trail: InvestigationTrail;
  score: number;
}

function buildFilterHref(pathname: string, params: Record<string, string>, hash: string): string {
  const search = new URLSearchParams();

  for (const [key, value] of Object.entries(params)) {
    if (value.trim()) {
      search.set(key, value);
    }
  }

  return `${pathname}${search.toString() ? `?${search.toString()}` : ""}#${hash}`;
}

function normalizeName(value: string | null | undefined): string {
  return (value ?? "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function namesMatch(left: string | null | undefined, right: string | null | undefined): boolean {
  const normalizedLeft = normalizeName(left);
  const normalizedRight = normalizeName(right);

  if (!normalizedLeft || !normalizedRight) {
    return false;
  }

  return (
    normalizedLeft === normalizedRight ||
    normalizedLeft.includes(normalizedRight) ||
    normalizedRight.includes(normalizedLeft)
  );
}

function getAreaBySite(
  site: HotelSiteSummary,
  areaByCode: Map<string, LocalRouteAreaSummary>,
  areas: LocalRouteAreaSummary[]
): LocalRouteAreaSummary | undefined {
  if (site.areaCode && areaByCode.has(site.areaCode)) {
    return areaByCode.get(site.areaCode);
  }

  return areas.find((area) => area.areaName === site.areaName);
}

function getMoneyMatch(site: HotelSiteSummary, records: MoneyRecord[]): MoneyMatch {
  const directMatches = records.filter((record) => record.siteIds.includes(site.siteId));

  if (directMatches.length > 0) {
    return {
      matchType: "direct",
      records: directMatches,
      providerName: site.primeProvider?.provider ?? null
    };
  }

  const providerName = site.primeProvider?.provider ?? null;

  if (!providerName) {
    return {
      matchType: "none",
      records: [],
      providerName: null
    };
  }

  const providerMatches = records.filter(
    (record) => record.routeFamily === "asylum_support" && namesMatch(providerName, record.supplierName)
  );

  if (providerMatches.length > 0) {
    return {
      matchType: "provider",
      records: providerMatches,
      providerName
    };
  }

  return {
    matchType: "none",
    records: [],
    providerName
  };
}

function buildPlaceHref(areaCode: string | null): string {
  return areaCode ? `/places/${areaCode}/#evidence-chain` : "/compare/#compare-explorer";
}

function buildSiteTrail(site: HotelSiteSummary, area: LocalRouteAreaSummary | undefined, match: MoneyMatch): InvestigationTrail {
  const leadRecord = match.records[0] ?? null;
  const unresolved = site.entityCoverage === "unresolved";
  const moneyQuery =
    match.matchType === "direct"
      ? site.siteName
      : match.providerName ?? leadRecord?.supplierName ?? site.siteName;
  const localPressureSummary = area
    ? `${area.supportedAsylum.toLocaleString()} people were on asylum support there at quarter end, with ${area.contingencyAccommodation.toLocaleString()} in contingency accommodation.`
    : "Open the place profile to read the local pressure frame beside the hotel evidence.";

  return {
    id: `trail:${site.siteId}`,
    kind: "site",
    kicker: unresolved ? "Broken chain" : "Visible chain",
    title: unresolved
      ? `${site.siteName} is public, but the chain still breaks`
      : `${site.siteName} now links the hotel and money layers`,
    summary:
      match.matchType === "direct"
        ? `${site.siteName} in ${site.areaName} already has a direct public money row attached. ${localPressureSummary}`
        : `${site.siteName} in ${site.areaName} already has a public hotel row and a provider-level money trail. ${localPressureSummary}`,
    tone: unresolved ? "accent" : match.matchType === "direct" ? "warm" : "teal",
    chips: [
      site.areaName,
      site.entityCoverage,
      match.matchType === "direct" ? "direct money link" : "provider money link"
    ],
    steps: [
      {
        label: "Hotel evidence",
        body: "Filter the hotel ledger straight to this site and its current chain status.",
        href: buildFilterHref(
          "/hotels/",
          {
            hotel_q: site.siteName,
            hotel_status: site.status
          },
          "hotel-filters"
        ),
        cta: "Open hotel trail"
      },
      {
        label: "Money trail",
        body:
          match.matchType === "direct" && leadRecord
            ? `${leadRecord.title} is already the public money row tied to this site.`
            : `${match.providerName ?? "The current provider"} is the public contract layer attached to this site in the live starter ledger.`,
        href: buildFilterHref(
          "/spending/",
          {
            money_q: moneyQuery,
            money_route: "asylum_support"
          },
          "money-explorer"
        ),
        cta: match.matchType === "direct" ? "Open direct money row" : "Open provider money trail"
      },
      {
        label: "Place pressure",
        body: localPressureSummary,
        href: buildPlaceHref(site.areaCode),
        cta: "Open place profile"
      }
    ],
    footnote:
      match.matchType === "provider"
        ? "The money step is provider-scope rather than site-specific."
        : undefined,
    areaName: site.areaName,
    areaCode: site.areaCode,
    siteId: site.siteId,
    siteName: site.siteName,
    moneyMatchType: match.matchType,
    moneyLeadTitle: leadRecord?.title ?? null,
    recordIds: match.records.map((record) => record.recordId)
  };
}

function buildAreaVisibilityTrail(area: LocalRouteAreaSummary, hotelArea: HotelAreaSummary): InvestigationTrail {
  return {
    id: `trail:visibility:${area.areaCode}`,
    kind: "area",
    kicker: "Visibility gap",
    title: `${area.areaName} acknowledges hotel use without naming the full estate`,
    summary:
      hotelArea.peopleHousedReported !== null
        ? `${hotelArea.unnamedSiteCount} unnamed site${hotelArea.unnamedSiteCount === 1 ? "" : "s"} are publicly acknowledged here, with ${hotelArea.peopleHousedReported.toLocaleString()} people reported.`
        : `${hotelArea.unnamedSiteCount} unnamed site${hotelArea.unnamedSiteCount === 1 ? "" : "s"} are publicly acknowledged here without a publishable hotel list.`,
    tone: "accent",
    chips: [area.areaName, "unnamed-only", "source-backed"],
    steps: [
      {
        label: "Hotel visibility",
        body: "Filter the hotel ledger to the unnamed-only view for this area.",
        href: buildFilterHref(
          "/hotels/",
          {
            hotel_q: area.areaName,
            hotel_visibility: "unnamed-only"
          },
          "hotel-filters"
        ),
        cta: "Open visibility gap"
      },
      {
        label: "Place pressure",
        body: `${area.supportedAsylum.toLocaleString()} people were on asylum support here at quarter end. The pressure line and the visibility gap belong in the same frame.`,
        href: buildPlaceHref(area.areaCode),
        cta: "Open place profile"
      },
      {
        label: "Source record",
        body: `${hotelArea.sourceTitle} is the public document acknowledging hotel use without naming each site.`,
        href: hotelArea.sourceUrl,
        cta: "Open source"
      }
    ],
    footnote: "This is an area-level visibility trail rather than a named site row.",
    areaName: area.areaName,
    areaCode: area.areaCode,
    siteId: null,
    siteName: null,
    moneyMatchType: "none",
    moneyLeadTitle: null,
    recordIds: []
  };
}

function getSiteTrailCandidates(
  areas: LocalRouteAreaSummary[],
  hotelLedger: HotelEntityLedger,
  moneyLedger: MoneyLedger
): SiteTrailCandidate[] {
  const areaByCode = new Map(areas.map((area) => [area.areaCode, area]));

  return hotelLedger.sites
    .filter((site) => site.status === "current")
    .map((site) => {
      const area = getAreaBySite(site, areaByCode, areas);
      const moneyMatch = getMoneyMatch(site, moneyLedger.records);
      const trail = buildSiteTrail(site, area, moneyMatch);
      const score =
        (site.entityCoverage === "unresolved" ? 300 : site.entityCoverage === "partial" ? 220 : 160) +
        (moneyMatch.matchType === "direct" ? 80 : 35) +
        site.integritySignalCount * 20 +
        (area?.contingencyAccommodation ?? 0) +
        Math.round((area?.supportedAsylum ?? 0) / 5);

      return { trail, score };
    })
    .sort((left, right) => right.score - left.score || left.trail.title.localeCompare(right.trail.title));
}

function selectUniqueAreaTrails(candidates: SiteTrailCandidate[], limit: number): InvestigationTrail[] {
  const selected: InvestigationTrail[] = [];
  const seenAreas = new Set<string>();

  for (const candidate of candidates) {
    const areaKey = candidate.trail.areaCode ?? candidate.trail.areaName;

    if (seenAreas.has(areaKey)) {
      continue;
    }

    selected.push(candidate.trail);
    seenAreas.add(areaKey);

    if (selected.length === limit) {
      break;
    }
  }

  return selected;
}

export function getSiteInvestigationTrailMap(
  areas: LocalRouteAreaSummary[],
  hotelLedger: HotelEntityLedger,
  moneyLedger: MoneyLedger
): Map<string, InvestigationTrail> {
  return new Map(
    getSiteTrailCandidates(areas, hotelLedger, moneyLedger)
      .filter((candidate) => candidate.trail.siteId)
      .map((candidate) => [candidate.trail.siteId as string, candidate.trail])
  );
}

export function getHomepageInvestigationTrails(
  areas: LocalRouteAreaSummary[],
  hotelLedger: HotelEntityLedger,
  moneyLedger: MoneyLedger,
  limit = 3
): InvestigationTrail[] {
  return selectUniqueAreaTrails(getSiteTrailCandidates(areas, hotelLedger, moneyLedger), limit);
}

export function getCompareInvestigationTrails(
  areas: LocalRouteAreaSummary[],
  hotelLedger: HotelEntityLedger,
  moneyLedger: MoneyLedger,
  limit = 3
): InvestigationTrail[] {
  return selectUniqueAreaTrails(
    getSiteTrailCandidates(areas, hotelLedger, moneyLedger).filter(
      (candidate) => candidate.trail.moneyMatchType !== "none"
    ),
    limit
  );
}

export function getRouteInvestigationTrails(
  areas: LocalRouteAreaSummary[],
  hotelLedger: HotelEntityLedger,
  moneyLedger: MoneyLedger,
  limit = 3
): InvestigationTrail[] {
  return selectUniqueAreaTrails(
    getSiteTrailCandidates(areas, hotelLedger, moneyLedger).filter(
      (candidate) => candidate.trail.kind === "site" && candidate.trail.siteName !== null
    ),
    limit
  );
}

export function getSpendingLinkedSiteTrails(
  areas: LocalRouteAreaSummary[],
  hotelLedger: HotelEntityLedger,
  moneyLedger: MoneyLedger,
  limit = 4
): InvestigationTrail[] {
  const selected: InvestigationTrail[] = [];
  const seenRecords = new Set<string>();

  for (const candidate of getSiteTrailCandidates(areas, hotelLedger, moneyLedger)) {
    if (candidate.trail.moneyMatchType !== "direct") {
      continue;
    }

    const leadRecordId = candidate.trail.recordIds[0] ?? candidate.trail.id;

    if (seenRecords.has(leadRecordId)) {
      continue;
    }

    selected.push(candidate.trail);
    seenRecords.add(leadRecordId);

    if (selected.length === limit) {
      break;
    }
  }

  return selected;
}

export function getPlaceInvestigationTrails(
  area: LocalRouteAreaSummary,
  hotelLedger: HotelEntityLedger,
  moneyLedger: MoneyLedger,
  areas: LocalRouteAreaSummary[],
  limit = 3
): InvestigationTrail[] {
  const siteTrails = getSiteTrailCandidates(areas, hotelLedger, moneyLedger)
    .filter((candidate) => candidate.trail.areaCode === area.areaCode || candidate.trail.areaName === area.areaName)
    .map((candidate) => candidate.trail);
  const hotelArea = hotelLedger.areas.find(
    (candidate) => candidate.areaCode === area.areaCode || candidate.areaName === area.areaName
  );

  if (hotelArea?.unnamedSiteCount) {
    siteTrails.push(buildAreaVisibilityTrail(area, hotelArea));
  }

  return siteTrails.slice(0, limit);
}
