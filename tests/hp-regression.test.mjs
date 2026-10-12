import { describe, expect, it } from "vitest";
import { execFileSync } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";

/**
 * The forward model's run options must not change the published numbers.
 *
 * With every option at its default, a run written to a scratch file has to
 * reproduce, value for value, every field run_hp_single_year.mjs writes into
 * src/data/live/ethnic-projections.json for the areas it models. This needs the
 * gitignored inputs (node scripts/model/link_inputs.mjs --model v8.0), so it is
 * skipped where they are absent, which includes CI.
 */
const INPUTS = [
  "data/model/base_single_year_2021.json",
  "data/raw/census_2011_ethnicity_age/dc2101ew_ethnicity_sex_age_la.csv",
  "data/raw/newethpop/extracted/2DataArchive/OutputData/Population/Population2011_LEEDS2.csv",
  "data/raw/snpp/2022 SNPP Population persons.csv",
];
const haveInputs = INPUTS.every((p) => existsSync(p));

const FIELDS = [
  ["current", "groups"],
  ["current", "groups_detail"],
  ["current", "groups_absolute_detail"],
  ["projections"],
  ["projections_detail"],
  ["thresholds"],
  ["headlineStat"],
];
const get = (o, keys) => keys.reduce((x, k) => (x == null ? undefined : x[k]), o);

function run(extraArgs) {
  const dir = mkdtempSync(path.join(os.tmpdir(), "ukd-hp-"));
  const out = path.join(dir, "out.json");
  // Run with none of the model's own environment variables set, so a shell that
  // has one exported cannot make the default run differ.
  const env = Object.fromEntries(
    Object.entries(process.env).filter(([k]) => !/^(HP_|CCR_|BREXIT_DAMP$)/.test(k)),
  );
  execFileSync(process.execPath, ["scripts/model/run_hp_single_year.mjs", "--output", out, ...extraArgs], {
    stdio: "ignore",
    env,
  });
  return JSON.parse(readFileSync(out, "utf8"));
}

function differences(published, candidate) {
  const modelled = Object.keys(published.areas).filter((c) => published.areas[c].projections_detail);
  const diffs = [];
  for (const code of modelled) {
    for (const f of FIELDS) {
      const a = JSON.stringify(get(published.areas[code], f));
      const b = JSON.stringify(get(candidate.areas[code], f));
      if (a !== b) diffs.push(`${code} ${f.join(".")}`);
    }
  }
  return { modelled: modelled.length, diffs };
}

describe.skipIf(!haveInputs)("forward model regression against the published v8.0 run", () => {
  const published = JSON.parse(readFileSync("src/data/live/ethnic-projections.json", "utf8"));

  it("reproduces every modelled area exactly with default options", () => {
    const candidate = run([]);
    const { modelled, diffs } = differences(published, candidate);
    expect(modelled).toBeGreaterThan(250);
    expect(diffs).toEqual([]);
    expect(candidate.modelVersion).toBe(published.modelVersion);
  }, 120_000);

  it("detects a changed setting (the comparison can fail)", () => {
    const candidate = run(["--brexit-damp", "off"]);
    expect(differences(published, candidate).diffs.length).toBeGreaterThan(0);
  }, 120_000);
});
