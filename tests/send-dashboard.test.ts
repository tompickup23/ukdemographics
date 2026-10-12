import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

/**
 * Shape and cross-source checks for send-dashboard.json (DfE, Special educational needs
 * in England, via the statistics API).
 *
 * No published figure is pinned: next June's release must pass without editing this
 * file. Each check lives in `problems()` so the planted-error cases below show it fires.
 */

const read = (p: string) => JSON.parse(fs.readFileSync(path.resolve(p), "utf8"));
const send = read("src/data/live/send-dashboard.json");
const manifest = read("data/raw/manifests/dfe_sen.json");
const siteCodes = Object.keys(read("src/data/live/ethnic-projections.json").areas);
const districts = read("src/data/lookups/district-to-utla.json").districts as Record<string, any>;
const population = read("src/data/live/population-estimates.json").areas as Record<string, any>;

const DASHES = /[–—]| - |&mdash;|&ndash;/;

// ONS mid-2025 population aged 0 to 17 for each upper-tier area: unitaries as they are,
// counties as the sum of their districts.
const children: Record<string, number> = {};
for (const [code, a] of Object.entries(population)) {
  const key = code.startsWith("E07") ? districts[code]?.countyCode : code;
  if (key) children[key] = (children[key] ?? 0) + a.ageBands["0-17"];
}

function problems(d: any): string[] {
  const out: string[] = [];
  const say = (m: string) => out.push(m);
  const held = new Set(manifest.attempts.map((a: any) => a.blob_sha256));

  // Provenance.
  for (const [k, f] of Object.entries(d.files ?? {}) as [string, any][]) {
    if (!held.has(f.fileSha256)) say(`${k} file hash is not in the manifest`);
  }
  if (!d.files?.provision || !d.files?.need) say("files does not name both queries");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(d.lastUpdated ?? "")) say("lastUpdated is not an ISO date");
  if (!/^\d{4}\/\d{2}$/.test(d.edition ?? "")) say("edition is not an academic year");
  if (!String(d.source).includes(d.edition)) say("source does not name the edition");
  for (const key of ["source", "caveat", "methodology"]) if (DASHES.test(d[key] ?? "")) say(`${key} carries a dash`);
  if (/\.$/.test(d.source ?? "")) say("source ends with a full stop (the page adds one)");
  if (Number(d.edition?.slice(0, 4)) - Number(d.growthBasePeriod?.slice(0, 4)) !== 5) say("growth base is not five years back");
  if (Object.values(d.areas ?? {}).some((a: any) => a && "ehcpRatePer10k" in a)) say("per-10k rate on a whole-population denominator is back");

  // Coverage: every English upper-tier area a place page can ask for, nothing else.
  const want = new Set([
    ...siteCodes.filter((c) => /^E0[689]/.test(c)),
    ...Object.values(districts).map((x: any) => x.countyCode),
  ]);
  const got = new Set(Object.keys(d.areas ?? {}));
  for (const c of want) if (!got.has(c)) say(`${c} has no SEND profile`);
  for (const c of got) if (!want.has(c)) say(`${c} is not a site upper-tier area`);

  // National row equals the sum of local authorities, as DfE's tables do.
  const areas = Object.entries(d.areas ?? {}) as [string, any][];
  const sum = (k: string) => areas.reduce((s, [, a]) => s + (a[k] ?? 0), 0);
  if (sum("ehcpPupils") !== d.england?.ehcpPupils) say("local authorities do not sum to England");
  if (sum("pupilsOnRoll") !== d.england?.pupilsOnRoll) say("pupils on roll do not sum to England");

  for (const [code, a] of [["england", d.england], ...areas] as [string, any][]) {
    if (!a) { say(`${code} missing`); continue; }
    if (a.period !== `${d.edition} academic year`) say(`${code} period differs from the edition`);
    // DfE's percentage agrees with its own counts.
    const derived = (a.ehcpPupils / a.pupilsOnRoll) * 100;
    if (a.ehcpPctOfPupils == null || Math.abs(derived - a.ehcpPctOfPupils) > 0.06) say(`${code} percentage disagrees with its counts`);
    if (a.fiveYearGrowthPct != null) {
      const g = ((a.ehcpPupils - a.ehcpPupilsFiveYearsEarlier) / a.ehcpPupilsFiveYearsEarlier) * 100;
      if (Math.abs(g - a.fiveYearGrowthPct) > 0.06) say(`${code} growth disagrees with its counts`);
    }
    const needs = a.primaryNeeds ?? [];
    const total = needs.reduce((s: number, n: any) => s + n.pct, 0);
    if (total > 100.5) say(`${code} primary needs sum to ${total}`);
    for (let i = 1; i < needs.length; i++) if (needs[i].pct > needs[i - 1].pct) say(`${code} primary needs not in order`);
    if (a.primaryNeedBase != null && a.primaryNeedBase > a.ehcpPupils) say(`${code} need base exceeds all-school EHC plans`);
    if (DASHES.test(needs.map((n: any) => n.need).join(" "))) say(`${code} need label carries a dash`);
  }

  // Cross-source: pupils on roll against ONS mid-2025 children aged 0 to 17. Schools
  // enrol across boundaries, so the band is wide; a swapped column falls far outside it.
  for (const [code, a] of areas) {
    const kids = children[code];
    if (!kids || kids < 5000) continue;
    const ratio = a.pupilsOnRoll / kids;
    if (ratio < 0.5 || ratio > 1.2) say(`${code} pupils on roll are ${ratio.toFixed(2)}x ONS children`);
  }
  return out;
}

const clone = () => JSON.parse(JSON.stringify(send));
const first = (d: any) => d.areas[Object.keys(d.areas)[0]];

describe("send-dashboard.json", () => {
  it("passes every shape and cross-source check", () => {
    expect(problems(send)).toEqual([]);
  });

  describe("each check fires on a planted error", () => {
    const cases: [string, (d: any) => void, RegExp][] = [
      ["hospital-school rows counted twice", (d) => { for (const a of Object.values(d.areas) as any[]) a.ehcpPupils *= 2; }, /percentage disagrees|do not sum/],
      ["county missing", (d) => { delete d.areas.E10000017; }, /E10000017 has no SEND profile/],
      ["unknown code", (d) => { d.areas.E99999999 = first(d); }, /not a site upper-tier/],
      ["old rate field", (d) => { first(d).ehcpRatePer10k = 100; }, /per-10k/],
      ["typed date", (d) => { d.lastUpdated = "2026-04-28x"; }, /lastUpdated/],
      ["dash in caveat", (d) => { d.caveat = `${d.caveat} — x`; }, /caveat carries a dash/],
      ["unfetched file", (d) => { d.files.need.fileSha256 = "0".repeat(64); }, /need file hash/],
      ["pupils swapped with plans", (d) => { const a = first(d); [a.pupilsOnRoll, a.ehcpPupils] = [a.ehcpPupils, a.pupilsOnRoll]; }, /ONS children|percentage disagrees/],
      ["growth typed", (d) => { first(d).fiveYearGrowthPct = 1; }, /growth disagrees/],
      ["needs out of order", (d) => { first(d).primaryNeeds.reverse(); }, /not in order/],
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
