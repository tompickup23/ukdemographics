import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

/**
 * Shape and cross-source checks for the two HMRC payrolled employments layers, both built
 * from one workbook (Table 1 by nationality; the regional tables by industry).
 *
 * No published figure is pinned: the annual refresh must pass without editing this file.
 * Each check returns its offenders, so it runs on the live files (expecting none) and on
 * a copy with one planted error (expecting that error to be caught).
 *
 * The cross-source check sets employments against the ONS mid-2025 population estimates
 * (population-estimates.json) for residents aged 18 to 64. Employments are not people
 * (one person can hold two) and the dates differ by six months, so this is a band.
 */

const read = (p: string) => JSON.parse(fs.readFileSync(path.resolve(p), "utf8"));
const byNationality = read("src/data/live/payroll-by-nationality.json");
const byRegion = read("src/data/live/payroll-by-region-industry.json");
const estimates = read("src/data/live/population-estimates.json");

const clone = <T>(v: T): T => JSON.parse(JSON.stringify(v));
const ENGLISH_REGIONS = ["North East", "North West", "Yorkshire and the Humber", "East Midlands",
  "West Midlands", "East", "London", "South East", "South West"];
const NATIONS = ["England", "Scotland", "Wales", "Northern Ireland"];
const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August",
  "September", "October", "November", "December"];
// Counts are rounded to the nearest 100, so a sum of n parts can be off by up to 50n.
const ROUNDING = (parts: number) => 50 * parts;

const monthIndex = (label: string) => {
  const [m, y] = label.split(" ");
  return Number(y) * 12 + MONTHS.indexOf(m);
};

/** Each region agrees with itself: groups and industries add up to the total. */
function regionOffenders(file: any): string[] {
  const out: string[] = [];
  for (const [name, r] of Object.entries(file.regions as Record<string, any>)) {
    const g = r.byNationalityGroup;
    const groups = g.UK + g.EU + g.NonEU;
    if (Math.abs(groups - r.totalEmployment) > ROUNDING(3)) out.push(`${name}: groups ${groups} vs total ${r.totalEmployment}`);
    const industries = Object.values(r.byIndustry as Record<string, any>);
    const sum = industries.reduce((s, i) => s + (i.total ?? 0), 0);
    if (Math.abs(sum - r.totalEmployment) > ROUNDING(industries.length)) out.push(`${name}: industries ${sum} vs total ${r.totalEmployment}`);
    if (monthIndex(r.latestSnapshotDate) - monthIndex(r.fiveYearBaselineDate) !== 60) out.push(`${name}: baseline is not five years back`);
  }
  const english = ENGLISH_REGIONS.reduce((s, n) => s + file.regions[n].totalEmployment, 0);
  if (Math.abs(english - file.regions.England.totalEmployment) > ROUNDING(ENGLISH_REGIONS.length)) {
    out.push(`English regions ${english} vs England ${file.regions.England.totalEmployment}`);
  }
  return out;
}

/** Both files come from one edition, and the 47 nationalities fit inside the non-UK totals. */
function editionOffenders(nat: any, reg: any): string[] {
  const out: string[] = [];
  if (nat.sourceFile !== reg.sourceFile) out.push(`built from ${nat.sourceFile} and ${reg.sourceFile}`);
  for (const [name, r] of Object.entries(reg.regions as Record<string, any>)) {
    if (r.latestSnapshotDate !== nat.latestSnapshotDate) out.push(`${name} ends ${r.latestSnapshotDate}, nationality table ${nat.latestSnapshotDate}`);
  }
  const named = Object.values(nat.timeSeries as Record<string, [string, number][]>)
    .map((s) => s[s.length - 1])
    .filter(([d]) => d === nat.latestSnapshotDate)
    .reduce((s, [, v]) => s + v, 0);
  const nonUk = NATIONS.reduce((s, n) => s + reg.regions[n].byNationalityGroup.EU + reg.regions[n].byNationalityGroup.NonEU, 0);
  if (named > nonUk) out.push(`named nationalities ${named} exceed non-UK employments ${nonUk}`);
  return out;
}

/** Employments per resident aged 18 to 64, England and Wales, against mid-2025 estimates. */
function populationOffenders(reg: any, band: [number, number] = [0.5, 1.0]): string[] {
  const out: string[] = [];
  for (const [name, code] of [["England", "E92000001"], ["Wales", "W92000004"]]) {
    const ratio = reg.regions[name].totalEmployment / estimates.countries[code].ageBands["18-64"];
    if (ratio < band[0] || ratio > band[1]) out.push(`${name}: ${ratio.toFixed(2)} employments per resident aged 18 to 64`);
  }
  return out;
}

describe("payroll-by-nationality.json", () => {
  it("names its period and publication from the workbook", () => {
    expect(byNationality.latestSnapshotDate).toMatch(/^[A-Z][a-z]+ \d{4}$/);
    expect(byNationality.lastUpdated).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(byNationality.source).toContain(`to ${byNationality.latestSnapshotDate}`);
    expect(byNationality.sourceFile).toContain(byNationality.latestSnapshotDate.replace(" ", "_"));
    expect(monthIndex(byNationality.latestSnapshotDate) - monthIndex(byNationality.fiveYearBaselineDate)).toBe(60);
  });

  it("holds a monthly series without gaps for every nationality it ranks", () => {
    for (const [country, series] of Object.entries(byNationality.timeSeries as Record<string, [string, number][]>)) {
      for (let i = 1; i < series.length; i++) {
        expect(monthIndex(series[i][0]) - monthIndex(series[i - 1][0]), `${country} at ${series[i][0]}`).toBe(1);
      }
    }
    for (const n of byNationality.topByLatestPayroll) {
      const s = byNationality.timeSeries[n.country];
      expect(s[s.length - 1]).toEqual([byNationality.latestSnapshotDate, n.payrollLatest]);
    }
  });
});

describe("payroll-by-region-industry.json", () => {
  it("holds every region a place page asks for", () => {
    expect(Object.keys(byRegion.regions).sort()).toEqual([...ENGLISH_REGIONS, ...NATIONS].sort());
    expect(byRegion.lastUpdated).toBe(byNationality.lastUpdated);
  });

  it("adds up within each region and across England", () => {
    expect(regionOffenders(byRegion)).toEqual([]);
  });

  it("would catch a region filed under another region's name", () => {
    const planted = clone(byRegion);
    planted.regions["North West"] = clone(byRegion.regions["North East"]);
    expect(regionOffenders(planted).some((o) => o.startsWith("English regions"))).toBe(true);
  });

  it("would catch a group column read as the total", () => {
    const planted = clone(byRegion);
    planted.regions.London.totalEmployment = planted.regions.London.byNationalityGroup.UK;
    expect(regionOffenders(planted).filter((o) => o.startsWith("London"))).toHaveLength(2);
  });
});

describe("the two payroll files together", () => {
  it("come from one edition and agree with each other", () => {
    expect(editionOffenders(byNationality, byRegion)).toEqual([]);
  });

  it("would catch a nationality file left an edition behind", () => {
    const planted = clone(byNationality);
    planted.latestSnapshotDate = "December 2024";
    expect(editionOffenders(planted, byRegion).length).toBeGreaterThan(0);
  });

  it("are in line with the mid-2025 population estimates", () => {
    expect(populationOffenders(byRegion)).toEqual([]);
  });

  it("would catch a regional total read in thousands", () => {
    const planted = clone(byRegion);
    planted.regions.Wales.totalEmployment = Math.round(planted.regions.Wales.totalEmployment / 1000);
    expect(populationOffenders(planted)).toHaveLength(1);
  });
});
