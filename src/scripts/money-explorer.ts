import {
  filterMoneyExplorerItems,
  sortMoneyExplorerItems,
  summarizeMoneyExplorerItems,
  type MoneyExplorerItem,
  type MoneyExplorerState
} from "../lib/money-explorer";
import { wireShareState } from "./share-state";

function toNumber(value: string | undefined): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function formatMoney(value: number): string {
  return new Intl.NumberFormat("en-GB", {
    style: "currency",
    currency: "GBP",
    maximumFractionDigits: value >= 1000 ? 0 : 2
  }).format(value);
}

function toRouteLabel(routeFamily: string | null): string {
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
    case "":
    case null:
      return "No route label";
    default:
      return routeFamily.replaceAll("_", " ");
  }
}

export function initMoneyExplorer(): void {
  const root = document.getElementById("money-explorer");

  if (!(root instanceof HTMLElement)) {
    return;
  }

  const form = root.querySelector<HTMLFormElement>("[data-money-form]");
  const summary = root.querySelector<HTMLElement>("[data-money-summary]");
  const meta = root.querySelector<HTMLElement>("[data-money-meta]");
  const empty = root.querySelector<HTMLElement>("[data-money-empty]");
  const reset = root.querySelector<HTMLButtonElement>("[data-money-reset]");
  const rowsRoot = document.querySelector<HTMLElement>("[data-money-rows]");
  const resultCount = root.querySelector<HTMLElement>("[data-money-result-count]");
  const disclosedValue = root.querySelector<HTMLElement>("[data-money-value-total]");
  const linkedSites = root.querySelector<HTMLElement>("[data-money-linked-sites]");
  const leadBuyer = root.querySelector<HTMLElement>("[data-money-lead-buyer]");
  const copy = root.querySelector<HTMLButtonElement>("[data-money-copy]");
  const copyStatus = root.querySelector<HTMLElement>("[data-money-copy-status]");

  if (!form || !summary || !meta || !empty || !rowsRoot || !resultCount || !disclosedValue || !linkedSites || !leadBuyer) {
    return;
  }

  const queryInput = form.querySelector<HTMLInputElement>('input[name="money_q"]');
  const routeSelect = form.querySelector<HTMLSelectElement>('select[name="money_route"]');
  const typeSelect = form.querySelector<HTMLSelectElement>('select[name="money_type"]');
  const buyerSelect = form.querySelector<HTMLSelectElement>('select[name="money_buyer"]');
  const valueSelect = form.querySelector<HTMLSelectElement>('select[name="money_value"]');
  const scopeSelect = form.querySelector<HTMLSelectElement>('select[name="money_scope"]');
  const sortSelect = form.querySelector<HTMLSelectElement>('select[name="money_sort"]');

  if (!queryInput || !routeSelect || !typeSelect || !buyerSelect || !valueSelect || !scopeSelect || !sortSelect) {
    return;
  }

  const rows = rowsRoot;
  const summaryElement = summary;
  const metaElement = meta;
  const emptyElement = empty;
  const resultCountElement = resultCount;
  const disclosedValueElement = disclosedValue;
  const linkedSitesElement = linkedSites;
  const leadBuyerElement = leadBuyer;
  const query = queryInput;
  const route = routeSelect;
  const type = typeSelect;
  const buyer = buyerSelect;
  const value = valueSelect;
  const scope = scopeSelect;
  const sort = sortSelect;
  const share = wireShareState({
    button: copy,
    statusElement: copyStatus,
    getUrl: () => new URL(buildRelativeUrl(), window.location.origin).toString(),
    successMessage: "Filtered money view copied"
  });

  const items = Array.from(rows.querySelectorAll<HTMLElement>("[data-money-row]")).map((element) => ({
    element,
    item: {
      recordId: element.dataset.recordId ?? "",
      title: element.dataset.title ?? "",
      buyerName: element.dataset.buyer ?? "",
      supplierName: element.dataset.supplier ?? "",
      routeFamily: element.dataset.route ?? "not_route_specific",
      recordType: element.dataset.recordType ?? "",
      scopeClass: element.dataset.scope ?? "",
      hasValue: element.dataset.hasValue === "true",
      valueGbp: toNumber(element.dataset.value),
      linkedSiteCount: toNumber(element.dataset.linkedSites),
      siteIds: (element.dataset.siteIds ?? "")
        .split(",")
        .map((item) => item.trim())
        .filter(Boolean),
      publishedAt: element.dataset.publishedAt ?? "",
      searchText: element.dataset.searchText ?? ""
    } satisfies MoneyExplorerItem
  }));

  function readStateFromUrl(): void {
    const params = new URLSearchParams(window.location.search);
    query.value = params.get("money_q") ?? "";
    route.value = params.get("money_route") ?? "all";
    type.value = params.get("money_type") ?? "all";
    buyer.value = params.get("money_buyer") ?? "all";
    value.value = params.get("money_value") ?? "all";
    scope.value = params.get("money_scope") ?? "all";
    sort.value = params.get("money_sort") ?? "newest";
  }

  function buildRelativeUrl(): string {
    const params = new URLSearchParams(window.location.search);
    const nextEntries = {
      money_q: query.value.trim(),
      money_route: route.value,
      money_type: type.value,
      money_buyer: buyer.value,
      money_value: value.value,
      money_scope: scope.value,
      money_sort: sort.value
    };

    for (const [key, currentValue] of Object.entries(nextEntries)) {
      const defaultValue =
        key === "money_q"
          ? ""
          : key === "money_sort"
            ? "newest"
            : "all";

      if (!currentValue || currentValue === defaultValue) {
        params.delete(key);
      } else {
        params.set(key, currentValue);
      }
    }

    return `${window.location.pathname}${params.toString() ? `?${params.toString()}` : ""}#money-explorer`;
  }

  function writeStateToUrl(): void {
    window.history.replaceState({}, "", buildRelativeUrl());
  }

  function applyFilters(): void {
    const state: MoneyExplorerState = {
      query: query.value,
      routeFamily: route.value,
      recordType: type.value,
      buyerName: buyer.value,
      valueMode: value.value as MoneyExplorerState["valueMode"],
      scopeClass: scope.value,
      sort: sort.value as MoneyExplorerState["sort"]
    };
    const filtered = filterMoneyExplorerItems(
      items.map((entry) => entry.item),
      state
    );
    const ordered = sortMoneyExplorerItems(filtered, state.sort);
    const orderedIds = new Set(ordered.map((item) => item.recordId));
    const filteredSummary = summarizeMoneyExplorerItems(ordered);

    for (const entry of items) {
      entry.element.hidden = !orderedIds.has(entry.item.recordId);
    }

    for (const row of ordered) {
      const matchingElement = items.find((entry) => entry.item.recordId === row.recordId)?.element;

      if (matchingElement) {
        rows.appendChild(matchingElement);
      }
    }

    summaryElement.textContent = `Showing ${ordered.length} of ${items.length} public ledger rows`;
    metaElement.textContent =
      filteredSummary.recordCount > 0
        ? `${filteredSummary.rowsWithValue} rows with values | ${filteredSummary.buyerCount} buyers | lead route ${toRouteLabel(filteredSummary.leadRouteFamily)}`
        : "No ledger rows match the current drill-down.";
    resultCountElement.textContent = filteredSummary.recordCount.toLocaleString();
    disclosedValueElement.textContent =
      filteredSummary.rowsWithValue > 0 ? formatMoney(filteredSummary.disclosedValueTotal) : "No published values";
    linkedSitesElement.textContent = filteredSummary.linkedSiteCount.toLocaleString();
    leadBuyerElement.textContent = filteredSummary.leadBuyerName ?? "No matching buyer";
    emptyElement.hidden = ordered.length !== 0;
  }

  function onChange(): void {
    writeStateToUrl();
    share.setStatus("");
    applyFilters();
  }

  readStateFromUrl();
  applyFilters();

  form.addEventListener("input", onChange);
  form.addEventListener("change", onChange);
  reset?.addEventListener("click", () => {
    form.reset();
    route.value = "all";
    type.value = "all";
    buyer.value = "all";
    value.value = "all";
    scope.value = "all";
    sort.value = "newest";
    onChange();
  });
}
