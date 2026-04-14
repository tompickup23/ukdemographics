import {
  filterEntityExplorerItems,
  sortEntityExplorerItems,
  summarizeEntityExplorerItems,
  type EntityExplorerState
} from "../lib/entity-explorer";
import { wireShareState } from "./share-state";

interface EntityExplorerRow {
  element: HTMLElement;
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

function toNumber(value: string | undefined): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function formatRoleLabel(role: string): string {
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

export function initEntityExplorer(): void {
  const root = document.getElementById("entity-explorer");

  if (!(root instanceof HTMLElement)) {
    return;
  }

  const form = root.querySelector<HTMLFormElement>("[data-entity-form]");
  const resultsElement = root.querySelector<HTMLElement>("[data-entity-results]");
  const summaryElement = root.querySelector<HTMLElement>("[data-entity-summary]");
  const estateSummaryElement = root.querySelector<HTMLElement>("[data-entity-estate-summary]");
  const moneySummaryElement = root.querySelector<HTMLElement>("[data-entity-money-summary]");
  const timelineSummaryElement = root.querySelector<HTMLElement>("[data-entity-timeline-summary]");
  const emptyElement = root.querySelector<HTMLElement>("[data-entity-empty]");
  const reset = root.querySelector<HTMLButtonElement>("[data-entity-reset]");
  const copy = root.querySelector<HTMLButtonElement>("[data-entity-copy]");
  const copyStatus = root.querySelector<HTMLElement>("[data-entity-copy-status]");

  if (
    !form ||
    !resultsElement ||
    !summaryElement ||
    !estateSummaryElement ||
    !moneySummaryElement ||
    !timelineSummaryElement ||
    !emptyElement
  ) {
    return;
  }

  const searchInput = form.querySelector<HTMLInputElement>('input[name="entity_q"]');
  const roleSelect = form.querySelector<HTMLSelectElement>('select[name="entity_role"]');
  const routeSelect = form.querySelector<HTMLSelectElement>('select[name="entity_route"]');
  const surfaceSelect = form.querySelector<HTMLSelectElement>('select[name="entity_surface"]');
  const footprintSelect = form.querySelector<HTMLSelectElement>('select[name="entity_footprint"]');
  const sortSelect = form.querySelector<HTMLSelectElement>('select[name="entity_sort"]');
  const limitSelect = form.querySelector<HTMLSelectElement>('select[name="entity_limit"]');

  if (!searchInput || !roleSelect || !routeSelect || !surfaceSelect || !footprintSelect || !sortSelect || !limitSelect) {
    return;
  }

  const results = resultsElement;
  const summary = summaryElement;
  const estateSummary = estateSummaryElement;
  const moneySummary = moneySummaryElement;
  const timelineSummary = timelineSummaryElement;
  const empty = emptyElement;
  const search = searchInput;
  const role = roleSelect;
  const route = routeSelect;
  const surface = surfaceSelect;
  const footprint = footprintSelect;
  const sort = sortSelect;
  const limit = limitSelect;
  const share = wireShareState({
    button: copy,
    statusElement: copyStatus,
    getUrl: () => new URL(buildRelativeUrl(), window.location.origin).toString(),
    successMessage: "Filtered entity view copied"
  });

  const items = Array.from(results.querySelectorAll<HTMLElement>("[data-entity-item]")).map((element) => ({
    element,
    entityId: element.dataset.entityId ?? "",
    entityName: element.dataset.name ?? "",
    primaryRole: element.dataset.role ?? "other",
    routeFamilies: (element.dataset.routes ?? "")
      .split("|")
      .map((value) => value.trim())
      .filter(Boolean),
    currentSiteCount: toNumber(element.dataset.currentSites),
    moneyRecordCount: toNumber(element.dataset.moneyRows),
    linkedAreaCount: toNumber(element.dataset.linkedAreas),
    unresolvedCurrentSiteCount: toNumber(element.dataset.unresolvedSites),
    moneyRowsWithPublishedValueCount: toNumber(element.dataset.rowsWithValue),
    firstEvidenceDate: element.dataset.firstEvidenceDate ?? null,
    latestEvidenceDate: element.dataset.latestEvidenceDate ?? null,
    regionalCoverageAreaCount: toNumber(element.dataset.regionalAreas),
    namedCoverageAreaCount: toNumber(element.dataset.namedCoverageAreas),
    score: toNumber(element.dataset.score),
    searchText: (element.dataset.search ?? "").toLowerCase()
  })) satisfies EntityExplorerRow[];

  function readStateFromUrl(): void {
    const params = new URLSearchParams(window.location.search);
    search.value = params.get("entity_q") ?? "";
    role.value = params.get("entity_role") ?? "all";
    route.value = params.get("entity_route") ?? "all";
    surface.value = params.get("entity_surface") ?? "all";
    footprint.value = params.get("entity_footprint") ?? "all";
    sort.value = params.get("entity_sort") ?? "exposure";
    limit.value = params.get("entity_limit") ?? "12";
  }

  function buildRelativeUrl(): string {
    const params = new URLSearchParams(window.location.search);
    const nextEntries = {
      entity_q: search.value.trim(),
      entity_role: role.value,
      entity_route: route.value,
      entity_surface: surface.value,
      entity_footprint: footprint.value,
      entity_sort: sort.value,
      entity_limit: limit.value
    };

    for (const [key, value] of Object.entries(nextEntries)) {
      const defaultValue =
        key === "entity_q"
          ? ""
          : key === "entity_sort"
            ? "exposure"
            : key === "entity_limit"
              ? "12"
              : "all";

      if (!value || value === defaultValue) {
        params.delete(key);
      } else {
        params.set(key, value);
      }
    }

    const query = params.toString();
    return `${window.location.pathname}${query ? `?${query}` : ""}#entity-explorer`;
  }

  function writeStateToUrl(): void {
    window.history.replaceState({}, "", buildRelativeUrl());
  }

  function readState(): EntityExplorerState {
    return {
      query: search.value,
      role: role.value,
      routeFamily: route.value,
      surface: (surface.value as EntityExplorerState["surface"]) || "all",
      footprint: (footprint.value as EntityExplorerState["footprint"]) || "all",
      sort: (sort.value as EntityExplorerState["sort"]) || "exposure"
    };
  }

  function applyFilters(): void {
    const state = readState();
    const filtered = sortEntityExplorerItems(filterEntityExplorerItems(items, state), state.sort);
    const limitValue = Math.max(1, toNumber(limit.value) || 12);
    const summaryState = summarizeEntityExplorerItems(filtered);

    for (const item of items) {
      item.element.hidden = true;
    }

    filtered.forEach((item, index) => {
      results.appendChild(item.element);
      item.element.hidden = index >= limitValue;
    });

    const renderedCount = Math.min(filtered.length, limitValue);
    summary.textContent = `Showing ${renderedCount} of ${filtered.length} matching profiles`;
    estateSummary.textContent = `${summaryState.namedEstateCount} with a current named estate`;
    moneySummary.textContent = `${summaryState.moneyLinkedCount} with public money rows`;
    timelineSummary.textContent = `${summaryState.datedEvidenceCount} with dated evidence, ${summaryState.regionalCoverageCount} with regional contract coverage`;
    empty.hidden = filtered.length !== 0;

    if (summaryState.leadRole) {
      summary.dataset.leadRole = summaryState.leadRole;
      summary.dataset.leadRoleLabel = formatRoleLabel(summaryState.leadRole);
    } else {
      delete summary.dataset.leadRole;
      delete summary.dataset.leadRoleLabel;
    }
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
    role.value = "all";
    route.value = "all";
    surface.value = "all";
    footprint.value = "all";
    sort.value = "exposure";
    limit.value = "12";
    onChange();
  });
}
