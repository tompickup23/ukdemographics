/**
 * Per-place CSV downloads (/data/places/<slug>.csv, /data/places.csv) and the
 * sources sidecar (/data/sources.csv).
 *
 * Observed and published figures only: ONS mid-year estimates and Census counts,
 * each row tied to a source id in SOURCES and, where the build kept one, the row
 * of the workbook it came from. No projection, no modelled value, no score.
 * Nothing is rounded, interpolated or estimated here; the two derived rows (age
 * bands, the six Census groups) are sums of published cells, and the sources
 * file says so.
 */
import rawProjections from "../data/live/ethnic-projections.json";
import rawMye from "../data/live/population-estimates.json";
import rawCensusManifest from "../../data/raw/manifests/census_ethnic_groups.json";
import { ETHNIC_PALETTE } from "./ethnic-palette";
import { slugifyAreaName } from "./site";

interface CensusSide {
  year: number;
  total_population: number;
  groups_absolute: Record<string, number>;
}
interface MyeArea {
  name: string;
  population: number;
  ci95: { lower: number; upper: number } | null;
  ageBands: Record<string, number> | null;
  medianAge: number | null;
  components: Record<string, number> | null;
  series: Record<string, number>;
  locators: Record<string, string | null>;
}
const model = rawProjections as unknown as { areas: Record<string, { areaName: string; baseline: CensusSide; current: CensusSide }> };
const mye = rawMye as unknown as {
  source: { publisher: string; title: string; published: string; referenceDate: string; sourceUrl: string; fileName: string; fileSha256: string };
  areas: Record<string, MyeArea>;
};
const censusManifest = rawCensusManifest as unknown as {
  files: Array<{ year: number; table: string; nomisDataset: string; fileName: string; sha256: string }>;
  resolution: { baseline2011: { predecessors: string[] } };
};

export interface DownloadSource {
  id: string;
  publisher: string;
  title: string;
  table: string;
  edition: string;
  url: string;
  file: string;
  sha256: string;
  note: string;
}

const MYE_YEAR = mye.source.referenceDate.slice(0, 4);
const MYE_PUBLISHED = /(\d{1,2} [A-Z][a-z]+ \d{4})/.exec(mye.source.published)?.[1] ?? "";
const censusFile = (year: number) => censusManifest.files.find((f) => f.year === year)!;

const myeSource = (id: string, table: string, note: string): DownloadSource => ({
  id,
  publisher: mye.source.publisher,
  title: mye.source.title,
  table,
  edition: MYE_PUBLISHED ? `published ${MYE_PUBLISHED}` : "",
  url: mye.source.sourceUrl,
  file: mye.source.fileName,
  sha256: mye.source.fileSha256,
  note
});

const GROUP_NOTE =
  "Six groups summed from the published categories by the group named before the colon in each label: White British; White Other (Irish, Gypsy or Irish Traveller, Roma in 2021, any other White); Asian; Black; Mixed (all four Mixed categories, including both Mixed White and Black ones); Other (Arab and any other ethnic group).";

export const SOURCES: DownloadSource[] = [
  myeSource("ons-mye4", "MYE4", "Estimated usual resident population at 30 June, every year from mid-2011. Mid-2022 to mid-2024 are the July 2026 revisions."),
  myeSource("ons-mye0", "MYE0", `95% research-based confidence interval for mid-${MYE_YEAR}, as ONS labels it.`),
  myeSource("ons-mye2", "MYE2 - Persons", `Age bands are sums of single-year-of-age cells: 0 to 17, 18 to 64, and 65 to 89 plus 90+.`),
  myeSource("ons-mye3", "MYE3", `Components of change, mid-${Number(MYE_YEAR) - 1} to mid-${MYE_YEAR}.`),
  myeSource("ons-mye6", "MYE6", `Median age at mid-${MYE_YEAR}.`),
  {
    id: "census-2011-ks201ew",
    publisher: "Office for National Statistics",
    title: "Census 2011",
    table: censusFile(2011).table.replace(/^Census 2011 /, ""),
    edition: "published 11 December 2012",
    url: "https://www.nomisweb.co.uk/census/2011/ks201ew",
    file: censusFile(2011).fileName,
    sha256: censusFile(2011).sha256,
    note: `${GROUP_NOTE} Councils formed since 2011 are the exact sum of the 2011 districts they absorbed; the row's locator lists them.`
  },
  {
    id: "census-2021-ts021",
    publisher: "Office for National Statistics",
    title: "Census 2021",
    table: censusFile(2021).table.replace(/^Census 2021 /, ""),
    edition: "published 29 November 2022",
    url: "https://www.nomisweb.co.uk/datasets/c2021ts021",
    file: censusFile(2021).fileName,
    sha256: censusFile(2021).sha256,
    note: `${GROUP_NOTE} Census 2021 counts are as published, after ONS's statistical disclosure control.`
  }
];

export const COLUMNS = ["area_code", "area_name", "measure", "category", "period", "value", "unit", "source_id", "source_locator"] as const;
export type DownloadRow = Record<(typeof COLUMNS)[number], string | number>;

/** 2011 councils summed into a council formed since, keyed by the new code. */
const predecessors2011 = new Map(
  censusManifest.resolution.baseline2011.predecessors.map((line) => {
    const [code, , parts] = line.split(" ");
    return [code, parts.split("+")] as const;
  })
);

const sheetLocator = (sheet: string, rowLocator: string | null | undefined) => {
  const row = rowLocator ? /row=(\d+)/.exec(rowLocator)?.[1] : null;
  return row ? `sheet=${sheet};row=${row}` : `sheet=${sheet}`;
};

export function placeRows(code: string): DownloadRow[] {
  const m = mye.areas[code];
  const c = model.areas[code];
  if (!m || !c) return [];
  const name = c.areaName;
  const rows: DownloadRow[] = [];
  const push = (measure: string, category: string, period: string, value: number, unit: string, source_id: string, source_locator: string) =>
    rows.push({ area_code: code, area_name: name, measure, category, period, value, unit, source_id, source_locator });

  const r4 = sheetLocator("MYE4", m.locators.population);
  for (const [year, value] of Object.entries(m.series).sort(([a], [b]) => a.localeCompare(b)))
    push("population_estimate", "all persons", `mid-${year}`, value, "persons", "ons-mye4", `${r4};column=Mid-${year}`);

  if (m.ci95) {
    const r0 = sheetLocator("MYE0", m.locators.ci95);
    push("population_estimate_ci95", "lower bound", `mid-${MYE_YEAR}`, m.ci95.lower, "persons", "ons-mye0", r0);
    push("population_estimate_ci95", "upper bound", `mid-${MYE_YEAR}`, m.ci95.upper, "persons", "ons-mye0", r0);
  }
  if (m.ageBands) {
    const r2 = sheetLocator("MYE2 - Persons", m.locators.ageBands);
    for (const [band, value] of Object.entries(m.ageBands))
      push("population_by_age", `aged ${band.replace("-", " to ").replace("+", " and over")}`, `mid-${MYE_YEAR}`, value, "persons", "ons-mye2", r2);
  }
  if (m.medianAge != null) push("median_age", "all persons", `mid-${MYE_YEAR}`, m.medianAge, "years", "ons-mye6", `sheet=MYE6;column=Mid-${MYE_YEAR}`);
  if (m.components) {
    const r3 = sheetLocator("MYE3", m.locators.components);
    const label: Record<string, string> = {
      births: "births",
      deaths: "deaths",
      internalMigrationNet: "internal migration, net",
      internationalMigrationNet: "international migration, net",
      other: "other changes"
    };
    for (const [k, value] of Object.entries(m.components))
      push("components_of_change", label[k] ?? k, `mid-${Number(MYE_YEAR) - 1} to mid-${MYE_YEAR}`, value, "persons", "ons-mye3", r3);
  }

  for (const side of [c.baseline, c.current]) {
    if (!side || (side.year !== 2011 && side.year !== 2021)) continue;
    const id = side.year === 2011 ? "census-2011-ks201ew" : "census-2021-ts021";
    const summed = side.year === 2011 ? predecessors2011.get(code) : undefined;
    const loc = summed ? `sum of 2011 districts ${summed.join("|")}` : `area=${code}`;
    push("census_usual_residents", "all usual residents", `Census ${side.year}`, side.total_population, "persons", id, loc);
    for (const g of ETHNIC_PALETTE)
      push("census_ethnic_group", g.label, `Census ${side.year}`, side.groups_absolute[g.key], "persons", id, loc);
  }
  return rows;
}

export const placeCsvPath = (areaName: string) => `/data/places/${slugifyAreaName(areaName)}.csv`;

export const placeCodes = (): string[] => Object.keys(model.areas).filter((code) => mye.areas[code]);

function cell(v: string | number): string {
  const s = String(v);
  return /[",\n]/.test(s) ? `"${s.replaceAll('"', '""')}"` : s;
}

export function toCsv(columns: readonly string[], rows: Array<Record<string, string | number>>): string {
  return [columns.join(","), ...rows.map((r) => columns.map((k) => cell(r[k])).join(","))].join("\n") + "\n";
}

export const csvResponse = (body: string) => new Response(body, { headers: { "Content-Type": "text/csv; charset=utf-8" } });
