import { describe, expect, it } from "vitest";
import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";

/**
 * validate_schools.mjs --base (V81_READINESS.md, blocker 4), on a synthetic
 * fixture. The age-specific comparison needs the area in the 2021 base, so a
 * base that holds an area the default base lacks gives that area a comparison.
 * The counts are made up.
 */
const ETHNICITIES = ["White - White British", "Asian - Pakistani", "Black - Black African"];

function fixture() {
  const dir = mkdtempSync(path.join(os.tmpdir(), "ukd-schools-"));
  const dfe = ["time_period,a,geographic_level,b,c,d,e,f,g,new_la_code,phase_type_grouping,ethnicity,language,headcount"];
  for (const code of ["E06000008", "E06000063"]) {
    for (const [i, eth] of ETHNICITIES.entries()) {
      dfe.push(`202425,x,Local authority,x,x,x,x,x,x,${code},Total,${eth},Total,${[800, 300, 100][i]}`);
    }
  }
  writeFileSync(path.join(dir, "dfe.csv"), dfe.join("\n"));
  const groups = { white_british: 70, white_other: 5, asian: 18, black: 4, mixed: 2, other: 1 };
  const projections = { areas: {} };
  for (const code of ["E06000008", "E06000063"]) projections.areas[code] = { areaName: code, current: { groups, total_population: 100000 } };
  writeFileSync(path.join(dir, "site.json"), JSON.stringify(projections));
  const area = () => {
    const out = {};
    for (const [eth, n] of [["WBI", 30], ["PAK", 12], ["BAF", 4]]) {
      out[eth] = {};
      for (const sex of ["M", "F"]) {
        out[eth][sex] = {};
        for (let a = 0; a <= 90; a++) out[eth][sex][a] = n;
        out[eth][sex].total = n * 91;
      }
    }
    return out;
  };
  const base = (codes, extra = {}) => ({ ethnicGroups: ["WBI", "PAK", "BAF"], areaCount: codes.length, areas: Object.fromEntries(codes.map((c) => [c, area()])), ...extra });
  writeFileSync(path.join(dir, "base-v80.json"), JSON.stringify(base(["E06000008"])));
  writeFileSync(path.join(dir, "base-v81.json"), JSON.stringify(base(["E06000008", "E06000063"], { source: "fixture", estimatedAreas: { E06000063: {} } })));
  return dir;
}

function run(dir, baseFile, out) {
  execFileSync(
    process.execPath,
    ["scripts/model/validate_schools.mjs", "--dfe", path.join(dir, "dfe.csv"), "--projections", path.join(dir, "site.json"), "--base", path.join(dir, baseFile), "--output", path.join(dir, out)],
    { stdio: "ignore" },
  );
  return JSON.parse(readFileSync(path.join(dir, out), "utf8"));
}

const hasChildComparison = (r) => Object.values(r.comparison ?? {}).some((c) => c?.censusChildPct != null);

describe("validate_schools.mjs --base", () => {
  const dir = fixture();

  it("compares an area against Census 2021 children only when the base holds it", () => {
    const narrow = run(dir, "base-v80.json", "narrow.json");
    const wide = run(dir, "base-v81.json", "wide.json");
    const pick = (o, code) => o.areas.find((r) => r.areaCode === code);
    expect(hasChildComparison(pick(narrow, "E06000008"))).toBe(true);
    expect(hasChildComparison(pick(narrow, "E06000063"))).toBe(false);
    expect(hasChildComparison(pick(wide, "E06000063"))).toBe(true);
    expect(wide.base.estimatedAreas).toEqual(["E06000063"]);
  });

  it("stops on a named base that does not exist, and on an unknown flag", () => {
    expect(() => run(dir, "missing.json", "x.json")).toThrow();
    expect(() => execFileSync(process.execPath, ["scripts/model/validate_schools.mjs", "--bsae", "x"], { stdio: "ignore" })).toThrow();
  });
});
