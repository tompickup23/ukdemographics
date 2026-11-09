/**
 * Age pyramids: population by single year of age and sex for each council and for
 * England and Wales, every year from mid-2011 (docs/product/age-pyramid-spec-2026-11-09.md).
 *
 * The figures are ONS's, table MYEB1, exactly as published; the file is built by
 * scripts/build/build-age-pyramids.mjs. This module reads it, derives the three
 * things the page states beside the chart (total, median age, the site's age bands)
 * and draws the chart as an SVG string at build time, so the page works with no
 * script. public/scripts/age-pyramid.js redraws the same marks for another year.
 */
import rawPyramids from "../data/live/age-pyramids.json";
import { slugifyAreaName } from "./site";
import { plainPlaceName } from "./place-names";

type Rows = number[][];
interface RawArea { name: string; M: Rows; F: Rows }
const data = rawPyramids as unknown as {
  source: {
    publisher: string; title: string; table: string; published: string; nextPublication: string;
    geography: string; landing: string; sourceUrl: string; fileName: string; fileSha256: string;
  };
  years: number[];
  englandAndWales: RawArea;
  areas: Record<string, RawArea>;
};

export const PYRAMID_SOURCE = data.source;
export const PYRAMID_YEARS: readonly number[] = data.years;
export const PYRAMID_BASE_YEAR = data.years[0];
export const PYRAMID_LATEST_YEAR = data.years[data.years.length - 1];
export const ENGLAND_AND_WALES = "K04000001";
/** Index 90 is the open-ended group, 90 and over. */
export const OPEN_AGE = 90;
export const AGE_COUNT = 91;

/** "29 July 2026", read from the workbook's own publication sentence. */
export const PYRAMID_PUBLISHED_DAY = /(\d{1,2} [A-Z][a-z]+ \d{4})/.exec(data.source.published)?.[1] ?? "";
const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
/** The same day as an ISO date, for sitemap lastmod and schema; null if the sentence changes shape. */
export const PYRAMID_PUBLISHED_ISO: string | null = (() => {
  const m = /^(\d{1,2}) ([A-Z][a-z]+) (\d{4})$/.exec(PYRAMID_PUBLISHED_DAY);
  const month = m ? MONTHS.indexOf(m[2]) : -1;
  return m && month >= 0 ? `${m[3]}-${String(month + 1).padStart(2, "0")}-${m[1].padStart(2, "0")}` : null;
})();
export const PYRAMID_SOURCE_LINE = `ONS, ${data.source.title.split(". ")[0]}, detailed time series ${data.years[0]} to ${data.years[data.years.length - 1]}, table ${data.source.table}${PYRAMID_PUBLISHED_DAY ? `, published ${PYRAMID_PUBLISHED_DAY}` : ""}`;
/** ONS's own caution, quoted from the cover sheet of the workbook. */
export const PYRAMID_ACCURACY_NOTE =
  "ONS publishes these estimates unrounded and says they should not be taken to be accurate to the level of detail provided.";

export interface Pyramid {
  code: string;
  /** The name the page uses: the plain place name for a council. */
  name: string;
  years: readonly number[];
  M: Rows;
  F: Rows;
}

export function pyramidCodes(): string[] {
  return Object.keys(data.areas);
}

export function pyramidFor(code: string): Pyramid | null {
  if (code === ENGLAND_AND_WALES) {
    return { code, name: data.englandAndWales.name, years: data.years, M: data.englandAndWales.M, F: data.englandAndWales.F };
  }
  const area = data.areas[code];
  return area ? { code, name: plainPlaceName(code, area.name), years: data.years, M: area.M, F: area.F } : null;
}

/** The ONS name of a council, which is what its place page address is built from. */
export function pyramidOnsName(code: string): string | null {
  return data.areas[code]?.name ?? null;
}

export const pyramidPath = (onsName: string) => `/places/${slugifyAreaName(onsName)}/population-pyramid/`;
export const pyramidCsvPath = (onsName: string) => `/data/pyramids/${slugifyAreaName(onsName)}.csv`;
export const PYRAMID_HUB_PATH = "/population-pyramids/";
export const ENGLAND_AND_WALES_JSON_PATH = "/data/pyramids/england-and-wales.json";

const sum = (row: number[]) => row.reduce((a, b) => a + b, 0);

export function yearIndex(p: Pyramid, year: number): number {
  const i = p.years.indexOf(year);
  if (i < 0) throw new Error(`${p.code}: no estimate for mid-${year}`);
  return i;
}

export interface YearSummary {
  year: number;
  population: number;
  males: number;
  females: number;
  /** Calculated from the single years of age, interpolating within the year the midpoint falls in. */
  medianAge: number;
  /** The site's three age bands, as on the place pages: 0 to 17, 18 to 64, 65 and over. */
  bands: { "0-17": number; "18-64": number; "65+": number };
}

/** Median age of a distribution by single year of age. Kept in step with medianOf in age-pyramid.js. */
export function medianAge(persons: number[]): number {
  const half = sum(persons) / 2;
  let run = 0;
  for (let age = 0; age < persons.length; age++) {
    if (persons[age] > 0 && run + persons[age] >= half) return age + (half - run) / persons[age];
    run += persons[age];
  }
  return NaN;
}

export function summarise(p: Pyramid, year: number): YearSummary {
  const i = yearIndex(p, year);
  const persons = p.M[i].map((v, a) => v + p.F[i][a]);
  const range = (from: number, to: number) => sum(persons.slice(from, to + 1));
  return {
    year,
    population: sum(persons),
    males: sum(p.M[i]),
    females: sum(p.F[i]),
    medianAge: medianAge(persons),
    bands: { "0-17": range(0, 17), "18-64": range(18, 64), "65+": range(65, OPEN_AGE) }
  };
}

/** The smallest of 1, 2, 2.5 or 5 times a power of ten that is at least v. */
function niceStep(v: number): number {
  const pow = 10 ** Math.floor(Math.log10(v));
  for (const m of [1, 2, 2.5, 5, 10]) if (m * pow >= v) return m * pow;
  return 10 * pow;
}

export interface AxisScale { max: number; step: number }

function axisFor(largest: number): AxisScale {
  const step = niceStep(largest / 4);
  return { max: step * Math.ceil(largest / step), step };
}

/**
 * One scale per area and measure, fixed across every year, so growth reads as bars
 * getting longer and the picture never rescales under the reader. The share scale
 * also covers England and Wales, whose outline can be drawn over a council.
 */
export function pyramidScales(p: Pyramid): { people: AxisScale; share: AxisScale } {
  let people = 0;
  let share = 0;
  const shareOf = (area: { M: Rows; F: Rows }) => {
    area.M.forEach((row, i) => {
      const total = sum(row) + sum(area.F[i]);
      for (const v of [...row, ...area.F[i]]) share = Math.max(share, (v / total) * 100);
    });
  };
  for (const rows of [p.M, p.F]) for (const row of rows) for (const v of row) people = Math.max(people, v);
  shareOf(p);
  shareOf(data.englandAndWales);
  return { people: axisFor(people), share: axisFor(share) };
}

// ---------------------------------------------------------------------------
// Drawing. One geometry, shared with the client script through `PYRAMID_GEOMETRY`.
// The viewBox is 360 units wide so that on a 375 px phone a unit is close to a
// pixel and the smallest text stays readable.
// ---------------------------------------------------------------------------

export const PYRAMID_GEOMETRY = {
  width: 360,
  height: 508,
  centre: 180,
  gutter: 30,
  side: 156,
  top: 76,
  rowHeight: 4,
  barHeight: 3.4,
  /** Space between the 90 and over bar and age 89, so it is not read as one year of age. */
  openGap: 7
} as const;

/** Light-mode colours, written into the SVG so a saved image stands alone. The page's stylesheet overrides them with the tokens of the same name. */
export const PYRAMID_INK = {
  ground: "#ffffff",
  males: "#1a6ba8",
  females: "#b45309",
  text: "#171b1f",
  muted: "#545c63",
  grid: "#dbdfe3"
} as const;

const G = PYRAMID_GEOMETRY;
export const plotBottom = G.top + G.rowHeight + G.openGap + OPEN_AGE * G.rowHeight;
/** Top edge of the row for an age; the open-ended group sits above a gap. */
export const rowY = (age: number) => (age === OPEN_AGE ? G.top : G.top + G.rowHeight + G.openGap + (OPEN_AGE - 1 - age) * G.rowHeight);
const leftEdge = G.centre - G.gutter / 2;
const rightEdge = G.centre + G.gutter / 2;
const r1 = (v: number) => Math.round(v * 10) / 10;
const count = (n: number) => n.toLocaleString("en-GB");
const escapeXml = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

export function tickLabel(v: number, measure: "people" | "share"): string {
  return measure === "share" ? `${Number(v.toFixed(2))}%` : count(v);
}

/** Stepped outline of one side for a comparison year: `dir` is -1 for males, 1 for females. */
export function outlinePath(values: number[], scaleMax: number, dir: -1 | 1): string {
  const edge = dir < 0 ? leftEdge : rightEdge;
  let d = "";
  for (let age = 0; age < OPEN_AGE; age++) {
    const x = r1(edge + dir * (values[age] / scaleMax) * G.side);
    d += `${age === 0 ? "M" : "L"}${x} ${r1(rowY(age) + G.rowHeight)}L${x} ${r1(rowY(age))}`;
  }
  const xo = r1(edge + dir * (values[OPEN_AGE] / scaleMax) * G.side);
  return `${d}M${xo} ${r1(rowY(OPEN_AGE) + G.rowHeight)}L${xo} ${r1(rowY(OPEN_AGE))}`;
}

export interface PyramidSvgOptions {
  /** The year the bars show. */
  year: number;
  /** The year the outline shows, or null for none. */
  compareYear: number | null;
  /** id prefix, so two charts on one page do not share title ids. */
  idPrefix?: string;
}

/**
 * The chart for one year, in people, as the page ships it. Every mark the client
 * script later moves carries a data attribute; nothing here depends on script.
 */
export function renderPyramidSvg(p: Pyramid, opts: PyramidSvgOptions): string {
  const { year, compareYear, idPrefix = "ap" } = opts;
  const i = yearIndex(p, year);
  const scale = pyramidScales(p).people;
  const now = summarise(p, year);
  const then = compareYear === null ? null : summarise(p, compareYear);
  const ci = compareYear === null ? -1 : yearIndex(p, compareYear);
  const w = (v: number) => r1((v / scale.max) * G.side);

  const title = `${p.name}: population by single year of age and sex, mid-${year}${then ? ` against mid-${then.year}` : ""}`;
  const desc = `Back-to-back bars, males on the left and females on the right, with age rising upwards from 0. Mid-${year}: ${count(now.population)} residents, median age ${now.medianAge.toFixed(1)}.${then ? ` Mid-${then.year}: ${count(then.population)} residents, median age ${then.medianAge.toFixed(1)}.` : ""} Source: ${PYRAMID_SOURCE_LINE}.`;

  const parts: string[] = [];
  parts.push(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${G.width} ${G.height}" role="img" aria-labelledby="${idPrefix}-title ${idPrefix}-desc" class="ap-svg" font-family="'Source Sans 3', system-ui, sans-serif">`);
  parts.push(`<title id="${idPrefix}-title" data-ap="svg-title">${escapeXml(title)}</title><desc id="${idPrefix}-desc" data-ap="svg-desc">${escapeXml(desc)}</desc>`);
  parts.push(`<rect class="ap-ground" width="${G.width}" height="${G.height}" fill="${PYRAMID_INK.ground}"/>`);
  parts.push(`<text class="ap-t ap-head" x="8" y="18" font-size="14" font-weight="600" fill="${PYRAMID_INK.text}" data-ap="head">${escapeXml(`${p.name}, mid-${year}`)}</text>`);
  parts.push(`<text class="ap-t ap-sub" x="8" y="31" font-size="10.5" fill="${PYRAMID_INK.muted}" data-ap="sub-now">${escapeXml(`Bars: mid-${year}, ${count(now.population)} residents`)}</text>`);
  parts.push(`<g data-ap="sub-then-group"${then ? "" : ' display="none"'}><line class="ap-key-line" x1="8" x2="22" y1="40" y2="40" stroke="${PYRAMID_INK.text}" stroke-width="1.3"/><text class="ap-t ap-sub" x="26" y="43.5" font-size="10.5" fill="${PYRAMID_INK.muted}" data-ap="sub-then">${then ? escapeXml(`Outline: mid-${then.year}, ${count(then.population)} residents`) : ""}</text></g>`);
  parts.push(`<g data-ap="sub-ew-group" display="none"><line class="ap-key-line" x1="8" x2="22" y1="52.5" y2="52.5" stroke="${PYRAMID_INK.text}" stroke-width="1.3" stroke-dasharray="3 2"/><text class="ap-t ap-sub" x="26" y="56" font-size="10.5" fill="${PYRAMID_INK.muted}" data-ap="sub-ew"></text></g>`);
  // Identity is carried by side and by a swatch beside an ink label, never by coloured text.
  parts.push(`<rect class="ap-m" x="${r1(leftEdge - 46)}" y="${G.top - 13}" width="8" height="8" rx="1.5" fill="${PYRAMID_INK.males}"/><text class="ap-t" x="${r1(leftEdge - 35)}" y="${G.top - 6}" font-size="10.5" font-weight="600" fill="${PYRAMID_INK.text}">Males</text>`);
  parts.push(`<rect class="ap-f" x="${r1(rightEdge + 2)}" y="${G.top - 13}" width="8" height="8" rx="1.5" fill="${PYRAMID_INK.females}"/><text class="ap-t" x="${r1(rightEdge + 13)}" y="${G.top - 6}" font-size="10.5" font-weight="600" fill="${PYRAMID_INK.text}">Females</text>`);

  parts.push(`<g data-ap="grid">`);
  for (let t = 0; t <= scale.max + 1e-9; t += scale.step) {
    for (const dir of [-1, 1] as const) {
      const x = r1((dir < 0 ? leftEdge : rightEdge) + dir * w(t));
      parts.push(`<line class="ap-grid" x1="${x}" x2="${x}" y1="${G.top}" y2="${plotBottom}" stroke="${PYRAMID_INK.grid}" stroke-width="0.6"/>`);
      parts.push(`<text class="ap-t ap-tick" x="${x}" y="${plotBottom + 12}" font-size="10.5" text-anchor="middle" fill="${PYRAMID_INK.muted}">${tickLabel(t, "people")}</text>`);
    }
  }
  parts.push(`</g>`);

  for (let age = 0; age < AGE_COUNT; age++) {
    const y = r1(rowY(age) + (G.rowHeight - G.barHeight) / 2);
    parts.push(`<rect class="ap-m" data-ap-bar="M" data-age="${age}" x="${r1(leftEdge - w(p.M[i][age]))}" y="${y}" width="${w(p.M[i][age])}" height="${G.barHeight}" fill="${PYRAMID_INK.males}"/>`);
    parts.push(`<rect class="ap-f" data-ap-bar="F" data-age="${age}" x="${rightEdge}" y="${y}" width="${w(p.F[i][age])}" height="${G.barHeight}" fill="${PYRAMID_INK.females}"/>`);
    if (age % 10 === 0) {
      parts.push(`<text class="ap-t ap-age" x="${G.centre}" y="${r1(rowY(age) + G.rowHeight + 1.5)}" font-size="10" text-anchor="middle" fill="${PYRAMID_INK.text}">${age === OPEN_AGE ? "90+" : age}</text>`);
    }
  }

  parts.push(`<path class="ap-outline" data-ap="outline-M" fill="none" stroke="${PYRAMID_INK.text}" stroke-width="1.1" stroke-linejoin="round" d="${ci < 0 ? "" : outlinePath(p.M[ci], scale.max, -1)}"/>`);
  parts.push(`<path class="ap-outline" data-ap="outline-F" fill="none" stroke="${PYRAMID_INK.text}" stroke-width="1.1" stroke-linejoin="round" d="${ci < 0 ? "" : outlinePath(p.F[ci], scale.max, 1)}"/>`);
  parts.push(`<path class="ap-outline ap-outline-ew" data-ap="ew-M" fill="none" stroke="${PYRAMID_INK.text}" stroke-width="1.1" stroke-dasharray="3 2" d=""/>`);
  parts.push(`<path class="ap-outline ap-outline-ew" data-ap="ew-F" fill="none" stroke="${PYRAMID_INK.text}" stroke-width="1.1" stroke-dasharray="3 2" d=""/>`);
  parts.push(`<rect class="ap-cursor" data-ap="cursor" x="8" y="0" width="${G.width - 16}" height="${G.rowHeight}" fill="${PYRAMID_INK.text}" fill-opacity="0.16" display="none"/>`);

  parts.push(`<text class="ap-t ap-axis" x="${G.centre}" y="${plotBottom + 27}" font-size="10" text-anchor="middle" fill="${PYRAMID_INK.muted}" data-ap="axis-label">People at each single year of age (90+ is 90 and over)</text>`);
  parts.push(`<text class="ap-t ap-source" x="8" y="${plotBottom + 44}" font-size="9.5" fill="${PYRAMID_INK.muted}">Source: ONS population estimates, detailed time series,</text>`);
  parts.push(`<text class="ap-t ap-source" x="8" y="${plotBottom + 55}" font-size="9.5" fill="${PYRAMID_INK.muted}">${escapeXml(`table ${PYRAMID_SOURCE.table}${PYRAMID_PUBLISHED_DAY ? `, published ${PYRAMID_PUBLISHED_DAY}` : ""}.`)}</text>`);
  parts.push(`</svg>`);
  return parts.join("");
}

/** What the client script needs, inline in the page: the council's rows and the fixed scales. */
export function pyramidClientData(p: Pyramid) {
  return {
    code: p.code,
    name: p.name,
    years: p.years,
    M: p.M,
    F: p.F,
    scales: pyramidScales(p),
    geometry: PYRAMID_GEOMETRY,
    openAge: OPEN_AGE,
    plotBottom,
    englandAndWalesUrl: p.code === ENGLAND_AND_WALES ? null : ENGLAND_AND_WALES_JSON_PATH
  };
}

/** Change between two years in the words the page uses: "13,914 more", "1.0 years lower". */
export function changeWords(now: number, then: number, more = "more", fewer = "fewer"): string {
  const diff = now - then;
  if (diff === 0) return "no change";
  return `${count(Math.abs(diff))} ${diff > 0 ? more : fewer}`;
}

/** The sentences under the heading. Every number is read from the data. */
export function pyramidSentences(p: Pyramid): string[] {
  const now = summarise(p, PYRAMID_LATEST_YEAR);
  const then = summarise(p, PYRAMID_BASE_YEAR);
  return [
    `At mid-${now.year} ${p.name} had ${count(now.population)} residents and a median age of ${now.medianAge.toFixed(1)}.`,
    `At mid-${then.year} it had ${count(then.population)} residents and a median age of ${then.medianAge.toFixed(1)}.`
  ];
}

/** The id of this workbook's row in /data/sources.csv. */
export const PYRAMID_SOURCE_ID = "ons-myeb1";
export const PYRAMID_CSV_COLUMNS = ["area_code", "area_name", "year", "sex", "age", "population", "source_id"] as const;

/** Long-format rows for the download: one per year, sex and single year of age. */
export function pyramidCsvRows(p: Pyramid): Array<Record<(typeof PYRAMID_CSV_COLUMNS)[number], string | number>> {
  const rows: Array<Record<(typeof PYRAMID_CSV_COLUMNS)[number], string | number>> = [];
  p.years.forEach((year, i) => {
    for (const [sex, label] of [["M", "male"], ["F", "female"]] as const) {
      p[sex][i].forEach((population, age) => {
        rows.push({ area_code: p.code, area_name: data.areas[p.code]?.name ?? p.name, year, sex: label, age: age === OPEN_AGE ? "90+" : age, population, source_id: PYRAMID_SOURCE_ID });
      });
    }
  });
  return rows;
}

/** "How to cite this page" for a pyramid page, in the shape src/lib/cite.ts gives place pages. */
export function pyramidCitation(opts: { title: string; url: string }): string {
  const year = PYRAMID_PUBLISHED_ISO?.slice(0, 4) ?? String(PYRAMID_LATEST_YEAR + 1);
  const edition = `${PYRAMID_SOURCE.title.split(". ")[0]}, detailed time series ${PYRAMID_BASE_YEAR} to ${PYRAMID_LATEST_YEAR}, table ${PYRAMID_SOURCE.table}${PYRAMID_PUBLISHED_DAY ? ` (published ${PYRAMID_PUBLISHED_DAY})` : ""}`;
  return `UK Demographics (${year}) ${opts.title}. Data: ${PYRAMID_SOURCE.publisher}, ${edition}. Available at: ${opts.url} (Accessed: [date]).`;
}

/** "summer 2027", from the workbook's own sentence about its next publication. */
export const PYRAMID_NEXT_STATED = /scheduled for (.+?)\.?$/.exec(PYRAMID_SOURCE.nextPublication)?.[1] ?? null;
