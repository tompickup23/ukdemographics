import { readFileSync } from "node:fs";

export interface CouncilCatalogEntry {
  bodyId: string;
  slug: string;
  name: string;
  shortName: string;
  councilTier: string;
  region: string;
  country: string;
  status: string;
  scopeClass: string;
  sourceRepo: string;
  upstreamSite: string;
  domains: string[];
  notes: string;
}

interface RawManifestFile {
  relativePath: string;
  sourcePath: string;
  rawUrl: string;
  sizeBytes: number;
}

interface RawManifest {
  generatedAt: string;
  bodyId: string;
  sourceRepo: string;
  branch: string;
  fetchedFileCount: number;
  files: RawManifestFile[];
}

interface CanonicalManifest {
  generated_at: string;
  body_id: string;
  domains: string[];
  record_counts: Record<string, number>;
  outputs: string[];
}

interface SpendingMonthlyTotal {
  month: string;
  record_count: number;
  total_spend_gbp: number;
}

interface SpendingSummary {
  generated_at: string;
  body_id: string;
  source_file_count: number;
  total_records: number;
  total_spend_gbp: number;
  average_monthly_spend_gbp: number;
  first_date: string;
  last_date: string;
  by_financial_year: Array<{ financial_year: string; total_spend_gbp: number }>;
  monthly_totals: SpendingMonthlyTotal[];
  redacted_supplier_spend_gbp: number;
  redacted_supplier_labels: string[];
  missing_expected_months: string[];
  top_suppliers: Array<{ supplier_name: string; total_spend_gbp: number }>;
  top_departments: Array<{ department_raw: string; total_spend_gbp: number }>;
  top_service_areas: Array<{ service_area_raw: string; total_spend_gbp: number }>;
}

interface QualityFlag {
  code: string;
  severity: string;
  message: string;
}

interface BudgetSummary {
  generated_at: string;
  body_id: string;
  source_years_local: string[];
  source_years_govuk: string[];
  latest_year: string | null;
  latest_summary: {
    total_service_expenditure: number;
    net_current_expenditure: number;
    net_revenue_expenditure: number;
    council_tax_requirement: number;
  } | null;
  local_service_breakdown_latest: Record<string, number>;
  headline_trends: Record<string, Array<{ year: string; value: number }>>;
  latest_reserves_total_gbp: number | null;
  reserves_change_since_first_year_gbp: number | null;
  reserves_change_since_first_year_pct: number | null;
  council_tax_band_d_latest: number | null;
  council_tax_band_d_latest_year: string | null;
  council_tax_band_d_change_since_2021_22_pct: number | null;
  service_growth_pct: Array<{ service_name: string; change_pct: number }>;
  approved_budget: {
    financial_year: string;
    net_revenue_budget: number;
    council_tax_band_d: number | null;
    status: string;
  };
  quality_flags: QualityFlag[];
  record_count: number;
}

interface BudgetMappingSummary {
  generated_at: string;
  body_id: string;
  total_departments: number;
  mapped_departments: number;
  unmapped_departments: number;
  coverage: {
    mapped_spend: number;
    total_spend: number;
    mapped_spend_pct: number;
  } | null;
  unmapped_spend_gbp: number | null;
  canonical_total_spend_gbp: number | null;
  difference_from_canonical_spend_gbp: number | null;
  category_summary: Record<string, number>;
  top_unmapped: Array<{ department: string; spend: number }>;
  quality_flags: QualityFlag[];
  record_count: number;
}

interface SourceFamily {
  label: string;
  count: number;
  note: string;
}

export interface CouncilSnapshot {
  body: CouncilCatalogEntry;
  rawManifest: RawManifest;
  canonicalManifest: CanonicalManifest;
  spending: SpendingSummary;
  budget: BudgetSummary;
  mapping: BudgetMappingSummary;
  sourceFamilies: SourceFamily[];
  flags: QualityFlag[];
  latestMonth: SpendingMonthlyTotal | null;
  redactedSpendPct: number;
  topSuppliers: Array<{ supplier_name: string; total_spend_gbp: number }>;
  topServiceBreakdown: Array<{ label: string; value_gbp: number }>;
  topMappedCategories: Array<{ label: string; value_gbp: number }>;
  topUnmapped: Array<{ department: string; spend: number }>;
}

function readProjectJson<T>(projectRelativePath: string): T {
  const fileUrl = new URL(`../../${projectRelativePath}`, import.meta.url);
  return JSON.parse(readFileSync(fileUrl, "utf8")) as T;
}

function buildSourceFamilies(files: RawManifestFile[]): SourceFamily[] {
  const counts = {
    spendingMonthly: files.filter((file) => /^spending-\d{4}-\d{2}\.json$/.test(file.relativePath)).length,
    spendingSupport: files.filter((file) => file.relativePath === "spending-index.json").length,
    budgetFiles: files.filter((file) =>
      [
        "budgets.json",
        "budgets_summary.json",
        "budgets_govuk.json",
        "budget_variance.json",
        "budget_efficiency.json",
        "budget_insights.json",
        "proposed_budget.json"
      ].includes(file.relativePath)
    ).length,
    mappingFiles: files.filter((file) => file.relativePath === "budget_mapping.json").length
  };

  return [
    {
      label: "Monthly spending files",
      count: counts.spendingMonthly,
      note: "Raw transaction chunks pulled into canonical NDJSON."
    },
    {
      label: "Budget and forecast files",
      count: counts.budgetFiles,
      note: "Local budgets, GOV.UK outturn, and approved budget plan."
    },
    {
      label: "Budget mapping files",
      count: counts.mappingFiles,
      note: "Observed label-to-budget-category mappings from the upstream pack."
    },
    {
      label: "Spending support files",
      count: counts.spendingSupport,
      note: "Search and indexing artifacts from the upstream publication."
    }
  ].filter((family) => family.count > 0);
}

function sortTopEntries(entries: Record<string, number>, limit = 8) {
  return Object.entries(entries)
    .map(([label, value_gbp]) => ({ label, value_gbp }))
    .sort((a, b) => b.value_gbp - a.value_gbp)
    .slice(0, limit);
}

function loadCouncilSnapshot(body: CouncilCatalogEntry): CouncilSnapshot {
  const baseId = body.bodyId;
  const rawManifest = readProjectJson<RawManifest>(`data/raw/manifests/${baseId}.json`);
  const canonicalManifest = readProjectJson<CanonicalManifest>(`data/canonical/${baseId}/manifest.json`);
  const spending = readProjectJson<SpendingSummary>(`data/marts/${baseId}/spending-summary.json`);
  const budget = readProjectJson<BudgetSummary>(`data/marts/${baseId}/budget-summary.json`);
  const mapping = readProjectJson<BudgetMappingSummary>(`data/marts/${baseId}/budget-mapping-summary.json`);
  const latestMonth = spending.monthly_totals.at(-1) || null;
  const redactedSpendPct = spending.total_spend_gbp
    ? Number(((spending.redacted_supplier_spend_gbp / spending.total_spend_gbp) * 100).toFixed(1))
    : 0;
  const flags: QualityFlag[] = [
    ...mapping.quality_flags,
    ...budget.quality_flags,
    ...spending.missing_expected_months.map((month) => ({
      code: `missing_month_${month}`,
      severity: "medium",
      message: `No upstream monthly spending file is present for ${month}.`
    })),
    ...(redactedSpendPct >= 5
      ? [
          {
            code: "material_redactions",
            severity: "medium",
            message: `${redactedSpendPct}% of current transaction spend is tied to supplier labels containing REDACT*.`
          }
        ]
      : []),
    ...(typeof budget.reserves_change_since_first_year_pct === "number" &&
    budget.reserves_change_since_first_year_pct < 0
      ? [
          {
            code: "reserves_down",
            severity: "note",
            message: `Published reserves are down ${Math.abs(
              budget.reserves_change_since_first_year_pct
            )}% versus ${budget.source_years_govuk[0] || "the first source year"}.`
          }
        ]
      : [])
  ];

  return {
    body,
    rawManifest,
    canonicalManifest,
    spending,
    budget,
    mapping,
    sourceFamilies: buildSourceFamilies(rawManifest.files),
    flags,
    latestMonth,
    redactedSpendPct,
    topSuppliers: spending.top_suppliers.slice(0, 10),
    topServiceBreakdown: sortTopEntries(budget.local_service_breakdown_latest),
    topMappedCategories: sortTopEntries(mapping.category_summary),
    topUnmapped: mapping.top_unmapped.slice(0, 10)
  };
}

export function getCouncilCatalog(): CouncilCatalogEntry[] {
  return readProjectJson<CouncilCatalogEntry[]>("data/body-catalog.json");
}

export function getCouncilSnapshots(): CouncilSnapshot[] {
  return getCouncilCatalog().map(loadCouncilSnapshot);
}

export function getCouncilSnapshotBySlug(slug: string): CouncilSnapshot | undefined {
  return getCouncilSnapshots().find((snapshot) => snapshot.body.slug === slug);
}
