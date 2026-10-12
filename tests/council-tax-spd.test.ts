import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

/**
 * Shape and cross-source checks for council-tax-spd.json (MHCLG Council Taxbase, local
 * authority level data).
 *
 * No published figure is pinned: next November's release must pass without editing this
 * file. Each check lives in `problems()` so the planted-error cases below show it fires.
 */

const read = (p: string) => JSON.parse(fs.readFileSync(path.resolve(p), "utf8"));
const ctb = read("src/data/live/council-tax-spd.json");
const manifest = read("data/raw/manifests/council_taxbase.json");
const site = read("src/data/live/ethnic-projections.json").areas as Record<string, any>;
const population = read("src/data/live/population-estimates.json").areas as Record<string, any>;

const DASHES = /[–—]| - |&mdash;|&ndash;/;
const COUNTS = ["totalDwellings", "chargeableDwellings", "singlePersonDiscount25", "disregarded25", "disregardedAll50"];

function problems(d: any): string[] {
  const out: string[] = [];
  const say = (m: string) => out.push(m);

  // Provenance and dates, read from the workbook.
  if (d.fileSha256 !== manifest.current.fileSha256) say("fileSha256 is not the manifest's current file");
  if (d.sourceUrl !== manifest.current.sourceUrl) say("sourceUrl is not the manifest's current URL");
  for (const k of ["lastUpdated", "firstPublished", "snapshotDate"]) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(d[k] ?? "")) say(`${k} is not an ISO date`);
  }
  if (d.firstPublished > d.lastUpdated) say("first published after last updated");
  if (Number(d.snapshotDate?.slice(0, 4)) !== d.edition) say("snapshot year is not the edition");
  for (const k of ["source", "sourceShort"]) {
    if (!String(d[k]).includes(String(d.edition))) say(`${k} does not name the edition`);
  }
  for (const k of ["source", "sourceShort", "caveat"]) if (DASHES.test(d[k] ?? "")) say(`${k} carries a dash`);

  // Coverage: every English site area, under the site's codes.
  const english = Object.keys(site).filter((c) => c.startsWith("E"));
  const got = new Set(Object.keys(d.areas ?? {}));
  for (const c of english) if (!got.has(c)) say(`${c} missing`);
  for (const c of got) if (!site[c]) say(`${c} is not a site area`);
  if (d.totalLAs !== got.size) say("totalLAs does not match the area count");

  // Local authorities sum to the England row in the same table.
  const areas = Object.entries(d.areas ?? {}) as [string, any][];
  for (const k of COUNTS) {
    const sum = areas.reduce((s, [, a]) => s + (a[k] ?? 0), 0);
    if (sum !== d.england?.[k]) say(`${k} does not sum to England`);
  }

  for (const [code, a] of areas) {
    if (!(a.chargeableDwellings <= a.totalDwellings)) say(`${code} chargeable exceeds total dwellings`);
    if (!(a.singlePersonDiscount25 <= a.chargeableDwellings)) say(`${code} discounts exceed chargeable dwellings`);
    const share = Math.round((a.singlePersonDiscount25 / a.chargeableDwellings) * 1000) / 10;
    if (share !== a.singlePersonDiscountPctOfChargeable) say(`${code} share disagrees with its counts`);
    if (site[code] && a.areaName !== site[code].areaName) say(`${code} is ${a.areaName} here but ${site[code].areaName} on the site`);
    // Cross-source: ONS mid-2025 residents per dwelling. A shifted column (a table's
    // Band H instead of its Total, say) lands far outside this band.
    const pop = population[code]?.population;
    if (pop) {
      const perDwelling = pop / a.totalDwellings;
      if (perDwelling < 1.3 || perDwelling > 3.5) say(`${code} has ${perDwelling.toFixed(2)} residents per dwelling`);
    }
  }
  return out;
}

const clone = () => JSON.parse(JSON.stringify(ctb));
const first = (d: any) => d.areas[Object.keys(d.areas)[0]];

describe("council-tax-spd.json", () => {
  it("passes every shape and cross-source check", () => {
    expect(problems(ctb)).toEqual([]);
  });

  it("keeps the fields the place pages and /compare/ read", () => {
    expect(typeof ctb.sourceShort).toBe("string");
    for (const a of Object.values(ctb.areas) as any[]) {
      expect(typeof a.singlePersonDiscountPctOfChargeable).toBe("number");
      expect(typeof a.singlePersonDiscount25).toBe("number");
    }
  });

  describe("each check fires on a planted error", () => {
    const cases: [string, (d: any) => void, RegExp][] = [
      ["column shifted to a band", (d) => { for (const a of Object.values(d.areas) as any[]) a.totalDwellings = Math.round(a.totalDwellings / 30); }, /residents per dwelling|chargeable exceeds/],
      ["new Barnsley code leaks through", (d) => { d.areas.E08000038 = d.areas.E08000016; delete d.areas.E08000016; }, /E08000016 missing|E08000038 is not a site area/],
      ["typed date", (d) => { d.lastUpdated = "29 April 2026"; }, /lastUpdated/],
      ["stale edition in the short source", (d) => { d.sourceShort = "MHCLG Council Taxbase 2024 (CTB1, snapshot 7 October 2024)"; d.edition = 2025; }, /sourceShort does not name/],
      ["file not fetched", (d) => { d.fileSha256 = "0".repeat(64); }, /fileSha256/],
      ["typed share", (d) => { first(d).singlePersonDiscountPctOfChargeable = 99; }, /share disagrees/],
      ["area dropped", (d) => { delete d.areas.E07000117; d.totalLAs -= 1; }, /E07000117 missing|does not sum/],
      ["dash in caveat", (d) => { d.caveat = `${d.caveat} — x`; }, /caveat carries a dash/],
    ];
    for (const [name, plant, expected] of cases) {
      it(name, () => {
        const d = clone();
        plant(d);
        expect(problems(d).join("\n")).toMatch(expected);
      });
    }
  });
});
