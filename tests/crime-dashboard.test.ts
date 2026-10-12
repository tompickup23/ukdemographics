import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

/**
 * Shape and cross-source checks for crime-dashboard.json (ONS Police Force Area data
 * tables, built by scripts/transform/transform_crime.py).
 *
 * No published figure is pinned: a quarterly edition must pass without editing this
 * file. The checks are that the area counts, the unassigned rows and the withheld rows
 * add back to each force's total in Table C2 (and that total to Table P1), that every
 * rate is the count over the stated mid-year population, and that no rate exists where
 * the population does not.
 */

const read = (p: string) => JSON.parse(fs.readFileSync(path.resolve(p), "utf8"));
const crime = read("src/data/live/crime-dashboard.json");
const manifest = read("data/raw/manifests/ons_pfa_crime.json");
const population = read("src/data/live/population-estimates.json");
const siteCodes = Object.keys(read("src/data/live/ethnic-projections.json").areas);
const areas = Object.entries(crime.areas) as [string, any][];
const forces = Object.entries(crime.forces) as [string, any][];

const RATE_FIELDS = ["totalCrimeRate", "violentCrimeRate", "theftRate", "drugRate"];
const BASES = ["local_authority", "sum_of_csps", "sum_of_former_districts", "csp_shared", "csp_group"];

// Values are stored to two decimal places, so allow half a unit in the last place.
function expectNear(actual: number, expected: number, label: string) {
  expect(Math.abs(actual - expected), `${label}: ${actual} against ${expected}`).toBeLessThanOrEqual(0.005 + 1e-9);
}

function isoFromPageDate(text: string): string {
  const d = new Date(`${text} 12:00 UTC`);
  return d.toISOString().slice(0, 10);
}

describe("crime-dashboard.json shape", () => {
  it("covers every site area and nothing else", () => {
    expect(Object.keys(crime.areas).sort()).toEqual([...siteCodes].sort());
    expect(crime.counts.areas).toBe(siteCodes.length);
  });

  it("keeps the fields ukplaces and the place pages read", () => {
    expect(crime.lastUpdated).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(crime.period).toMatch(/^Year ending [A-Z][a-z]+ \d{4}$/);
    for (const [code, a] of areas) {
      expect(typeof a.areaName, code).toBe("string");
      expect(a.snapshotDate, code).toBe(crime.lastUpdated);
      expect(a.period.startsWith(`${crime.period}, ONS`), code).toBe(true);
      expect(a.period, `${code}: ukplaces needs a period without semicolons or brackets`).not.toMatch(/[;()]/);
      expect(a.totalCrimeRate === null || typeof a.totalCrimeRate === "number", code).toBe(true);
      expect(Array.isArray(a.breakdown), code).toBe(true);
      expect(BASES, code).toContain(a.basis);
      expect(a.asbRate, `${code}: ASB is not in these tables and must not be estimated`).toBeNull();
    }
  });

  it("names the file it was built from, by the manifest's hash and release date", () => {
    expect(crime.edition.fileSha256).toBe(manifest.current.fileSha256);
    expect(crime.edition.fileName).toBe(manifest.current.fileName);
    expect(crime.lastUpdated).toBe(isoFromPageDate(manifest.current.pageReleaseDate));
    expect(crime.edition.title.toLowerCase()).toContain(crime.period.toLowerCase());
  });

  it("labels every figure that is not the authority's own", () => {
    for (const [code, a] of areas) {
      if (a.basis === "local_authority") continue;
      expect(a.basisNote, code).toBeTruthy();
      if (a.basis === "csp_shared" || a.basis === "csp_group") {
        expect(a.period, code).toMatch(/(partnership|combined) figure for /);
        if (!a.suppressed) expect(a.rateDenominatorAreas.length, code).toBeGreaterThan(1);
      }
    }
  });

  it("withholds suppressed areas completely, with a reason", () => {
    for (const [code, a] of areas) {
      if (!a.suppressed) continue;
      expect(a.suppressionNote, code).toBeTruthy();
      for (const f of RATE_FIELDS) expect(a[f], `${code} ${f}`).toBeNull();
      expect(a.yearOnYearChange, code).toBeNull();
      expect(a.totalCrimeCount, code).toBeNull();
      expect(a.breakdown, code).toEqual([]);
    }
    // ONS publishes no rate for City of London.
    expect(crime.areas.E09000001.totalCrimeRate).toBeNull();
  });
});

describe("crime-dashboard.json cross-source", () => {
  it("adds area counts, withheld rows, unassigned rows and rows without an area back to each force total in Table C2", () => {
    // A shared or combined figure sits on several areas; count each set of CSPs once.
    const counted = new Map<string, number>();
    for (const [, a] of areas) {
      if (a.suppressed) continue;
      const key = `${a.policeForce.code}|${[...a.cspCodes].sort().join(",")}`;
      counted.set(key, a.totalCrimeCount);
    }
    const byForce = new Map<string, number>();
    for (const [key, n] of counted) {
      const force = key.split("|")[0];
      byForce.set(force, (byForce.get(force) ?? 0) + n);
    }
    for (const [code, f] of forces) {
      const withheld = f.suppressedCsps.reduce((s: number, c: any) => s + (c.count ?? 0), 0);
      const noArea = f.rowsWithoutArea.reduce((s: number, r: any) => s + (r.count ?? 0), 0);
      const areasSum = byForce.get(code) ?? 0;
      expect(areasSum + withheld + noArea + f.unassigned, `${code} ${f.name}`).toBe(f.totalRecordedCrime);
      expect(areasSum + withheld, `${code} assigned`).toBe(f.assignedToAreas);
    }
  });

  it("agrees with the force totals in Tables P1 and P4", () => {
    for (const [code, f] of forces) {
      expect(f.totalRecordedCrime, `${code} ${f.name} P1`).toBe(f.tableP1Total);
      expect(f.previousYear.totalRecordedCrime, `${code} ${f.name} P4`).toBe(f.previousYear.tableP4Total);
      const prevNoArea = f.previousYear.rowsWithoutArea.reduce((s: number, r: any) => s + (r.count ?? 0), 0);
      expect(f.previousYear.assignedToAreas + f.previousYear.unassigned + prevNoArea, `${code} previous year`).toBe(
        f.previousYear.totalRecordedCrime
      );
    }
  });

  it("reports each force's unassigned share from its own counts", () => {
    for (const [code, f] of forces) {
      expectNear(f.unassignedSharePct, (f.unassigned / f.totalRecordedCrime) * 100, code);
    }
    for (const [code, a] of areas) {
      expect(a.policeForce.unassignedSharePct, code).toBe(crime.forces[a.policeForce.code].unassignedSharePct);
    }
  });

  it("gives no rate where the population is missing, and every rate is count over population", () => {
    for (const [code, a] of areas) {
      if (a.rateDenominator == null) {
        for (const f of RATE_FIELDS) expect(a[f], `${code} ${f} without a population`).toBeNull();
        continue;
      }
      const expected = a.rateDenominatorAreas.reduce((s: number, c: string) => {
        const p = population.areas[c]?.population;
        expect(p, `${code}: no mid-year population for ${c}`).toBeGreaterThan(0);
        return s + p;
      }, 0);
      expect(a.rateDenominator, code).toBe(expected);
      expectNear(a.totalCrimeRate, (a.totalCrimeCount / a.rateDenominator) * 1000, code);
    }
  });

  it("derives the year on year change from the two years' counts", () => {
    for (const [code, a] of areas) {
      if (a.yearOnYearChange == null) {
        expect(a.yearOnYearNote, `${code} has no change and no reason`).toBeTruthy();
        continue;
      }
      expectNear(a.yearOnYearChange, ((a.totalCrimeCount - a.previousYearCount) / a.previousYearCount) * 100, code);
    }
  });
});
