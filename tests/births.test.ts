import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

/**
 * Shape and cross-source checks for the two births layers built from the ONS
 * "Parents' country of birth" workbook (Table 1 and Table 6a).
 *
 * No published figure is pinned: the annual refresh must pass without editing this file.
 * Each check is a function that returns its offenders, so the same function is run on
 * the live file (expecting none) and on a copy with one planted error (expecting it to
 * be caught). A check that has never been seen to fail proves nothing.
 *
 * The cross-source check uses the ONS mid-2025 population estimates
 * (population-estimates.json), whose components of change include births in the year to
 * mid-2025. That is a different period from calendar-year registrations, so the two can
 * only be held to a band, not to equality.
 */

const read = (p: string) => JSON.parse(fs.readFileSync(path.resolve(p), "utf8"));
const byMother = read("src/data/live/births-by-mother-cob.json");
const history = read("src/data/live/births-history-national.json");
const estimates = read("src/data/live/population-estimates.json");
const siteAreas = read("src/data/live/ethnic-projections.json").areas as Record<string, any>;
const aliases = read("src/data/lookups/area-code-aliases.json").aliases as Record<string, string>;

const clone = <T>(v: T): T => JSON.parse(JSON.stringify(v));
const REGIONS_SUMMING_TO_NON_UK = ["EU", "RestOfEurope_nonEU", "Africa", "MiddleEastAndAsia", "RestOfWorld"];
const ALL_REGIONS = [...REGIONS_SUMMING_TO_NON_UK, "NewEU"];

/** Rows that disagree with themselves: counts, percentages and the regional split. */
function areaOffenders(file: any): string[] {
  const out: string[] = [];
  for (const [code, a] of Object.entries(file.areas as Record<string, any>)) {
    if (!Number.isInteger(a.totalBirths) || a.totalBirths <= 0) out.push(`${code} totalBirths ${a.totalBirths}`);
    if (a.ukBornMother + a.nonUkBornMother > a.totalBirths) out.push(`${code} UK + non-UK exceeds total`);
    if (a.nonUkBornMotherPct != null && a.totalBirths > 0) {
      const pct = (a.nonUkBornMother / a.totalBirths) * 100;
      if (Math.abs(pct - a.nonUkBornMotherPct) > 0.051) out.push(`${code} pct ${a.nonUkBornMotherPct} vs ${pct.toFixed(2)}`);
    }
    const r = a.byMotherRegion ?? {};
    if (ALL_REGIONS.every((k) => Number.isInteger(r[k]))) {
      const sum = REGIONS_SUMMING_TO_NON_UK.reduce((s, k) => s + r[k], 0);
      if (sum !== a.nonUkBornMother) out.push(`${code} regions sum ${sum} vs non-UK ${a.nonUkBornMother}`);
      if (r.NewEU > r.EU) out.push(`${code} NewEU exceeds EU`);
    } else if (/^[EW]\d{8}$/.test(code)) {
      out.push(`${code} missing a region column`);
    }
  }
  return out;
}

/** Every year in the national series: UK, non-UK and not stated add up to the total. */
function historyOffenders(h: any): string[] {
  const out: string[] = [];
  const n = h.years.length;
  for (const key of ["totalBirths", "ukBornMother", "nonUkBornMother", "nonUkBornMotherPct"]) {
    if (h[key]?.length !== n) out.push(`${key} has ${h[key]?.length} values for ${n} years`);
  }
  for (let i = 1; i < n; i++) if (h.years[i] !== h.years[i - 1] + 1) out.push(`gap after ${h.years[i - 1]}`);
  const notStated = h.byCategoryTimeSeries?.["Not Stated"];
  for (let i = 0; i < n; i++) {
    const parts = h.ukBornMother[i] + h.nonUkBornMother[i] + (notStated?.[i] ?? 0);
    if (notStated && parts !== h.totalBirths[i]) out.push(`${h.years[i]}: parts ${parts} vs total ${h.totalBirths[i]}`);
    if (!notStated && parts > h.totalBirths[i]) out.push(`${h.years[i]}: parts exceed total`);
  }
  return out;
}

/** The two tables come from one edition: same year, and Table 1's total is Table 6a's top row. */
function editionOffenders(h: any, m: any): string[] {
  const out: string[] = [];
  const last = h.years.length - 1;
  if (h.years[last] !== m.year) out.push(`history ends ${h.years[last]}, local file is ${m.year}`);
  if (h.sourceFile !== m.sourceFile) out.push(`built from ${h.sourceFile} and ${m.sourceFile}`);
  const top = Object.values(m.areas as Record<string, any>).find((a) => a.areaName === "ENGLAND, WALES AND ELSEWHERE");
  if (!top) out.push("no ENGLAND, WALES AND ELSEWHERE row");
  else {
    if (top.totalBirths !== h.totalBirths[last]) out.push(`totals ${top.totalBirths} vs ${h.totalBirths[last]}`);
    if (top.nonUkBornMother !== h.nonUkBornMother[last]) out.push(`non-UK ${top.nonUkBornMother} vs ${h.nonUkBornMother[last]}`);
  }
  return out;
}

/** Registered births against the mid-year estimates' births component, area by area. */
function estimateOffenders(m: any, minBirths = 300, band: [number, number] = [0.8, 1.25]): string[] {
  const out: string[] = [];
  for (const code of Object.keys(siteAreas)) {
    const b = m.areas[code];
    const e = estimates.areas[code]?.components?.births;
    if (!b || !e || b.totalBirths < minBirths) continue;
    const ratio = b.totalBirths / e;
    if (ratio < band[0] || ratio > band[1]) out.push(`${code} ${siteAreas[code].areaName}: ${b.totalBirths} vs ${e}`);
  }
  return out;
}

describe("births-by-mother-cob.json", () => {
  it("names its year, edition and release date from the workbook", () => {
    expect(Number.isInteger(byMother.year)).toBe(true);
    expect(byMother.lastUpdated).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(byMother.source).toContain(`Births in England and Wales: ${byMother.year}`);
    expect(byMother.source).toContain(`, ${byMother.year}.`);
    expect(byMother.sourceFile).toMatch(new RegExp(`^${byMother.year}births?byparentscountry`));
    expect(byMother.totalAreas).toBe(Object.keys(byMother.areas).length);
  });

  it("agrees with itself in every row", () => {
    expect(areaOffenders(byMother)).toEqual([]);
  });

  it("would catch a regional split that does not add up", () => {
    const planted = clone(byMother);
    planted.areas.E08000025.byMotherRegion.Africa += 1;
    const found = areaOffenders(planted);
    expect(found).toHaveLength(1);
    expect(found[0]).toMatch(/^E08000025 regions sum/);
  });

  it("files nothing under an alias code and covers every site area ONS publishes", () => {
    for (const alias of Object.keys(aliases)) expect(byMother.areas).not.toHaveProperty(alias);
    // ONS merges Cornwall and the Isles of Scilly into one row under both codes.
    const combined = new Set(Object.keys(byMother.areas).flatMap((k) => (k.includes(",") ? k.split(/,\s*/) : [])));
    const missing = Object.keys(siteAreas).filter((c) => !byMother.areas[c] && !combined.has(c));
    expect(missing).toEqual([]);
  });

  it("is in line with the mid-2025 population estimates' births for each area", () => {
    expect(estimateOffenders(byMother)).toEqual([]);
  });

  it("would catch an area whose births were read from the wrong column", () => {
    const planted = clone(byMother);
    planted.areas.E08000025.totalBirths = planted.areas.E08000025.nonUkBornMother;
    expect(estimateOffenders(planted)).toHaveLength(1);
  });
});

describe("births-history-national.json", () => {
  it("is a continuous series whose parts add up", () => {
    expect(historyOffenders(history)).toEqual([]);
    expect(history.lastUpdated).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it("would catch a year whose parts do not add up", () => {
    const planted = clone(history);
    planted.ukBornMother[planted.ukBornMother.length - 1] += 10;
    expect(historyOffenders(planted)).toHaveLength(1);
  });

  it("comes from the same edition as the local authority file", () => {
    expect(editionOffenders(history, byMother)).toEqual([]);
  });

  it("would catch a history left a year behind the local file", () => {
    const planted = clone(history);
    for (const key of ["years", "totalBirths", "ukBornMother", "nonUkBornMother", "nonUkBornMotherPct"]) planted[key].pop();
    expect(editionOffenders(planted, byMother).length).toBeGreaterThan(0);
  });
});
