import { loadHotelEntityLedger, type HotelSiteSummary } from "./hotel-data";
import { loadMoneyLedger, type MoneyRecord } from "./money-data";
import { loadLocalRouteLatest } from "./route-data";
import type { InvestigationTrail } from "./investigations";

export interface EntityProfileSite {
  siteId: string;
  siteName: string;
  areaName: string;
  areaCode: string | null;
  regionName: string;
  countryName: string;
  status: string;
  entityCoverage: string;
  confidence: string;
  peopleHousedReported: number | null;
  firstPublicDate: string | null;
  lastPublicDate: string | null;
  sourceTitle: string;
  sourceUrl: string;
  relationshipLabels: string[];
  moneyRecordCount: number;
  integritySignalCount: number;
}

export interface EntityProfileArea {
  areaName: string;
  areaCode: string | null;
  regionName: string;
  countryName: string;
  supportedAsylum: number | null;
  supportedAsylumRate: number | null;
  contingencyAccommodation: number | null;
  currentSiteCount: number;
  historicalSiteCount: number;
  siteNames: string[];
}

export interface EntitySourceLink {
  title: string;
  url: string;
  kind: "money_row" | "supplier_profile" | "hotel_link" | "hotel_site" | "prime_provider";
}

export interface EntityProfile {
  entityId: string;
  entityName: string;
  companyNumber: string | null;
  primaryRole: string;
  primaryRoleLabel: string;
  roleLabels: string[];
  roleSummary: string;
  riskLevel: string | null;
  routeFamilies: string[];
  publicContractCount: number;
  publicContractValueGbp: number | null;
  moneyRecordCount: number;
  moneyRowsWithPublishedValueCount: number;
  currentSiteCount: number;
  historicalSiteCount: number;
  unresolvedCurrentSiteCount: number;
  integritySignalCount: number;
  linkedAreaCount: number;
  siteIds: string[];
  linkedAreas: EntityProfileArea[];
  currentSites: EntityProfileSite[];
  historicalSites: EntityProfileSite[];
  moneyRecords: MoneyRecord[];
  sourceLinks: EntitySourceLink[];
  notes: string[];
  searchDescription: string;
  score: number;
}

interface MutableSiteBinding {
  site: HotelSiteSummary;
  roles: Set<string>;
  moneyRecordIds: Set<string>;
}

interface MutableProfile {
  entityId: string;
  entityName: string;
  companyNumber: string | null;
  roles: Set<string>;
  riskLevel: string | null;
  routeFamilies: Set<string>;
  supplierIds: Set<string>;
  sourceLinks: Map<string, EntitySourceLink>;
  notes: Set<string>;
  moneyRecords: Map<string, MoneyRecord>;
  siteBindings: Map<string, MutableSiteBinding>;
  integritySignalIds: Set<string>;
}

const ROLE_PRIORITY: Record<string, number> = {
  prime_provider: 100,
  owner_group: 90,
  freeholder: 85,
  brand_operator: 80,
  operator: 75,
  hotel_operator: 70,
  public_body: 40
};

const RISK_PRIORITY: Record<string, number> = {
  high: 4,
  elevated: 3,
  medium: 2,
  warning: 2,
  low: 1
};

let cachedProfiles: EntityProfile[] | null = null;

function slugify(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function normalizeName(value: string | null | undefined): string {
  return (value ?? "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function buildEntityKey(name: string | null | undefined, companyNumber: string | null | undefined): string {
  return (companyNumber ?? normalizeName(name)).toLowerCase();
}

function pickRiskLevel(left: string | null, right: string | null): string | null {
  const leftRank = left ? (RISK_PRIORITY[left] ?? 0) : 0;
  const rightRank = right ? (RISK_PRIORITY[right] ?? 0) : 0;

  return rightRank > leftRank ? right : left;
}

function addSourceLink(profile: MutableProfile, source: EntitySourceLink): void {
  const key = `${source.kind}|${source.url}|${source.title}`;
  profile.sourceLinks.set(key, source);
}

function ensureProfile(
  profiles: Map<string, MutableProfile>,
  key: string,
  preferredId: string | null,
  entityName: string,
  companyNumber: string | null
): MutableProfile {
  const existing = profiles.get(key);

  if (existing) {
    if (preferredId && existing.entityId.startsWith("entity-")) {
      existing.entityId = preferredId;
    }

    if (entityName.length > existing.entityName.length) {
      existing.entityName = entityName;
    }

    if (!existing.companyNumber && companyNumber) {
      existing.companyNumber = companyNumber;
    }

    return existing;
  }

  const profile: MutableProfile = {
    entityId: preferredId ?? `entity-${slugify(companyNumber ?? entityName)}`,
    entityName,
    companyNumber,
    roles: new Set<string>(),
    riskLevel: null,
    routeFamilies: new Set<string>(),
    supplierIds: new Set<string>(),
    sourceLinks: new Map<string, EntitySourceLink>(),
    notes: new Set<string>(),
    moneyRecords: new Map<string, MoneyRecord>(),
    siteBindings: new Map<string, MutableSiteBinding>(),
    integritySignalIds: new Set<string>()
  };

  profiles.set(key, profile);
  return profile;
}

function ensureSiteBinding(profile: MutableProfile, site: HotelSiteSummary): MutableSiteBinding {
  const existing = profile.siteBindings.get(site.siteId);

  if (existing) {
    return existing;
  }

  const binding: MutableSiteBinding = {
    site,
    roles: new Set<string>(),
    moneyRecordIds: new Set<string>()
  };

  profile.siteBindings.set(site.siteId, binding);
  return binding;
}

export function formatEntityRoleLabel(role: string): string {
  switch (role) {
    case "prime_provider":
      return "Prime provider";
    case "owner_group":
      return "Owner group";
    case "freeholder":
      return "Freeholder";
    case "brand_operator":
      return "Brand operator";
    case "operator":
      return "Operator";
    case "hotel_operator":
      return "Hotel operator";
    case "public_body":
      return "Public body";
    default:
      return role.replaceAll("_", " ");
  }
}

export function formatRouteFamilyLabel(routeFamily: string): string {
  switch (routeFamily) {
    case "asylum_support":
      return "Asylum support";
    case "homes_for_ukraine":
      return "Homes for Ukraine";
    case "uk_resettlement_scheme":
      return "UK Resettlement Scheme";
    case "afghan_resettlement_programme":
      return "Afghan Resettlement Programme";
    case "not_route_specific":
      return "Not route-specific";
    default:
      return routeFamily;
  }
}

function sortRoles(roles: Set<string>): string[] {
  return [...roles].sort((left, right) => {
    const leftPriority = ROLE_PRIORITY[left] ?? 0;
    const rightPriority = ROLE_PRIORITY[right] ?? 0;
    return rightPriority - leftPriority || left.localeCompare(right);
  });
}

function buildRoleSummary(roleLabels: string[]): string {
  if (roleLabels.length <= 2) {
    return roleLabels.join(" / ");
  }

  return `${roleLabels.slice(0, 2).join(" / ")} / ${roleLabels.length - 2} more`;
}

function buildSearchDescription(profile: Omit<EntityProfile, "searchDescription">): string {
  if (profile.currentSiteCount > 0 && profile.moneyRecordCount > 0) {
    return `${profile.primaryRoleLabel} with ${profile.currentSiteCount} current named site${profile.currentSiteCount === 1 ? "" : "s"}, ${profile.moneyRecordCount} public money row${profile.moneyRecordCount === 1 ? "" : "s"}, and ${profile.unresolvedCurrentSiteCount} current chain gap${profile.unresolvedCurrentSiteCount === 1 ? "" : "s"}.`;
  }

  if (profile.currentSiteCount > 0) {
    return `${profile.primaryRoleLabel} linked to ${profile.currentSiteCount} current named site${profile.currentSiteCount === 1 ? "" : "s"} across ${profile.linkedAreaCount} place${profile.linkedAreaCount === 1 ? "" : "s"}.`;
  }

  return `${profile.primaryRoleLabel} with ${profile.moneyRecordCount} public money row${profile.moneyRecordCount === 1 ? "" : "s"} across ${profile.routeFamilies.length} route famil${profile.routeFamilies.length === 1 ? "y" : "ies"}.`;
}

function buildEntityProfiles(): EntityProfile[] {
  const moneyLedger = loadMoneyLedger();
  const hotelLedger = loadHotelEntityLedger();
  const localRouteLatest = loadLocalRouteLatest();
  const areaByCode = new Map(localRouteLatest.areas.map((area) => [area.areaCode, area]));
  const areaByName = new Map(localRouteLatest.areas.map((area) => [area.areaName, area]));
  const siteById = new Map(hotelLedger.sites.map((site) => [site.siteId, site]));
  const profiles = new Map<string, MutableProfile>();
  const keyBySupplierId = new Map<string, string>();

  for (const supplier of moneyLedger.supplierProfiles) {
    const key = buildEntityKey(supplier.entityName, supplier.companyNumber);
    const profile = ensureProfile(profiles, key, supplier.supplierId, supplier.entityName, supplier.companyNumber);

    profile.roles.add(supplier.entityRole);
    profile.riskLevel = pickRiskLevel(profile.riskLevel, supplier.riskLevel);
    profile.supplierIds.add(supplier.supplierId);
    supplier.routeFamilies.forEach((routeFamily) => profile.routeFamilies.add(routeFamily));
    supplier.sourceUrls?.forEach((url) =>
      addSourceLink(profile, {
        title: `${supplier.entityName} supplier source`,
        url,
        kind: "supplier_profile"
      })
    );
    if (supplier.notes) {
      profile.notes.add(supplier.notes);
    }

    keyBySupplierId.set(supplier.supplierId, key);
  }

  for (const record of moneyLedger.records) {
    const matchedKey =
      (record.supplierId ? keyBySupplierId.get(record.supplierId) : undefined) ??
      buildEntityKey(record.supplierName, record.supplierCompanyNumber);

    if (!matchedKey) {
      continue;
    }

    const profile = ensureProfile(
      profiles,
      matchedKey,
      record.supplierId ?? null,
      record.supplierName ?? "Unnamed supplier",
      record.supplierCompanyNumber
    );

    profile.moneyRecords.set(record.recordId, record);
    if (record.routeFamily) {
      profile.routeFamilies.add(record.routeFamily);
    }
    if (record.sourceTitle && record.sourceUrl) {
      addSourceLink(profile, {
        title: record.sourceTitle,
        url: record.sourceUrl,
        kind: "money_row"
      });
    }
  }

  for (const site of hotelLedger.sites) {
    for (const link of site.entityLinks) {
      const key = buildEntityKey(link.entityName, link.companyNumber);
      const profile = ensureProfile(profiles, key, null, link.entityName, link.companyNumber);
      const binding = ensureSiteBinding(profile, site);

      binding.roles.add(link.linkRole);
      if (link.notes) {
        profile.notes.add(link.notes);
      }

      link.sources.forEach((source) =>
        addSourceLink(profile, {
          title: source.title,
          url: source.url,
          kind: "hotel_link"
        })
      );

      if (site.sourceTitle && site.sourceUrl) {
        addSourceLink(profile, {
          title: site.sourceTitle,
          url: site.sourceUrl,
          kind: "hotel_site"
        });
      }
    }

    if (site.primeProvider) {
      const key = buildEntityKey(site.primeProvider.provider, null);
      const profile = ensureProfile(profiles, key, null, site.primeProvider.provider, null);
      const binding = ensureSiteBinding(profile, site);

      binding.roles.add("prime_provider");
      if (site.primeProvider.note) {
        profile.notes.add(site.primeProvider.note);
      }
      addSourceLink(profile, {
        title: `${site.primeProvider.provider} prime-provider source`,
        url: site.primeProvider.sourceUrl,
        kind: "prime_provider"
      });
    }
  }

  for (const supplier of moneyLedger.supplierProfiles) {
    const key = keyBySupplierId.get(supplier.supplierId);

    if (!key) {
      continue;
    }

    const profile = profiles.get(key);

    if (!profile) {
      continue;
    }

    for (const siteId of supplier.siteIds) {
      const site = siteById.get(siteId);

      if (!site) {
        continue;
      }

      const binding = ensureSiteBinding(profile, site);
      binding.roles.add(supplier.entityRole);
    }
  }

  for (const profile of profiles.values()) {
    for (const record of profile.moneyRecords.values()) {
      for (const siteId of record.siteIds) {
        const site = siteById.get(siteId);

        if (!site) {
          continue;
        }

        const binding = ensureSiteBinding(profile, site);
        binding.moneyRecordIds.add(record.recordId);
      }
    }

    for (const binding of profile.siteBindings.values()) {
      binding.site.integritySignals.forEach((signal) => profile.integritySignalIds.add(signal.signalId));
    }
  }

  return [...profiles.values()]
    .map((profile) => {
      const sortedRoles = sortRoles(profile.roles);
      const roleLabels = sortedRoles.map(formatEntityRoleLabel);
      const primaryRole = sortedRoles[0] ?? "other";
      const currentSites = [...profile.siteBindings.values()]
        .map((binding) => ({
          siteId: binding.site.siteId,
          siteName: binding.site.siteName,
          areaName: binding.site.areaName,
          areaCode: binding.site.areaCode,
          regionName: binding.site.regionName,
          countryName: binding.site.countryName,
          status: binding.site.status,
          entityCoverage: binding.site.entityCoverage,
          confidence: binding.site.confidence,
          peopleHousedReported: binding.site.peopleHousedReported,
          firstPublicDate: binding.site.firstPublicDate,
          lastPublicDate: binding.site.lastPublicDate,
          sourceTitle: binding.site.sourceTitle,
          sourceUrl: binding.site.sourceUrl,
          relationshipLabels: sortRoles(binding.roles).map(formatEntityRoleLabel),
          moneyRecordCount: binding.moneyRecordIds.size,
          integritySignalCount: binding.site.integritySignalCount
        }))
        .sort(
          (left, right) =>
            (right.status === "current" ? 1 : 0) - (left.status === "current" ? 1 : 0) ||
            right.integritySignalCount - left.integritySignalCount ||
            left.siteName.localeCompare(right.siteName)
        );

      const currentSiteRows = currentSites.filter((site) => site.status === "current");
      const historicalSiteRows = currentSites.filter((site) => site.status !== "current");
      const areaSummaries = new Map<string, EntityProfileArea>();

      for (const site of currentSites) {
        const areaKey = site.areaCode ?? site.areaName;
        const existing = areaSummaries.get(areaKey);
        const routeArea =
          (site.areaCode ? areaByCode.get(site.areaCode) : undefined) ?? areaByName.get(site.areaName) ?? null;

        if (existing) {
          if (site.status === "current") {
            existing.currentSiteCount += 1;
          } else {
            existing.historicalSiteCount += 1;
          }
          existing.siteNames.push(site.siteName);
          continue;
        }

        areaSummaries.set(areaKey, {
          areaName: site.areaName,
          areaCode: site.areaCode,
          regionName: site.regionName,
          countryName: site.countryName,
          supportedAsylum: routeArea?.supportedAsylum ?? null,
          supportedAsylumRate: routeArea?.supportedAsylumRate ?? null,
          contingencyAccommodation: routeArea?.contingencyAccommodation ?? null,
          currentSiteCount: site.status === "current" ? 1 : 0,
          historicalSiteCount: site.status === "current" ? 0 : 1,
          siteNames: [site.siteName]
        });
      }

      const moneyRecords = [...profile.moneyRecords.values()].sort(
        (left, right) =>
          right.siteIds.length - left.siteIds.length ||
          (right.valueGbp ?? -1) - (left.valueGbp ?? -1) ||
          left.title.localeCompare(right.title)
      );
      const publicContractValueGbp = moneyRecords.reduce<number | null>((total, record) => {
        if (record.valueGbp === null) {
          return total;
        }

        return (total ?? 0) + record.valueGbp;
      }, null);
      const linkedAreas = [...areaSummaries.values()].sort(
        (left, right) =>
          right.currentSiteCount - left.currentSiteCount ||
          (right.supportedAsylum ?? -1) - (left.supportedAsylum ?? -1) ||
          left.areaName.localeCompare(right.areaName)
      );
      const resultBase = {
        entityId: profile.entityId,
        entityName: profile.entityName,
        companyNumber: profile.companyNumber,
        primaryRole,
        primaryRoleLabel: formatEntityRoleLabel(primaryRole),
        roleLabels,
        roleSummary: buildRoleSummary(roleLabels),
        riskLevel: profile.riskLevel,
        routeFamilies: [...profile.routeFamilies].sort((left, right) =>
          formatRouteFamilyLabel(left).localeCompare(formatRouteFamilyLabel(right))
        ),
        publicContractCount: moneyRecords.length,
        publicContractValueGbp,
        moneyRecordCount: moneyRecords.length,
        moneyRowsWithPublishedValueCount: moneyRecords.filter((record) => record.valueGbp !== null).length,
        currentSiteCount: currentSiteRows.length,
        historicalSiteCount: historicalSiteRows.length,
        unresolvedCurrentSiteCount: currentSiteRows.filter((site) => site.entityCoverage !== "resolved").length,
        integritySignalCount: profile.integritySignalIds.size,
        linkedAreaCount: linkedAreas.length,
        siteIds: currentSites.map((site) => site.siteId),
        linkedAreas,
        currentSites: currentSiteRows,
        historicalSites: historicalSiteRows,
        moneyRecords,
        sourceLinks: [...profile.sourceLinks.values()].sort(
          (left, right) => left.title.localeCompare(right.title) || left.url.localeCompare(right.url)
        ),
        notes: [...profile.notes].sort((left, right) => left.localeCompare(right)),
        score:
          currentSiteRows.length * 180 +
          moneyRecords.length * 50 +
          profile.integritySignalIds.size * 30 +
          linkedAreas.length * 20 +
          currentSiteRows.filter((site) => site.entityCoverage !== "resolved").length * 40
      };

      return {
        ...resultBase,
        searchDescription: buildSearchDescription(resultBase)
      } satisfies EntityProfile;
    })
    .sort((left, right) => right.score - left.score || left.entityName.localeCompare(right.entityName));
}

export function getEntityProfiles(): EntityProfile[] {
  if (!cachedProfiles) {
    cachedProfiles = buildEntityProfiles();
  }

  return cachedProfiles;
}

export function getEntityProfile(entityId: string): EntityProfile | undefined {
  return getEntityProfiles().find((profile) => profile.entityId === entityId);
}

export function getEntityProfileByReference(
  entityName: string | null | undefined,
  companyNumber: string | null | undefined
): EntityProfile | undefined {
  const key = buildEntityKey(entityName, companyNumber);

  return getEntityProfiles().find(
    (profile) => buildEntityKey(profile.entityName, profile.companyNumber) === key
  );
}

export function getLeadEntityProfileForTrail(
  trail: Pick<InvestigationTrail, "siteId" | "recordIds">
): EntityProfile | undefined {
  const candidates = getEntityProfiles()
    .map((profile) => {
      let score = 0;

      if (trail.siteId && profile.siteIds.includes(trail.siteId)) {
        score += 30;
      }

      if (trail.recordIds.some((recordId) => profile.moneyRecords.some((record) => record.recordId === recordId))) {
        score += 50;
      }

      if (profile.primaryRole === "prime_provider") {
        score += 10;
      }

      return { profile, score };
    })
    .filter((candidate) => candidate.score > 0)
    .sort((left, right) => right.score - left.score || right.profile.score - left.profile.score);

  return candidates[0]?.profile;
}
