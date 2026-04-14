import { wireShareState } from "./share-state";

interface HotelSiteRow {
  element: HTMLElement;
  text: string;
  region: string;
  status: string;
  coverage: string;
}

interface HotelAreaRow {
  element: HTMLElement;
  text: string;
  region: string;
  visibility: string;
}

export function initHotelFilters(): void {
  const root = document.getElementById("hotel-filters");

  if (!(root instanceof HTMLElement)) {
    return;
  }

  const form = root.querySelector<HTMLFormElement>("[data-hotel-form]");
  const siteSummaryElement = root.querySelector<HTMLElement>("[data-hotel-site-summary]");
  const areaSummaryElement = root.querySelector<HTMLElement>("[data-hotel-area-summary]");
  const siteEmptyElement = document.querySelector<HTMLElement>("[data-hotel-site-empty]");
  const areaEmptyElement = document.querySelector<HTMLElement>("[data-hotel-area-empty]");
  const reset = root.querySelector<HTMLButtonElement>("[data-hotel-reset]");
  const copy = root.querySelector<HTMLButtonElement>("[data-hotel-copy]");
  const copyStatus = root.querySelector<HTMLElement>("[data-hotel-copy-status]");

  if (!form || !siteSummaryElement || !areaSummaryElement || !siteEmptyElement || !areaEmptyElement) {
    return;
  }

  const searchInput = form.querySelector<HTMLInputElement>('input[name="hotel_q"]');
  const regionSelect = form.querySelector<HTMLSelectElement>('select[name="hotel_region"]');
  const statusSelect = form.querySelector<HTMLSelectElement>('select[name="hotel_status"]');
  const coverageSelect = form.querySelector<HTMLSelectElement>('select[name="hotel_coverage"]');
  const visibilitySelect = form.querySelector<HTMLSelectElement>('select[name="hotel_visibility"]');

  if (!searchInput || !regionSelect || !statusSelect || !coverageSelect || !visibilitySelect) {
    return;
  }

  const siteSummary = siteSummaryElement;
  const areaSummary = areaSummaryElement;
  const siteEmpty = siteEmptyElement;
  const areaEmpty = areaEmptyElement;
  const search = searchInput;
  const region = regionSelect;
  const status = statusSelect;
  const coverage = coverageSelect;
  const visibility = visibilitySelect;
  const share = wireShareState({
    button: copy,
    statusElement: copyStatus,
    getUrl: () => new URL(buildRelativeUrl(), window.location.origin).toString(),
    successMessage: "Filtered hotel view copied"
  });

  const siteRows = Array.from(document.querySelectorAll<HTMLElement>("[data-hotel-site-row]")).map((element) => ({
    element,
    text: [
      element.dataset.siteName,
      element.dataset.areaName,
      element.dataset.region
    ]
      .filter(Boolean)
      .join(" ")
      .toLowerCase(),
    region: element.dataset.region ?? "",
    status: element.dataset.status ?? "",
    coverage: element.dataset.coverage ?? ""
  })) satisfies HotelSiteRow[];

  const areaRows = Array.from(document.querySelectorAll<HTMLElement>("[data-hotel-area-row]")).map((element) => ({
    element,
    text: [element.dataset.areaName, element.dataset.region].filter(Boolean).join(" ").toLowerCase(),
    region: element.dataset.region ?? "",
    visibility: element.dataset.visibility ?? "mixed"
  })) satisfies HotelAreaRow[];

  function readStateFromUrl(): void {
    const params = new URLSearchParams(window.location.search);
    search.value = params.get("hotel_q") ?? "";
    region.value = params.get("hotel_region") ?? "all";
    status.value = params.get("hotel_status") ?? "all";
    coverage.value = params.get("hotel_coverage") ?? "all";
    visibility.value = params.get("hotel_visibility") ?? "all";
  }

  function buildRelativeUrl(): string {
    const params = new URLSearchParams(window.location.search);
    const nextEntries = {
      hotel_q: search.value.trim(),
      hotel_region: region.value,
      hotel_status: status.value,
      hotel_coverage: coverage.value,
      hotel_visibility: visibility.value
    };

    for (const [key, value] of Object.entries(nextEntries)) {
      const defaultValue = key === "hotel_q" ? "" : "all";

      if (!value || value === defaultValue) {
        params.delete(key);
      } else {
        params.set(key, value);
      }
    }

    const query = params.toString();
    return `${window.location.pathname}${query ? `?${query}` : ""}#hotel-filters`;
  }

  function writeStateToUrl(): void {
    window.history.replaceState({}, "", buildRelativeUrl());
  }

  function applyFilters(): void {
    const searchValue = search.value.trim().toLowerCase();
    const regionValue = region.value;
    const statusValue = status.value;
    const coverageValue = coverage.value;
    const visibilityValue = visibility.value;

    let visibleSites = 0;

    for (const row of siteRows) {
      const matchesSearch = !searchValue || row.text.includes(searchValue);
      const matchesRegion = regionValue === "all" || row.region === regionValue;
      const matchesStatus = statusValue === "all" || row.status === statusValue;
      const matchesCoverage = coverageValue === "all" || row.coverage === coverageValue;
      const visible = matchesSearch && matchesRegion && matchesStatus && matchesCoverage;

      row.element.hidden = !visible;

      if (visible) {
        visibleSites += 1;
      }
    }

    let visibleAreas = 0;

    for (const row of areaRows) {
      const matchesSearch = !searchValue || row.text.includes(searchValue);
      const matchesRegion = regionValue === "all" || row.region === regionValue;
      const matchesVisibility = visibilityValue === "all" || row.visibility === visibilityValue;
      const visible = matchesSearch && matchesRegion && matchesVisibility;

      row.element.hidden = !visible;

      if (visible) {
        visibleAreas += 1;
      }
    }

    siteSummary.textContent = `Showing ${visibleSites} matching site rows`;
    areaSummary.textContent = `Showing ${visibleAreas} matching area rows`;
    siteEmpty.hidden = visibleSites !== 0;
    areaEmpty.hidden = visibleAreas !== 0;
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
    region.value = "all";
    status.value = "all";
    coverage.value = "all";
    visibility.value = "all";
    onChange();
  });
}
