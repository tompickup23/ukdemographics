/**
 * Components of population change: births, deaths, moves within the UK, international
 * migration and other changes, for each council and for England and Wales, every year
 * from mid-2011 (register row R628; docs/product/population-change-spec-2026-11-11.md).
 *
 * The figures are ONS's, table MYEB3, exactly as published; the file is built by
 * scripts/build/build-population-change.mjs, which refuses to write unless the parts add
 * up to the change in population in every year. The 95 per cent interval and the July
 * 2026 revisions come from the separate mid-year estimates workbook
 * (population-estimates.json, tables MYE0 and MYE4).
 *
 * Both charts are drawn here as SVG strings at build time, so the page works with no
 * script. Every number in a sentence is read from the data, never typed.
 */
import rawChange from "../data/live/population-change.json";
import rawEstimates from "../data/live/population-estimates.json";
import { slugifyAreaName } from "./site";
import { plainPlaceName } from "./place-names";
import { textWidth } from "./age-pyramid";

type Series = number[];
interface RawArea {
  name: string;
  population: Series;
  births: Series;
  deaths: Series;
  internalIn: Series;
  internalOut: Series;
  internationalIn: Series;
  internationalOut: Series;
  other: Series;
}
const data = rawChange as unknown as {
  source: {
    publisher: string; title: string; table: string; published: string; nextPublication: string;
    geography: string; landing: string; sourceUrl: string; fileName: string; fileSha256: string;
    definitions: Record<"births" | "deaths" | "internalIn" | "internalOut" | "internationalIn" | "internationalOut" | "other", string>;
  };
  years: number[];
  englandAndWales: RawArea;
  areas: Record<string, RawArea & { sourceName: string }>;
};

interface EstimateArea {
  population: number;
  ci95: { lower: number; upper: number } | null;
  revisions: Record<string, { publishedJuly2025: number; revisedJuly2026: number }>;
}
const estimates = rawEstimates as unknown as {
  source: { title: string; tables: string; published: string; sourceUrl: string; referenceDate: string };
  latestYear: number;
  countries: Record<string, EstimateArea>;
  areas: Record<string, EstimateArea>;
};

export const CHANGE_SOURCE = data.source;
export const CHANGE_YEARS: readonly number[] = data.years;
export const CHANGE_BASE_YEAR = data.years[0];
export const CHANGE_LATEST_YEAR = data.years[data.years.length - 1];
export const ENGLAND_AND_WALES = "K04000001";
/** The last year whose "other" figure includes ONS's adjustment to the 2021 Census, as its notes say. */
export const REBASED_UNTIL = 2021;

const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
/** "29 July 2026", read from the workbook's own publication sentence. */
export const CHANGE_PUBLISHED_DAY = /(\d{1,2} [A-Z][a-z]+ \d{4})/.exec(data.source.published)?.[1] ?? "";
/** The same day as an ISO date, for sitemap lastmod and schema; null if the sentence changes shape. */
export const CHANGE_PUBLISHED_ISO: string | null = (() => {
  const m = /^(\d{1,2}) ([A-Z][a-z]+) (\d{4})$/.exec(CHANGE_PUBLISHED_DAY);
  const month = m ? MONTHS.indexOf(m[2]) : -1;
  return m && month >= 0 ? `${m[3]}-${String(month + 1).padStart(2, "0")}-${m[1].padStart(2, "0")}` : null;
})();
/** "summer 2027", from the workbook's own sentence about its next publication. */
export const CHANGE_NEXT_STATED = /scheduled for (.+?)\.?$/.exec(data.source.nextPublication)?.[1] ?? null;
export const CHANGE_SOURCE_LINE = `ONS, ${data.source.title.split(". ")[0]}, detailed time series ${CHANGE_BASE_YEAR} to ${CHANGE_LATEST_YEAR}, table ${data.source.table}${CHANGE_PUBLISHED_DAY ? `, published ${CHANGE_PUBLISHED_DAY}` : ""}`;
export const ESTIMATES_PUBLISHED_DAY = /(\d{1,2} [A-Z][a-z]+ \d{4})/.exec(estimates.source.published)?.[1] ?? "";
export const ESTIMATES_SOURCE_LINE = `ONS, ${estimates.source.title}, tables MYE0 and MYE4${ESTIMATES_PUBLISHED_DAY ? `, published ${ESTIMATES_PUBLISHED_DAY}` : ""}`;
export const ESTIMATES_SOURCE_URL = estimates.source.sourceUrl;
/** ONS's own caution, from the Notes sheet of the workbook. */
export const CHANGE_ACCURACY_NOTE =
  "ONS publishes these estimates unrounded and says they should not be taken to be accurate to the level of detail provided.";

export interface Change {
  code: string;
  /** The name the page uses: the plain place name for a council. */
  name: string;
  years: readonly number[];
  population: Series;
  births: Series;
  deaths: Series;
  internalIn: Series;
  internalOut: Series;
  internationalIn: Series;
  internationalOut: Series;
  other: Series;
}

export function changeCodes(): string[] {
  return Object.keys(data.areas);
}

export function changeFor(code: string): Change | null {
  if (code === ENGLAND_AND_WALES) return { code, ...data.englandAndWales, years: data.years };
  const area = data.areas[code];
  return area ? { code, ...area, name: plainPlaceName(code, area.name), years: data.years } : null;
}

/** The ONS name of a council, which is what its place page address is built from. */
export function changeOnsName(code: string): string | null {
  return data.areas[code]?.name ?? null;
}

export const changePath = (onsName: string) => `/places/${slugifyAreaName(onsName)}/population-change/`;
export const changeCsvPath = (onsName: string) => `/data/population-change/${slugifyAreaName(onsName)}.csv`;
export const CHANGE_HUB_PATH = "/population-change/";

// ---------------------------------------------------------------------------
// The parts of one year, and of a run of years.
// ---------------------------------------------------------------------------

export interface Parts {
  from: number;
  to: number;
  start: number;
  end: number;
  births: number;
  deaths: number;
  natural: number;
  internalIn: number;
  internalOut: number;
  internalNet: number;
  internationalIn: number;
  internationalOut: number;
  internationalNet: number;
  other: number;
  change: number;
}

/**
 * The parts from mid-`from` to mid-`to`, summed over every year between. Throws if the
 * parts do not add up to the change in population, which the build already refused.
 */
export function partsBetween(c: Change, from: number, to: number): Parts {
  const a = c.years.indexOf(from);
  const b = c.years.indexOf(to);
  if (a < 0 || b <= a) throw new Error(`${c.code}: no run of years from mid-${from} to mid-${to}`);
  const total = (s: Series) => s.slice(a, b).reduce((x, y) => x + y, 0);
  const births = total(c.births);
  const deaths = total(c.deaths);
  const internalIn = total(c.internalIn);
  const internalOut = total(c.internalOut);
  const internationalIn = total(c.internationalIn);
  const internationalOut = total(c.internationalOut);
  const other = total(c.other);
  const p: Parts = {
    from, to, start: c.population[a], end: c.population[b],
    births, deaths, natural: births - deaths,
    internalIn, internalOut, internalNet: internalIn - internalOut,
    internationalIn, internationalOut, internationalNet: internationalIn - internationalOut,
    other, change: c.population[b] - c.population[a]
  };
  if (p.natural + p.internalNet + p.internationalNet + p.other !== p.change) {
    throw new Error(`${c.code}: parts from mid-${from} to mid-${to} do not add up to the change`);
  }
  return p;
}

export const latestParts = (c: Change) => partsBetween(c, CHANGE_LATEST_YEAR - 1, CHANGE_LATEST_YEAR);
export const yearParts = (c: Change) => c.years.slice(1).map((y) => partsBetween(c, y - 1, y));

// ---------------------------------------------------------------------------
// Words. Every number is read from the data.
// ---------------------------------------------------------------------------

const count = (n: number) => n.toLocaleString("en-GB");
/** "+1,751", "−5,960" (minus sign, not a hyphen), "0". */
export const signed = (n: number) => (n > 0 ? `+${count(n)}` : n < 0 ? `−${count(-n)}` : "0");

function netWords(net: number): string {
  return net > 0 ? `a net gain of ${count(net)}` : net < 0 ? `a net loss of ${count(-net)}` : "no net change";
}

function naturalWords(p: Parts): string {
  if (p.natural > 0) return `births outnumbered deaths by ${count(p.natural)}`;
  if (p.natural < 0) return `deaths outnumbered births by ${count(-p.natural)}`;
  return "births and deaths were equal";
}

function otherWords(other: number): string {
  return other > 0 ? `Other changes added ${count(other)}.` : other < 0 ? `Other changes took away ${count(-other)}.` : "Other changes made no difference.";
}

function movement(p: Parts, name: string): string {
  if (p.change > 0) return `the population of ${name} rose by ${count(p.change)}, from ${count(p.start)} to ${count(p.end)}`;
  if (p.change < 0) return `the population of ${name} fell by ${count(-p.change)}, from ${count(p.start)} to ${count(p.end)}`;
  return `the population of ${name} stayed at ${count(p.start)}`;
}

/**
 * For England and Wales the internal in and out figures are sums over councils, so they
 * include every move between two councils; only their difference is a flow across the
 * boundary, to and from Scotland and Northern Ireland. The page shows that difference only.
 */
export const isWhole = (c: Change) => c.code === ENGLAND_AND_WALES;
export const internalLabel = (c: Change) => (isWhole(c) ? "Moves to and from the rest of the UK, net" : "Moves within the UK, net");

/** The sentences for one year, in the order the chart reads. */
export function yearSentences(c: Change, p: Parts = latestParts(c)): string[] {
  return [
    `Between mid-${p.from} and mid-${p.to} ${movement(p, c.name)}.`,
    `There were ${count(p.births)} births and ${count(p.deaths)} deaths, so ${naturalWords(p)}.`,
    isWhole(c)
      ? `Moves to and from Scotland and Northern Ireland gave ${netWords(p.internalNet)}.`
      : `There were ${count(p.internalIn)} moves into ${c.name} from elsewhere in the UK and ${count(p.internalOut)} moves out to elsewhere in the UK, ${netWords(p.internalNet)}.`,
    `There were ${count(p.internationalIn)} moves in from outside the UK and ${count(p.internationalOut)} moves out to outside the UK, ${netWords(p.internationalNet)}.`,
    otherWords(p.other)
  ];
}

/** The sentences for the whole run, mid-2011 to the latest year. */
export function spanSentences(c: Change): string[] {
  const p = partsBetween(c, CHANGE_BASE_YEAR, CHANGE_LATEST_YEAR);
  const years = CHANGE_LATEST_YEAR - CHANGE_BASE_YEAR;
  const net = (v: number) => (v > 0 ? `added ${count(v)}` : v < 0 ? `took away ${count(-v)}` : "made no difference");
  const out = [
    `From mid-${p.from} to mid-${p.to} ${movement(p, c.name)}.`,
    `Over those ${years} years ${naturalWords(p)}, moves ${isWhole(c) ? "to and from the rest of the UK" : "within the UK"} ${net(p.internalNet)}, international migration ${net(p.internationalNet)} and other changes ${net(p.other)}.`
  ];
  const rebased = partsBetween(c, CHANGE_BASE_YEAR, REBASED_UNTIL).other;
  if (Math.abs(rebased) * 10 >= Math.abs(p.change) && rebased !== 0) {
    out.push(`Of the other changes, ${signed(rebased)} fall between mid-${CHANGE_BASE_YEAR} and mid-${REBASED_UNTIL}, the years ONS adjusted so that its estimates agree with the 2021 Census.`);
  }
  return out;
}

// ---------------------------------------------------------------------------
// The 95 per cent interval and the revisions, from the mid-year estimates workbook.
// ---------------------------------------------------------------------------

export interface Certainty {
  year: number;
  population: number;
  lower: number;
  upper: number;
  revisions: Array<{ year: number; first: number; revised: number; difference: number }>;
}

export function certaintyFor(code: string): Certainty | null {
  const e = code === ENGLAND_AND_WALES ? estimates.countries[code] : estimates.areas[code];
  if (!e?.ci95) return null;
  return {
    year: estimates.latestYear,
    population: e.population,
    lower: Math.round(e.ci95.lower),
    upper: Math.round(e.ci95.upper),
    revisions: Object.entries(e.revisions)
      .map(([y, r]) => ({ year: Number(y), first: r.publishedJuly2025, revised: r.revisedJuly2026, difference: r.revisedJuly2026 - r.publishedJuly2025 }))
      .sort((a, b) => a.year - b.year)
  };
}

// ---------------------------------------------------------------------------
// Drawing. A viewBox 360 units wide, so on a 375 px phone a unit is close to a
// pixel and the smallest text (10 units) stays readable. Colours are written into
// the SVG so a saved image stands alone; the page's stylesheet swaps in the tokens.
// ---------------------------------------------------------------------------

export const CHANGE_INK = {
  ground: "#ffffff",
  part: "#1a6ba8",
  total: "#171b1f",
  text: "#171b1f",
  muted: "#545c63",
  grid: "#dbdfe3"
} as const;

export const CHART_WIDTH = 360;
const PAD = 8;
const r1 = (v: number) => Math.round(v * 10) / 10;
const escapeXml = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

/** Text boxes each chart draws, kept so the tests can check that none leaves the picture or overlaps another. */
export interface TextBox { text: string; x: number; y: number; width: number; size: number; anchor: "start" | "middle" | "end" }
export interface MarkBox { x: number; y: number; width: number; height: number }
export interface Drawn { svg: string; width: number; height: number; texts: TextBox[]; marks: MarkBox[]; alt: string }

class Canvas {
  parts: string[] = [];
  texts: TextBox[] = [];
  marks: MarkBox[] = [];
  text(text: string, x: number, y: number, size: number, cls: string, opts: { anchor?: "start" | "middle" | "end"; weight?: number; fill?: string } = {}) {
    const anchor = opts.anchor ?? "start";
    this.texts.push({ text, x, y, width: textWidth(text, size), size, anchor });
    this.parts.push(`<text class="pc-t ${cls}" x="${r1(x)}" y="${r1(y)}" font-size="${size}"${anchor === "start" ? "" : ` text-anchor="${anchor}"`}${opts.weight ? ` font-weight="${opts.weight}"` : ""} fill="${opts.fill ?? CHANGE_INK.text}">${escapeXml(text)}</text>`);
  }
  rect(x: number, y: number, width: number, height: number, cls: string, fill: string) {
    this.marks.push({ x, y, width, height });
    this.parts.push(`<rect class="${cls}" x="${r1(x)}" y="${r1(y)}" width="${r1(width)}" height="${r1(height)}" fill="${fill}"/>`);
  }
  line(x1: number, y1: number, x2: number, y2: number, cls: string, stroke: string, width = 1) {
    this.parts.push(`<line class="${cls}" x1="${r1(x1)}" y1="${r1(y1)}" x2="${r1(x2)}" y2="${r1(y2)}" stroke="${stroke}" stroke-width="${width}"/>`);
  }
}

/** The heading size: 14 units, stepped down for the longest names so the line stays inside the picture. */
function headSize(text: string): number {
  const room = CHART_WIDTH - 2 * PAD;
  return textWidth(text, 14) <= room ? 14 : Math.floor((room / (text.length * 0.56)) * 10) / 10;
}

function wrapSvg(id: string, title: string, desc: string, height: number, body: Canvas, cls: string): string {
  return [
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${CHART_WIDTH} ${r1(height)}" role="img" aria-labelledby="${id}-title ${id}-desc" class="pc-svg ${cls}" font-family="'Source Sans 3', system-ui, sans-serif">`,
    `<title id="${id}-title">${escapeXml(title)}</title><desc id="${id}-desc">${escapeXml(desc)}</desc>`,
    `<rect class="pc-ground" width="${CHART_WIDTH}" height="${r1(height)}" fill="${CHANGE_INK.ground}"/>`,
    ...body.parts,
    `</svg>`
  ].join("");
}

export const COMPONENT_ROWS = [
  { key: "births", label: "Births", value: (p: Parts) => p.births },
  { key: "deaths", label: "Deaths", value: (p: Parts) => -p.deaths },
  { key: "internal", label: "Moves within the UK, net", value: (p: Parts) => p.internalNet },
  { key: "international", label: "International migration, net", value: (p: Parts) => p.internationalNet },
  { key: "other", label: "Other changes", value: (p: Parts) => p.other }
] as const;

/**
 * One year as a ledger: the start, a bar from zero for each part, the total change,
 * and the end. Bars run right for a gain and left for a loss; the value is printed in a
 * column of its own at the right, so no label can sit on a bar.
 */
export function renderYearSvg(c: Change, p: Parts = latestParts(c), id = "pc-year"): Drawn {
  const k = new Canvas();
  const ROW = 34;
  const valueRight = CHART_WIDTH - PAD;
  const valueRoom = 60;
  const barLeft = PAD;
  const barRight = valueRight - valueRoom - 6;
  const head = `${c.name}, mid-${p.from} to mid-${p.to}`;
  k.text(head, PAD, 20, headSize(head), "pc-head", { weight: 600 });
  k.text("Change in population, by part", PAD, 35, 10.5, "pc-sub", { fill: CHANGE_INK.muted });

  let y = 52;
  k.text(`Mid-${p.from} population`, PAD, y + 11, 11, "pc-label");
  k.text(count(p.start), valueRight, y + 11, 11, "pc-value", { anchor: "end", weight: 600 });
  y += 22;
  k.line(PAD, y, CHART_WIDTH - PAD, y, "pc-rule", CHANGE_INK.grid);
  y += 6;

  const values = [...COMPONENT_ROWS.map((r) => r.value(p)), p.change];
  const pos = Math.max(0, ...values);
  const neg = Math.max(0, ...values.map((v) => -v));
  const span = pos + neg || 1;
  const zero = barLeft + (neg / span) * (barRight - barLeft);
  const w = (v: number) => (Math.abs(v) / span) * (barRight - barLeft);
  const plotTop = y;

  const row = (label: string, v: number, cls: string, fill: string, weight?: number) => {
    k.text(label, PAD, y + 11, 11, "pc-label", { weight });
    const width = w(v);
    if (width > 0) k.rect(v >= 0 ? zero : zero - width, y + 16, Math.max(width, 0.6), 11, cls, fill);
    k.text(signed(v), valueRight, y + 26, 11, "pc-value", { anchor: "end", weight: weight ?? 400 });
    y += ROW;
  };
  for (const r of COMPONENT_ROWS) row(r.key === "internal" ? internalLabel(c) : r.label, r.value(p), "pc-part", CHANGE_INK.part);
  k.line(PAD, y + 2, CHART_WIDTH - PAD, y + 2, "pc-rule", CHANGE_INK.grid);
  y += 8;
  row("Total change", p.change, "pc-total", CHANGE_INK.total, 600);
  k.line(zero, plotTop, zero, y - 4, "pc-zero", CHANGE_INK.text, 1);

  k.line(PAD, y, CHART_WIDTH - PAD, y, "pc-rule", CHANGE_INK.grid);
  y += 6;
  k.text(`Mid-${p.to} population`, PAD, y + 11, 11, "pc-label");
  k.text(count(p.end), valueRight, y + 11, 11, "pc-value", { anchor: "end", weight: 600 });
  y += 30;
  k.text("Source: ONS population estimates, detailed time series,", PAD, y, 9.5, "pc-source", { fill: CHANGE_INK.muted });
  k.text(`table ${CHANGE_SOURCE.table}${CHANGE_PUBLISHED_DAY ? `, published ${CHANGE_PUBLISHED_DAY}` : ""}.`, PAD, y + 11, 9.5, "pc-source", { fill: CHANGE_INK.muted });
  const height = y + 20;

  const title = `${c.name}: components of population change, mid-${p.from} to mid-${p.to}`;
  const alt = `Bars from zero for each part of the change, gains to the right and losses to the left. Mid-${p.from}: ${count(p.start)}. Births ${signed(p.births)}, deaths ${signed(-p.deaths)}, ${internalLabel(c).toLowerCase()} ${signed(p.internalNet)}, international migration net ${signed(p.internationalNet)}, other changes ${signed(p.other)}. Total change ${signed(p.change)}. Mid-${p.to}: ${count(p.end)}. Source: ${CHANGE_SOURCE_LINE}.`;
  return { svg: wrapSvg(id, title, alt, height, k, "pc-year"), width: CHART_WIDTH, height, texts: k.texts, marks: k.marks, alt };
}

/** The smallest of 1, 2, 2.5 or 5 times a power of ten that is at least v, and never below 1. */
export function niceStep(v: number): number {
  if (v <= 1) return 1;
  const pow = 10 ** Math.floor(Math.log10(v));
  for (const m of [1, 2, 2.5, 5, 10]) if (m * pow >= v) return Math.max(1, m * pow);
  return 10 * pow;
}

export const PANELS = [
  { key: "natural", label: "Births minus deaths", value: (p: Parts) => p.natural, total: false },
  { key: "internal", label: "Moves within the UK, net", value: (p: Parts) => p.internalNet, total: false },
  { key: "international", label: "International migration, net", value: (p: Parts) => p.internationalNet, total: false },
  { key: "other", label: "Other changes", value: (p: Parts) => p.other, total: false },
  { key: "total", label: "Total change", value: (p: Parts) => p.change, total: true }
] as const;

/** One scale for every panel, so the size of a column means the same thing in each. */
export function panelScale(rows: Parts[]): { top: number; bottom: number; step: number } {
  const values = rows.flatMap((p) => PANELS.map((d) => d.value(p)));
  const pos = Math.max(0, ...values);
  const neg = Math.max(0, ...values.map((v) => -v));
  const step = niceStep(Math.max(pos, neg) / 2);
  return { top: step * Math.ceil(pos / step), bottom: -step * Math.ceil(neg / step), step };
}

/** The year labels under each panel: the first, the last, and every fourth between. */
export function yearTicks(rows: Parts[]): number[] {
  const last = rows[rows.length - 1].to;
  const ticks = rows.map((p) => p.to).filter((y, i) => i % 4 === 0 && last - y >= 3);
  return [...ticks, last];
}

/**
 * Every year as small multiples, one panel per part and one for the total, all on
 * one scale. A column above the line is a gain in the twelve months to that mid-year.
 */
export function renderYearsSvg(c: Change, id = "pc-years"): Drawn {
  const rows = yearParts(c);
  const scale = panelScale(rows);
  const k = new Canvas();
  const head = `${c.name}, every year to mid-${CHANGE_LATEST_YEAR}`;
  k.text(head, PAD, 20, headSize(head), "pc-head", { weight: 600 });
  k.text("Change in the twelve months to each mid-year, on one scale", PAD, 35, 10.5, "pc-sub", { fill: CHANGE_INK.muted });

  const gutter = Math.max(...[scale.top, 0, scale.bottom].map((v) => textWidth(signed(v), 10))) + PAD + 6;
  const left = gutter;
  const right = CHART_WIDTH - PAD;
  const plotH = 62;
  const slot = (right - left) / rows.length;
  const barW = Math.min(16, slot * 0.72);
  const yOf = (v: number, top: number) => top + ((scale.top - v) / (scale.top - scale.bottom || 1)) * plotH;
  const ticks = yearTicks(rows);

  let y = 50;
  for (const panel of PANELS) {
    k.text(panel.key === "internal" ? internalLabel(c) : panel.label, PAD, y + 11, 11, "pc-label", { weight: 600 });
    const top = y + 20;
    for (const v of new Set([scale.top, 0, scale.bottom])) {
      const gy = yOf(v, top);
      k.line(left, gy, right, gy, v === 0 ? "pc-zero" : "pc-grid", v === 0 ? CHANGE_INK.text : CHANGE_INK.grid, v === 0 ? 1 : 0.6);
      k.text(signed(v), left - 6, gy + 3.5, 10, "pc-tick", { anchor: "end", fill: CHANGE_INK.muted });
    }
    rows.forEach((p, i) => {
      const v = panel.value(p);
      const x = left + i * slot + (slot - barW) / 2;
      const y0 = yOf(0, top);
      const y1 = yOf(v, top);
      const h = Math.abs(y1 - y0);
      if (h > 0) k.rect(x, Math.min(y0, y1), barW, Math.max(h, 0.6), panel.total ? "pc-total" : "pc-part", panel.total ? CHANGE_INK.total : CHANGE_INK.part);
    });
    const axisY = top + plotH + 12;
    for (const t of ticks) {
      const i = rows.findIndex((p) => p.to === t);
      k.text(String(t), left + i * slot + slot / 2, axisY, 10, "pc-tick", { anchor: "middle", fill: CHANGE_INK.muted });
    }
    y = axisY + 12;
  }
  y += 10;
  k.text("Source: ONS population estimates, detailed time series,", PAD, y, 9.5, "pc-source", { fill: CHANGE_INK.muted });
  k.text(`table ${CHANGE_SOURCE.table}${CHANGE_PUBLISHED_DAY ? `, published ${CHANGE_PUBLISHED_DAY}` : ""}. Each year runs to 30 June.`, PAD, y + 11, 9.5, "pc-source", { fill: CHANGE_INK.muted });
  const height = y + 20;

  const span = partsBetween(c, CHANGE_BASE_YEAR, CHANGE_LATEST_YEAR);
  const title = `${c.name}: components of population change in each year from mid-${CHANGE_BASE_YEAR} to mid-${CHANGE_LATEST_YEAR}`;
  const alt = `Five panels of columns on one scale, one column for each year to mid-${CHANGE_BASE_YEAR + 1} through mid-${CHANGE_LATEST_YEAR}: births minus deaths, ${internalLabel(c).toLowerCase()}, international migration net, other changes, and the total change. Summed over the whole period: births minus deaths ${signed(span.natural)}, ${internalLabel(c).toLowerCase()} ${signed(span.internalNet)}, international migration ${signed(span.internationalNet)}, other changes ${signed(span.other)}, total ${signed(span.change)}. Every value is in the table below the chart. Source: ${CHANGE_SOURCE_LINE}.`;
  return { svg: wrapSvg(id, title, alt, height, k, "pc-years"), width: CHART_WIDTH, height, texts: k.texts, marks: k.marks, alt };
}

/** The left and right edges of a text box. */
export function textEdges(t: TextBox): [number, number] {
  if (t.anchor === "end") return [t.x - t.width, t.x];
  if (t.anchor === "middle") return [t.x - t.width / 2, t.x + t.width / 2];
  return [t.x, t.x + t.width];
}

// ---------------------------------------------------------------------------
// Downloads and citation.
// ---------------------------------------------------------------------------

export const CHANGE_SOURCE_ID = "ons-myeb3";
export const CHANGE_CSV_COLUMNS = [
  "area_code", "area_name", "from_mid_year", "to_mid_year", "population_start", "births", "deaths",
  "internal_in", "internal_out", "international_in", "international_out", "other", "population_end", "source_id"
] as const;

export function changeCsvRows(c: Change): Array<Record<(typeof CHANGE_CSV_COLUMNS)[number], string | number>> {
  return yearParts(c).map((p) => ({
    area_code: c.code,
    area_name: data.areas[c.code]?.name ?? c.name,
    from_mid_year: p.from,
    to_mid_year: p.to,
    population_start: p.start,
    births: p.births,
    deaths: p.deaths,
    internal_in: p.internalIn,
    internal_out: p.internalOut,
    international_in: p.internationalIn,
    international_out: p.internationalOut,
    other: p.other,
    population_end: p.end,
    source_id: CHANGE_SOURCE_ID
  }));
}

/** "How to cite this page", in the shape src/lib/cite.ts gives place pages. */
export function changeCitation(opts: { title: string; url: string }): string {
  const year = CHANGE_PUBLISHED_ISO?.slice(0, 4) ?? String(CHANGE_LATEST_YEAR + 1);
  const edition = `${CHANGE_SOURCE.title.split(". ")[0]}, detailed time series ${CHANGE_BASE_YEAR} to ${CHANGE_LATEST_YEAR}, table ${CHANGE_SOURCE.table}${CHANGE_PUBLISHED_DAY ? ` (published ${CHANGE_PUBLISHED_DAY})` : ""}`;
  return `UK Demographics (${year}) ${opts.title}. Data: ${CHANGE_SOURCE.publisher}, ${edition}. Available at: ${opts.url} (Accessed: [date]).`;
}
