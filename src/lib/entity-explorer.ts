export interface EntityExplorerItem {
  entityId: string;
  entityName: string;
  primaryRole: string;
  routeFamilies: string[];
  currentSiteCount: number;
  moneyRecordCount: number;
  linkedAreaCount: number;
  unresolvedCurrentSiteCount: number;
  moneyRowsWithPublishedValueCount: number;
  firstEvidenceDate: string | null;
  latestEvidenceDate: string | null;
  regionalCoverageAreaCount: number;
  namedCoverageAreaCount: number;
  score: number;
  searchText: string;
}

export interface EntityExplorerState {
  query: string;
  role: string;
  routeFamily: string;
  surface: "all" | "dated_evidence" | "named_chain" | "regional_provider";
  footprint: "all" | "named_estate" | "money_only" | "unresolved_estate";
  sort: "exposure" | "money" | "estate" | "title" | "newest" | "oldest" | "regional";
}

export interface EntityExplorerSummary {
  profileCount: number;
  namedEstateCount: number;
  moneyLinkedCount: number;
  unresolvedEstateCount: number;
  datedEvidenceCount: number;
  regionalCoverageCount: number;
  leadRole: string | null;
}

function normalise(value: string): string {
  return value.trim().toLowerCase();
}

function compareExposure(left: EntityExplorerItem, right: EntityExplorerItem): number {
  return (
    right.score - left.score ||
    right.unresolvedCurrentSiteCount - left.unresolvedCurrentSiteCount ||
    right.currentSiteCount - left.currentSiteCount ||
    right.moneyRecordCount - left.moneyRecordCount ||
    left.entityName.localeCompare(right.entityName)
  );
}

function compareMoney(left: EntityExplorerItem, right: EntityExplorerItem): number {
  return (
    right.moneyRecordCount - left.moneyRecordCount ||
    right.moneyRowsWithPublishedValueCount - left.moneyRowsWithPublishedValueCount ||
    compareExposure(left, right)
  );
}

function compareEstate(left: EntityExplorerItem, right: EntityExplorerItem): number {
  return (
    right.currentSiteCount - left.currentSiteCount ||
    right.linkedAreaCount - left.linkedAreaCount ||
    right.unresolvedCurrentSiteCount - left.unresolvedCurrentSiteCount ||
    compareExposure(left, right)
  );
}

function compareTitle(left: EntityExplorerItem, right: EntityExplorerItem): number {
  return left.entityName.localeCompare(right.entityName) || compareExposure(left, right);
}

function compareOptionalDateDescending(left: string | null, right: string | null): number {
  if (left && right) {
    return right.localeCompare(left);
  }

  if (right) {
    return 1;
  }

  if (left) {
    return -1;
  }

  return 0;
}

function compareOptionalDateAscending(left: string | null, right: string | null): number {
  if (left && right) {
    return left.localeCompare(right);
  }

  if (left) {
    return -1;
  }

  if (right) {
    return 1;
  }

  return 0;
}

function compareNewest(left: EntityExplorerItem, right: EntityExplorerItem): number {
  return compareOptionalDateDescending(left.latestEvidenceDate, right.latestEvidenceDate) || compareExposure(left, right);
}

function compareOldest(left: EntityExplorerItem, right: EntityExplorerItem): number {
  return compareOptionalDateAscending(left.firstEvidenceDate, right.firstEvidenceDate) || compareExposure(left, right);
}

function compareRegional(left: EntityExplorerItem, right: EntityExplorerItem): number {
  return (
    right.regionalCoverageAreaCount - left.regionalCoverageAreaCount ||
    right.namedCoverageAreaCount - left.namedCoverageAreaCount ||
    right.linkedAreaCount - left.linkedAreaCount ||
    compareExposure(left, right)
  );
}

export function filterEntityExplorerItems<T extends EntityExplorerItem>(
  items: T[],
  state: EntityExplorerState
): T[] {
  const query = normalise(state.query);

  return items.filter((item) => {
    const matchesQuery = !query || item.searchText.includes(query);
    const matchesRole = state.role === "all" || item.primaryRole === state.role;
    const matchesRoute = state.routeFamily === "all" || item.routeFamilies.includes(state.routeFamily);
    const matchesSurface =
      state.surface === "all" ||
      (state.surface === "dated_evidence" && Boolean(item.latestEvidenceDate || item.firstEvidenceDate)) ||
      (state.surface === "named_chain" && item.currentSiteCount > 0 && Boolean(item.firstEvidenceDate)) ||
      (state.surface === "regional_provider" && item.regionalCoverageAreaCount > 0);
    const matchesFootprint =
      state.footprint === "all" ||
      (state.footprint === "named_estate" && item.currentSiteCount > 0) ||
      (state.footprint === "money_only" && item.currentSiteCount === 0 && item.moneyRecordCount > 0) ||
      (state.footprint === "unresolved_estate" && item.unresolvedCurrentSiteCount > 0);

    return matchesQuery && matchesRole && matchesRoute && matchesSurface && matchesFootprint;
  });
}

export function sortEntityExplorerItems<T extends EntityExplorerItem>(
  items: T[],
  sort: EntityExplorerState["sort"]
): T[] {
  const copy = [...items];

  copy.sort((left, right) => {
    switch (sort) {
      case "money":
        return compareMoney(left, right);
      case "estate":
        return compareEstate(left, right);
      case "newest":
        return compareNewest(left, right);
      case "oldest":
        return compareOldest(left, right);
      case "regional":
        return compareRegional(left, right);
      case "title":
        return compareTitle(left, right);
      default:
        return compareExposure(left, right);
    }
  });

  return copy;
}

export function summarizeEntityExplorerItems(items: EntityExplorerItem[]): EntityExplorerSummary {
  const roleCounts = new Map<string, number>();

  for (const item of items) {
    roleCounts.set(item.primaryRole, (roleCounts.get(item.primaryRole) ?? 0) + 1);
  }

  const leadRole =
    [...roleCounts.entries()].sort((left, right) => right[1] - left[1] || left[0].localeCompare(right[0]))[0]?.[0] ??
    null;

  return {
    profileCount: items.length,
    namedEstateCount: items.filter((item) => item.currentSiteCount > 0).length,
    moneyLinkedCount: items.filter((item) => item.moneyRecordCount > 0).length,
    unresolvedEstateCount: items.filter((item) => item.unresolvedCurrentSiteCount > 0).length,
    datedEvidenceCount: items.filter((item) => item.latestEvidenceDate || item.firstEvidenceDate).length,
    regionalCoverageCount: items.filter((item) => item.regionalCoverageAreaCount > 0).length,
    leadRole
  };
}
