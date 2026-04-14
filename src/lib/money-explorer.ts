export interface MoneyExplorerItem {
  recordId: string;
  title: string;
  buyerName: string;
  supplierName: string;
  routeFamily: string;
  recordType: string;
  scopeClass: string;
  hasValue: boolean;
  valueGbp: number;
  linkedSiteCount: number;
  siteIds: string[];
  publishedAt: string;
  searchText: string;
}

export interface MoneyExplorerState {
  query: string;
  routeFamily: string;
  recordType: string;
  buyerName: string;
  valueMode: "all" | "with_value" | "without_value";
  scopeClass: string;
  sort: "newest" | "value" | "linked_sites" | "title";
}

export interface MoneyExplorerSummary {
  recordCount: number;
  rowsWithValue: number;
  disclosedValueTotal: number;
  linkedSiteCount: number;
  buyerCount: number;
  supplierCount: number;
  leadBuyerName: string | null;
  leadRouteFamily: string | null;
}

function normalise(value: string): string {
  return value.trim().toLowerCase();
}

function compareNewest(left: MoneyExplorerItem, right: MoneyExplorerItem): number {
  return right.publishedAt.localeCompare(left.publishedAt) || right.valueGbp - left.valueGbp || left.title.localeCompare(right.title);
}

function compareValue(left: MoneyExplorerItem, right: MoneyExplorerItem): number {
  return right.valueGbp - left.valueGbp || right.linkedSiteCount - left.linkedSiteCount || compareNewest(left, right);
}

function compareLinkedSites(left: MoneyExplorerItem, right: MoneyExplorerItem): number {
  return right.linkedSiteCount - left.linkedSiteCount || right.valueGbp - left.valueGbp || compareNewest(left, right);
}

function compareTitle(left: MoneyExplorerItem, right: MoneyExplorerItem): number {
  return left.title.localeCompare(right.title) || compareNewest(left, right);
}

export function filterMoneyExplorerItems(
  items: MoneyExplorerItem[],
  state: MoneyExplorerState
): MoneyExplorerItem[] {
  const query = normalise(state.query);

  return items.filter((item) => {
    const matchesQuery = !query || item.searchText.includes(query);
    const matchesRoute = state.routeFamily === "all" || item.routeFamily === state.routeFamily;
    const matchesType = state.recordType === "all" || item.recordType === state.recordType;
    const matchesBuyer = state.buyerName === "all" || item.buyerName === state.buyerName;
    const matchesValue =
      state.valueMode === "all" ||
      (state.valueMode === "with_value" && item.hasValue) ||
      (state.valueMode === "without_value" && !item.hasValue);
    const matchesScope = state.scopeClass === "all" || item.scopeClass === state.scopeClass;

    return matchesQuery && matchesRoute && matchesType && matchesBuyer && matchesValue && matchesScope;
  });
}

export function sortMoneyExplorerItems(
  items: MoneyExplorerItem[],
  sort: MoneyExplorerState["sort"]
): MoneyExplorerItem[] {
  const copy = [...items];

  copy.sort((left, right) => {
    switch (sort) {
      case "value":
        return compareValue(left, right);
      case "linked_sites":
        return compareLinkedSites(left, right);
      case "title":
        return compareTitle(left, right);
      default:
        return compareNewest(left, right);
    }
  });

  return copy;
}

export function summarizeMoneyExplorerItems(items: MoneyExplorerItem[]): MoneyExplorerSummary {
  const buyerCounts = new Map<string, number>();
  const routeCounts = new Map<string, number>();
  const buyerNames = new Set<string>();
  const supplierNames = new Set<string>();
  const siteIds = new Set<string>();
  let rowsWithValue = 0;
  let disclosedValueTotal = 0;

  for (const item of items) {
    if (item.buyerName) {
      buyerNames.add(item.buyerName);
      buyerCounts.set(item.buyerName, (buyerCounts.get(item.buyerName) ?? 0) + 1);
    }

    if (item.supplierName) {
      supplierNames.add(item.supplierName);
    }

    if (item.routeFamily) {
      routeCounts.set(item.routeFamily, (routeCounts.get(item.routeFamily) ?? 0) + 1);
    }

    if (item.hasValue) {
      rowsWithValue += 1;
      disclosedValueTotal += item.valueGbp;
    }

    for (const siteId of item.siteIds) {
      siteIds.add(siteId);
    }
  }

  const leadBuyerName =
    [...buyerCounts.entries()].sort((left, right) => right[1] - left[1] || left[0].localeCompare(right[0]))[0]?.[0] ?? null;
  const leadRouteFamily =
    [...routeCounts.entries()].sort((left, right) => right[1] - left[1] || left[0].localeCompare(right[0]))[0]?.[0] ?? null;

  return {
    recordCount: items.length,
    rowsWithValue,
    disclosedValueTotal,
    linkedSiteCount: siteIds.size,
    buyerCount: buyerNames.size,
    supplierCount: supplierNames.size,
    leadBuyerName,
    leadRouteFamily
  };
}
