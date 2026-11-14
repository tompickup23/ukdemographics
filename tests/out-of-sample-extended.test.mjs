import { describe, expect, it } from "vitest";
import { execFileSync, spawnSync } from "node:child_process";
import { mkdtempSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";

/**
 * validate_out_of_sample.mjs extended measures (register row R657): cap modes,
 * count errors, the split by authority type, the index of dissimilarity and band
 * calibration. Synthetic fixture, so the test runs everywhere; the counts are made
 * up and only the arithmetic is checked.
 *
 *   E07000117  a shire district, scored by default
 *   W06000015  a Welsh authority, scored with --countries E,W
 */
const ETH01 = Array.from({ length: 16 }, (_, i) => i + 1);
const ETH11 = [2, 3, 4, 5, 7, 8, 9, 10, 12, 13, 14, 15, 16, 18, 19, 20, 22, 23];
const CODES = ["E07000117", "W06000015"];

function rows(code, eths, bands, seed) {
  const out = [];
  let s = seed;
  for (const e of eths) for (const sex of [1, 2]) for (let b = 1; b <= bands; b++) {
    s = (s * 1103515245 + 12345) % 2147483648;
    out.push(`"${code}","x","${e}","x","${sex}","x","${b}","x",${(s % 50) + (e <= 2 ? 200 : 1)}`);
  }
  return out;
}

// A 2021 base by sex and single year of age: WBI 30 a year of age, PAK 3 in one
// area and 6 in the other, so the age-sex cap has a full control in every cell.
function base() {
  const areas = {};
  CODES.forEach((code, i) => {
    const byAge = (n) => {
      const o = { total: n * 91 };
      for (let a = 0; a <= 90; a++) o[a] = n;
      return o;
    };
    areas[code] = { WBI: { M: byAge(30), F: byAge(30) }, PAK: { M: byAge(3 * (i + 1)), F: byAge(3 * (i + 1)) } };
  });
  return { ethnicGroups: ["WBI", "PAK"], estimatedAreas: {}, areas };
}

function fixture() {
  const dir = mkdtempSync(path.join(os.tmpdir(), "ukd-oos-ext-"));
  const header = '"GEOGRAPHY_CODE","GEOGRAPHY_NAME","C_ETH","N","C_SEX","N","C_AGE","N","OBS_VALUE"';
  writeFileSync(path.join(dir, "st101.csv"), [header, ...CODES.flatMap((c, i) => rows(c, ETH01, 22, i + 1))].join("\n"));
  writeFileSync(path.join(dir, "dc.csv"), [header, ...CODES.flatMap((c, i) => rows(c, ETH11, 21, i + 101))].join("\n"));
  const groups = { white_british: 80, white_other: 5, asian: 8, black: 3, mixed: 3, other: 1 };
  writeFileSync(path.join(dir, "site.json"), JSON.stringify({ areas: Object.fromEntries(CODES.map((c) => [c, { areaName: c, current: { groups } }])) }));
  writeFileSync(path.join(dir, "base.json"), JSON.stringify(base()));
  return dir;
}

const dir = fixture();
const f = (n) => path.join(dir, n);
const ARGS = ["scripts/model/validate_out_of_sample.mjs", "--json", "--st101", f("st101.csv"), "--dc2101ew", f("dc.csv"), "--site-input", f("site.json")];
const WITH_BASE = ["--countries", "E,W", "--actual", f("base.json")];

function run(extra) {
  const out = execFileSync(process.execPath, [...ARGS, ...extra], { stdio: ["ignore", "pipe", "ignore"] });
  return JSON.parse(out.toString());
}

describe("out-of-sample extended measures", { timeout: 60_000 }, () => {
  it("adds nothing without an extended flag", () => {
    const r = run(WITH_BASE);
    expect(r.extended).toBeUndefined();
    expect(r.areas[0].type).toBeUndefined();
    expect(r.areas[0].predictedCount).toBeUndefined();
  });

  it("refuses a cap without a base file to cap to", () => {
    const res = spawnSync(process.execPath, [...ARGS, "--cap-mode", "age-sex"], { encoding: "utf8" });
    expect(res.status).toBe(2);
    expect(res.stderr).toMatch(/--cap-mode needs --actual/);
  });

  it("rejects an unknown cap mode", () => {
    const res = spawnSync(process.execPath, [...ARGS, ...WITH_BASE, "--cap-mode", "sex"], { encoding: "utf8" });
    expect(res.status).toBe(2);
  });

  it("splits by authority type and scores counts against the base", () => {
    const r = run([...WITH_BASE, "--extended"]);
    expect(r.areas.map((a) => a.type)).toEqual(["Shire district", "Welsh authority"]);
    expect(Object.keys(r.extended.byType)).toEqual(["Shire district", "Welsh authority"]);
    expect(r.extended.byType["Shire district"].n).toBe(1);
    expect(r.extended.counts.total.n).toBe(2);
    // The ratios are fitted on made-up counts, so the uncapped total is off.
    expect(r.extended.counts.total.medianAPE).toBeGreaterThan(0);
  });

  it("works out the actual index of dissimilarity by hand", () => {
    const r = run([...WITH_BASE, "--extended"]);
    // Asian (PAK) 546 and 1,092 against everyone else 5,460 in each area:
    // D = 0.5 * (|546/1638 - 0.5| + |1092/1638 - 0.5|) * 100 = 16.67.
    expect(r.extended.dissimilarity.asian.actual).toBeCloseTo(16.67, 2);
    expect(r.extended.dissimilarity.white_british.actual).toBeCloseTo(16.67, 2);
  });

  it("total cap: totals match the base and shares are the uncapped ones", () => {
    const none = run([...WITH_BASE, "--extended"]);
    const total = run([...WITH_BASE, "--cap-mode", "total"]);
    expect(total.extended.capCounts).toEqual({ capped: 2, emptyCells: 0 });
    for (const [i, a] of total.areas.entries()) {
      expect(a.predicted).toEqual(none.areas[i].predicted);
      expect(a.predictedTotal).toBe(i === 0 ? 6006 : 6552);
    }
    expect(total.extended.counts.total.medianAPE).toBe(0);
  });

  it("age-sex cap: every sex and age cell sums to the base, so totals match too", () => {
    const r = run([...WITH_BASE, "--cap-mode", "age-sex"]);
    expect(r.extended.capCounts.emptyCells).toBe(0);
    expect(r.areas.map((a) => a.predictedTotal)).toEqual([6006, 6552]);
    expect(r.design).toMatch(/perfect control/);
  });

  it("band calibration is repeatable with a seed and reports shares inside the bands", () => {
    const a = run([...WITH_BASE, "--simulations", "20", "--seed", "7"]);
    const b = run([...WITH_BASE, "--simulations", "20", "--seed", "7"]);
    expect(a.extended.calibration).toEqual(b.extended.calibration);
    const c = a.extended.calibration.all;
    expect(c.n).toBe(2);
    for (const v of [c.inside80, c.inside95]) expect(v === 0 || v === 50 || v === 100).toBe(true);
    expect(c.medianWidth95).toBeGreaterThanOrEqual(c.medianWidth80);
  });
});
