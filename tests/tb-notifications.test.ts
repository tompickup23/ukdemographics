import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

/**
 * Shape and cross-source checks for tb-notifications.json (UKHSA TB surveillance).
 *
 * No published figure is pinned: next year's release must pass without editing this
 * file. Each check lives in `problems()` so the planted-error cases below can show it
 * fires; a check that cannot fail is not a check.
 */

const read = (p: string) => JSON.parse(fs.readFileSync(path.resolve(p), "utf8"));
const tb = read("src/data/live/tb-notifications.json");
const manifest = read("data/raw/manifests/ukhsa_tb.json");
const site = read("src/data/live/ethnic-projections.json").areas as Record<string, any>;
const population = read("src/data/live/population-estimates.json").areas as Record<string, any>;

const DASHES = /[–—]| - |&mdash;|&ndash;/;

function problems(d: any): string[] {
  const out: string[] = [];
  const say = (m: string) => out.push(m);

  // Provenance: the file read, by hash, and dates read from it.
  if (d.fileSha256 !== manifest.current.fileSha256) say("fileSha256 is not the manifest's current file");
  if (d.sourceUrl !== manifest.current.sourceUrl) say("sourceUrl is not the manifest's current URL");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(d.lastUpdated ?? "")) say("lastUpdated is not an ISO date");
  if (!String(d.source).includes(d.laPeriod?.label)) say("source does not name the local period");
  for (const key of ["source", "caveat", "measure"]) if (DASHES.test(d[key] ?? "")) say(`${key} carries a dash`);
  if (!["provisional", "final"].includes(d.releaseStatus?.status)) say("releaseStatus is not provisional or final");
  if (!d.releaseStatus?.quote || !d.releaseStatus?.url) say("releaseStatus has no quote or citation");

  // No field may carry a year in its name: the year belongs in the data, so a refresh
  // cannot leave a stale "2024" label behind (as totalChange2024Pct did).
  const yearKeys = Object.keys(d).filter((k) => /(19|20)\d{2}/.test(k));
  if (yearKeys.length) say(`year in a field name: ${yearKeys.join(", ")}`);

  // England: the change and its label follow from the series.
  const e = d.england ?? {};
  const s = e.series ?? [];
  const last = s[s.length - 1];
  const prev = s[s.length - 2];
  if (!last || !prev) say("england series has fewer than two years");
  else {
    if (last.year !== e.latestYear || last.notifications !== e.notifications) say("england latest year is not the series' last");
    if (prev.year !== e.previousYear || prev.notifications !== e.previousNotifications) say("england previous year is not the series' second last");
    const pct = Math.round(((last.notifications - prev.notifications) / prev.notifications) * 1000) / 10;
    if (pct !== e.notificationsChangePct) say(`england change ${e.notificationsChangePct} is not ${pct} from the series`);
    if (e.changeLabel !== `${prev.year} to ${last.year}`) say("england changeLabel does not match the years");
    if (e.latestYear !== d.laPeriod?.lastYear) say("england latest year is not the end of the local period");
    for (let i = 1; i < s.length; i++) if (s[i].year !== s[i - 1].year + 1) say(`england series skips after ${s[i - 1].year}`);
  }
  if (d.laPeriod?.lastYear - d.laPeriod?.firstYear !== 2) say("local period is not three years");

  // Areas: site codes only, English, internally consistent, and the rate's implied
  // population agrees with ONS mid-2025 within 10% where the count is not tiny. That
  // last check is what catches a swapped or shifted column.
  const areas = Object.entries(d.areas ?? {}) as [string, any][];
  if (areas.length < 250) say(`only ${areas.length} areas`);
  for (const [code, a] of areas) {
    if (!site[code]) { say(`${code} is not a site area`); continue; }
    if (!code.startsWith("E")) say(`${code} is not English`);
    if (a.areaName !== site[code].areaName) say(`${code} name ${a.areaName} differs from the site's`);
    if (!(a.ratePer100k >= 0) || !Number.isFinite(a.ratePer100k)) say(`${code} has no rate`);
    if (!(a.lowerCI <= a.ratePer100k && a.ratePer100k <= a.upperCI)) say(`${code} rate outside its CI`);
    if (a.period !== d.laPeriod?.label) say(`${code} period differs from the file's`);
    if (a.notifications3yrAvg >= 5 && a.ratePer100k > 0 && population[code]) {
      const implied = (a.notifications3yrAvg / a.ratePer100k) * 1e5;
      const ratio = implied / population[code].population;
      if (ratio < 0.9 || ratio > 1.1) say(`${code} implied population is ${ratio.toFixed(2)}x ONS mid-2025`);
    }
  }
  return out;
}

const clone = () => JSON.parse(JSON.stringify(tb));

describe("tb-notifications.json", () => {
  it("passes every shape and cross-source check", () => {
    expect(problems(tb)).toEqual([]);
  });

  it("keeps the field /compare/ reads", () => {
    for (const a of Object.values(tb.areas) as any[]) expect(typeof a.ratePer100k).toBe("number");
  });

  describe("each check fires on a planted error", () => {
    const cases: [string, (d: any) => void, RegExp][] = [
      ["stale year field", (d) => { d.totalChange2024Pct = 13; }, /year in a field name/],
      ["typed change", (d) => { d.england.notificationsChangePct = 13; }, /england change/],
      ["wrong change label", (d) => { d.england.changeLabel = "2023 to 2024"; }, /changeLabel/],
      ["file hash not fetched", (d) => { d.fileSha256 = "0".repeat(64); }, /fileSha256/],
      ["typed date", (d) => { d.lastUpdated = "28 April 2026"; }, /lastUpdated/],
      ["dash in source", (d) => { d.source = `UKHSA — ${d.source}`; }, /source carries a dash/],
      ["unknown code", (d) => { d.areas.E99999999 = { ...d.areas[Object.keys(d.areas)[0]] }; }, /not a site area/],
      ["rate and count swapped", (d) => {
        for (const a of Object.values(d.areas) as any[]) [a.ratePer100k, a.notifications3yrAvg] = [a.notifications3yrAvg, a.ratePer100k];
      }, /implied population|outside its CI/],
      ["rate outside CI", (d) => { const a: any = Object.values(d.areas)[0]; a.ratePer100k = a.upperCI + 5; }, /outside its CI/],
      ["status missing", (d) => { delete d.releaseStatus; }, /releaseStatus/],
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
