import { describe, expect, it } from "vitest";
import { execFileSync } from "node:child_process";
import { mkdtempSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";

/**
 * validate_out_of_sample.mjs coverage options (V81_READINESS.md, blocker 3), on a
 * synthetic fixture so the test runs everywhere. The counts are made up; only
 * which areas are scored, and how, is checked.
 *
 *   E07000117  code unchanged: scored by default
 *   W06000015  Welsh: scored with --countries E,W
 *   E06000060  Buckinghamshire, four 2011 districts in both files: scored with --successors on
 *   E07000245  West Suffolk, one of its two districts missing from the 2001 file: a gap, not scored
 */
const ETH01 = Array.from({ length: 16 }, (_, i) => i + 1);
const ETH11 = [2, 3, 4, 5, 7, 8, 9, 10, 12, 13, 14, 15, 16, 18, 19, 20, 22, 23];

function rows(code, eths, bands, seed) {
  const out = [];
  let s = seed;
  for (const e of eths) for (const sex of [1, 2]) for (let b = 1; b <= bands; b++) {
    s = (s * 1103515245 + 12345) % 2147483648;
    out.push(`"${code}","x","${e}","x","${sex}","x","${b}","x",${(s % 50) + (e <= 2 ? 200 : 1)}`);
  }
  return out;
}

function fixture() {
  const dir = mkdtempSync(path.join(os.tmpdir(), "ukd-oos-"));
  const header = '"GEOGRAPHY_CODE","GEOGRAPHY_NAME","C_ETH","N","C_SEX","N","C_AGE","N","OBS_VALUE"';
  const in2001 = ["E07000117", "W06000015", "E07000004", "E07000005", "E07000006", "E07000007", "E07000201"];
  const in2011 = [...in2001, "E07000204"];
  writeFileSync(path.join(dir, "st101.csv"), [header, ...in2001.flatMap((c, i) => rows(c, ETH01, 22, i + 1))].join("\n"));
  writeFileSync(path.join(dir, "dc.csv"), [header, ...in2011.flatMap((c, i) => rows(c, ETH11, 21, i + 101))].join("\n"));
  const groups = { white_british: 80, white_other: 5, asian: 8, black: 3, mixed: 3, other: 1 };
  const areas = {};
  for (const c of ["E07000117", "W06000015", "E06000060", "E07000245"]) areas[c] = { areaName: c, current: { groups } };
  writeFileSync(path.join(dir, "site.json"), JSON.stringify({ areas }));
  // A 2021 base with two of the areas, for --actual.
  const base = { ethnicGroups: ["WBI", "PAK"], estimatedAreas: { W06000015: {} }, areas: {} };
  for (const c of ["E07000117", "W06000015"]) base.areas[c] = { WBI: { M: { total: 90 }, F: { total: 90 } }, PAK: { M: { total: 10 }, F: { total: 10 } } };
  writeFileSync(path.join(dir, "base.json"), JSON.stringify(base));
  return dir;
}

function run(dir, extra) {
  const f = (n) => path.join(dir, n);
  const out = execFileSync(
    process.execPath,
    ["scripts/model/validate_out_of_sample.mjs", "--json", "--st101", f("st101.csv"), "--dc2101ew", f("dc.csv"), "--site-input", f("site.json"), ...extra],
    { stdio: ["ignore", "pipe", "ignore"] },
  );
  return JSON.parse(out.toString());
}

describe("out-of-sample coverage options", () => {
  const dir = fixture();

  it("scores only English areas with unchanged codes by default, with no coverage block", () => {
    const r = run(dir, []);
    expect(r.areas.map((a) => a.code)).toEqual(["E07000117"]);
    expect(r.coverage).toBeUndefined();
  });

  it("adds Wales and the successors, summing 2011 districts on both sides", () => {
    const r = run(dir, ["--countries", "E,W", "--successors", "on"]);
    expect(r.areas.map((a) => a.code)).toEqual(["E06000060", "E07000117", "W06000015"]);
    expect(r.coverage.byCountry).toEqual({ E: 2, W: 1 });
    expect(r.coverage.successorsSummed).toEqual([{ code: "E06000060", districts2011: ["E07000004", "E07000005", "E07000006", "E07000007"] }]);
    expect(r.areas.find((a) => a.code === "E06000060").basis).toMatch(/summed 2011 districts/);
  });

  it("reports a successor whose districts are not all held, and does not score it", () => {
    const r = run(dir, ["--successors", "on"]);
    const gap = r.coverage.successorGaps.find((g) => g.code === "E07000245");
    expect(gap.reason).toContain("E07000204 (ST101)");
    expect(r.areas.map((a) => a.code)).not.toContain("E07000245");
  });

  it("scores against a 2021 base when given one, and lists its estimated areas", () => {
    const r = run(dir, ["--countries", "E,W", "--actual", path.join(dir, "base.json")]);
    expect(r.areas.map((a) => a.code)).toEqual(["E07000117", "W06000015"]);
    expect(r.areas[0].actual.white_british).toBe(90);
    expect(r.areas[0].actual.asian).toBe(10);
    expect(r.coverage.estimatedActual).toEqual(["W06000015"]);
  });

  it("rejects an unknown flag", () => {
    expect(() => run(dir, ["--successor", "on"])).toThrow();
  });
});
