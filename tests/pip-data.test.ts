/**
 * PIP on place pages. Until October 2026 the page divided one constituency's
 * claimants by a whole local authority's Census population, and compared it with
 * a total including Scotland, "Abroad" and "Unknown" over a typed 60,000,000.
 * Nothing here pins a release figure: each check recomputes from the files.
 */
import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import rawPip from "../src/data/live/pip-pcon.json";
import rawPopulation from "../src/data/live/population-estimates.json";
import rawPcon from "../src/data/live/pcon-dataset.json";
import rawProjections from "../src/data/live/ethnic-projections.json";
import {
  describePostcodeShare,
  ENGLAND_AND_WALES,
  isEnglandOrWalesPcon,
  pipConstituenciesForArea,
  pipEnglandAndWalesRate,
  pipMonthLabel,
} from "../src/lib/pip-data";

const pip = rawPip as any;
const population = rawPopulation as any;
const pcons = Object.values((rawPcon as any).pcons) as any[];
const areas = (rawProjections as any).areas as Record<string, any>;
const codeByName = new Map(Object.entries(areas).map(([c, a]) => [a.areaName as string, c]));
const shownOn = Object.keys(pip.laToPconBestMatch).map((name) => codeByName.get(name)!);

describe("England and Wales PIP rate", () => {
  const rate = pipEnglandAndWalesRate()!;

  it("counts only English and Welsh constituencies", () => {
    const rows = Object.values(pip.byPconCode) as any[];
    const ew = rows.filter((r) => /^(E14|W07)/.test(r.code));
    expect(rate.constituencies).toBe(ew.length);
    expect(rate.claimants).toBe(ew.reduce((s, r) => s + r.claimants, 0));
    // The rest are Scotland, "Abroad" and "Unknown", and the file's total includes them.
    const rest = rows.filter((r) => !isEnglandOrWalesPcon(r.code));
    expect(rest.length).toBeGreaterThan(0);
    expect(rate.claimants + rest.reduce((s, r) => s + r.claimants, 0)).toBe(pip.totalClaimants);
    expect(rate.claimants).toBeLessThan(pip.totalClaimants);
  });

  it("covers every English and Welsh constituency in the constituency dataset", () => {
    // The constituency dataset misses Ynys Mon (an unmatched name), so it can hold
    // fewer than the PIP file, never more.
    const ewPcons = pcons.filter((p) => p.country === "England" || p.country === "Wales");
    for (const p of ewPcons) expect(isEnglandOrWalesPcon(p.code) && pip.byPconCode[p.code] != null, p.name).toBe(true);
    expect(rate.constituencies).toBeGreaterThanOrEqual(ewPcons.length);
  });

  it("divides by the ONS mid-year estimate for England and Wales held in the repo", () => {
    expect(rate.population).toBe(population.countries[ENGLAND_AND_WALES].population);
    expect(rate.populationYear).toBe(population.latestYear);
    expect(rate.per100).toBeCloseTo((rate.claimants / rate.population) * 100, 10);
    // England plus Wales, as a cross-check on the denominator's geography.
    const e = population.countries.E92000001.population;
    const w = population.countries.W92000004.population;
    expect(rate.population).toBe(e + w);
  });
});

describe("PIP section on place pages", () => {
  it("is shown on the same authorities as before", () => {
    expect(shownOn.every(Boolean)).toBe(true);
    for (const code of shownOn) expect(pipConstituenciesForArea(code).length, code).toBeGreaterThan(0);
  });

  it("lists every overlapping constituency with its own count and its share in the authority", () => {
    for (const code of shownOn) {
      const listed = pipConstituenciesForArea(code);
      const expected = pcons.filter((p) => p.constituentLas.some((l: any) => l.ladCode === code) && pip.byPconCode[p.code]);
      expect(listed.map((p) => p.code).sort(), code).toEqual(expected.map((p) => p.code).sort());
      for (const p of listed) {
        expect(p.claimants, p.name).toBe(pip.byPconCode[p.code].claimants);
        expect(p.shareInArea).toBeGreaterThan(0);
        expect(p.shareInArea).toBeLessThanOrEqual(1);
      }
      const names = listed.map((p) => p.name);
      expect(names).toEqual([...names].sort((a, b) => a.localeCompare(b)));
    }
  });

  it("includes the constituency the page used to show alone", () => {
    for (const [name, match] of Object.entries(pip.laToPconBestMatch) as [string, any][]) {
      const listed = pipConstituenciesForArea(codeByName.get(name)!).map((p) => p.code);
      expect(listed, name).toContain(match.code);
    }
  });

  it("computes no local rate and types no denominator", () => {
    const page = fs.readFileSync(path.resolve("src/pages/places/[slug].astro"), "utf8");
    const pipBlock = page.slice(page.indexOf("<!-- Personal Independence Payment (PIP) -->"), page.indexOf("<!-- NHS overseas"));
    expect(pipBlock.length).toBeGreaterThan(0);
    expect(page).not.toMatch(/60_000_000|60000000/);
    expect(page).not.toMatch(/pipMatch\.claimants\s*\//);
    expect(pipBlock).not.toMatch(/% of population/);
  });

  it("describes postcode shares without rounding to all or none", () => {
    expect(describePostcodeShare(1)).toBe("all of its postcodes");
    expect(describePostcodeShare(0.8641)).toBe("86% of its postcodes");
    expect(describePostcodeShare(0.996)).toBe("over 99% of its postcodes");
    expect(describePostcodeShare(0.004)).toBe("under 1% of its postcodes");
  });

  it("reads the month label from the file", () => {
    expect(pipMonthLabel("Jan-26")).toBe("January 2026");
    expect(pipMonthLabel("2026-01")).toBeNull();
    expect(pipMonthLabel()).toMatch(/^[A-Z][a-z]+ 20\d\d$/);
  });
});
