import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

/**
 * Shape and cross-source checks for the three DfE school census display files:
 * school-eal.json (upper-tier authorities), school-eal-district.json (schools aggregated
 * to district) and school-fertility-proxy.json. All three come from one release of
 * "Schools, pupils and their characteristics".
 *
 * school-validation.json and school-pressure.json are not checked here: the first is the
 * model's calibration input and the second is built from the model's output, so both
 * move with a model run, not with a DfE release.
 *
 * No published figure is pinned. Each check returns its offenders, so it runs on the
 * live files (expecting none) and on a copy with one planted error (expecting it caught).
 * The cross-source check uses the ONS mid-2025 population estimates
 * (population-estimates.json): pupils against residents aged 0 to 17, as a band, because
 * pupils are counted where they go to school and include some aged 18 and over.
 */

const read = (p: string) => JSON.parse(fs.readFileSync(path.resolve(p), "utf8"));
const utla = read("src/data/live/school-eal.json");
const district = read("src/data/live/school-eal-district.json");
const proxy = read("src/data/live/school-fertility-proxy.json");
const estimates = read("src/data/live/population-estimates.json");
const siteAreas = read("src/data/live/ethnic-projections.json").areas as Record<string, any>;
const aliases = read("src/data/lookups/area-code-aliases.json").aliases as Record<string, string>;

const clone = <T>(v: T): T => JSON.parse(JSON.stringify(v));
const periodOf = (year: string) => year.replace("/", ""); // "2025/26" -> "202526"

/** Upper-tier records agree with themselves, and districts carry their county's figures. */
function utlaOffenders(file: any): string[] {
  const out: string[] = [];
  const areas = file.areas as Record<string, any>;
  for (const [code, a] of Object.entries(areas)) {
    if (a.dataLevel === "own") {
      const sum = a.ealPct + a.englishPct + a.unclassifiedPct;
      if (Math.abs(sum - 100) > 0.1) out.push(`${code}: language shares sum to ${sum.toFixed(2)}`);
      if (a.totalPupils > 0 && Math.abs((a.ealCount / a.totalPupils) * 100 - a.ealPct) > 0.06) out.push(`${code}: ealPct disagrees with counts`);
      const latest = a.timeSeries?.[a.latestYear];
      if (!latest || latest.totalPupils !== a.totalPupils || latest.ealCount !== a.ealCount) out.push(`${code}: latest year not in its own series`);
    } else if (a.dataLevel === "parent_county") {
      const county = areas[a.parentCountyCode];
      if (!county) out.push(`${code}: parent ${a.parentCountyCode} missing`);
      else if (county.ealCount !== a.ealCount || county.totalPupils !== a.totalPupils) out.push(`${code}: differs from its county`);
    } else {
      out.push(`${code}: dataLevel ${a.dataLevel}`);
    }
  }
  return out;
}

/** District records agree with themselves. */
function districtOffenders(file: any): string[] {
  const out: string[] = [];
  for (const [code, a] of Object.entries(file.areas as Record<string, any>)) {
    if (a.ealCount + a.englishCount > a.totalPupils) out.push(`${code}: EAL + English exceeds pupils`);
    const eth = Object.values(a.ethnicityPct as Record<string, number>);
    if (eth.length && Math.abs(eth.reduce((s, v) => s + v, 0) - 100) > 0.6) out.push(`${code}: ethnicity shares do not sum to 100`);
  }
  return out;
}

/** The files are one release: same year, and the same national EAL count from two tables. */
function releaseOffenders(u: any, d: any, p: any): string[] {
  const out: string[] = [];
  if (u.academicYear !== d.academicYear) out.push(`school-eal ${u.academicYear}, district ${d.academicYear}`);
  if (u.lastUpdated !== d.lastUpdated || u.lastUpdated !== p.lastUpdated) out.push("release dates differ");
  if (p.years[p.years.length - 1] !== periodOf(u.academicYear)) out.push(`proxy ends ${p.years[p.years.length - 1]}`);
  const own = Object.values(u.areas as Record<string, any>).filter((a) => a.dataLevel === "own" && a.latestYear === u.academicYear);
  const utlaEal = own.reduce((s, a) => s + a.ealCount, 0);
  const districtEal = Object.values(d.areas as Record<string, any>).reduce((s, a) => s + a.ealCount, 0);
  if (Math.abs(districtEal - utlaEal) > utlaEal * 0.005) out.push(`EAL pupils: districts ${districtEal}, authorities ${utlaEal}`);
  return out;
}

/** Pupils in each unitary, metropolitan or London authority against its residents aged 0 to 17. */
function populationOffenders(u: any, minPupils = 5000, band: [number, number] = [0.45, 1.0]): string[] {
  const out: string[] = [];
  for (const [code, a] of Object.entries(u.areas as Record<string, any>)) {
    if (a.dataLevel !== "own" || a.latestYear !== u.academicYear || a.totalPupils < minPupils) continue;
    const children = estimates.areas[code]?.ageBands?.["0-17"];
    if (!children) continue;
    const ratio = a.totalPupils / children;
    if (ratio < band[0] || ratio > band[1]) out.push(`${code} ${a.areaName}: ${ratio.toFixed(2)} pupils per resident aged 0 to 17`);
  }
  return out;
}

describe("school-eal.json", () => {
  it("names the academic year and release it was built from", () => {
    expect(utla.academicYear).toMatch(/^\d{4}\/\d{2}$/);
    expect(utla.lastUpdated).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(utla.source).toContain(`academic year ${utla.academicYear}`);
    expect(utla.sourceFile).toContain(utla.academicYear.replace("/", "-"));
  });

  it("agrees with itself", () => {
    expect(utlaOffenders(utla)).toEqual([]);
  });

  it("would catch a district that no longer matches its county", () => {
    const planted = clone(utla);
    planted.areas.E07000117.ealCount += 1;
    expect(utlaOffenders(planted)).toEqual(["E07000117: differs from its county"]);
  });

  it("is in line with the mid-2025 population estimates", () => {
    expect(populationOffenders(utla)).toEqual([]);
  });

  it("would catch pupils read from the wrong column", () => {
    const planted = clone(utla);
    planted.areas.E08000025.totalPupils = planted.areas.E08000025.ealCount;
    planted.areas.E08000025.ealCount = 0;
    expect(populationOffenders(planted)).toHaveLength(1);
  });
});

describe("school-eal-district.json", () => {
  it("names the academic year and release it was built from", () => {
    expect(district.academicYear).toMatch(/^\d{4}\/\d{2}$/);
    expect(district.source).toContain(`academic year ${district.academicYear}`);
  });

  it("agrees with itself and files nothing under an alias code", () => {
    expect(districtOffenders(district)).toEqual([]);
    for (const alias of Object.keys(aliases)) expect(district.areas).not.toHaveProperty(alias);
  });

  it("covers every place-page area outside the counties that report as one", () => {
    // Areas without a district record are the two-tier counties' parents and places
    // with no state-funded school; a place listed here lost its schools section.
    const missing = Object.keys(siteAreas).filter((c) => !(district.areas[c]?.totalPupils > 0));
    expect(missing.length).toBeLessThan(Object.keys(siteAreas).length * 0.1);
    for (const code of ["E08000016", "E08000019"]) expect(district.areas[code]?.totalPupils).toBeGreaterThan(0);
  });

  it("would catch a district whose counts do not fit its pupils", () => {
    const planted = clone(district);
    planted.areas.E07000117.ealCount = planted.areas.E07000117.totalPupils;
    expect(districtOffenders(planted)).toEqual(["E07000117: EAL + English exceeds pupils"]);
  });
});

describe("the school display files together", () => {
  it("come from one release and agree on the national EAL count", () => {
    expect(releaseOffenders(utla, district, proxy)).toEqual([]);
  });

  it("would catch a district file left a year behind", () => {
    const planted = clone(district);
    planted.academicYear = "2024/25";
    for (const a of Object.values(planted.areas as Record<string, any>)) a.ealCount = Math.round(a.ealCount * 0.95);
    expect(releaseOffenders(utla, planted, proxy)).toHaveLength(2);
  });

  it("fertility proxy shares sum to 100 in every year", () => {
    for (const [code, a] of Object.entries(proxy.areas as Record<string, any>)) {
      for (const [year, t] of Object.entries(a.timeSeries as Record<string, Record<string, number>>)) {
        const sum = Object.entries(t).filter(([k]) => k !== "total").reduce((s, [, v]) => s + v, 0);
        expect(Math.abs(sum - 100), `${code} ${year}`).toBeLessThanOrEqual(0.6);
      }
    }
    expect([...proxy.years].sort()).toEqual(proxy.years);
  });
});
