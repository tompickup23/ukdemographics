import { describe, expect, it } from "vitest";
import { execFileSync } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";

/**
 * The zero-noise check (V81_READINESS.md, blocker 2).
 *
 * One stochastic simulation with the noise off must reproduce the deterministic
 * run exactly, for every area, year and ethnic group, under the same options.
 * If it does not, the bands describe a different model from the projection they
 * are drawn around, which is the defect fixed in August 2026.
 *
 * The first block runs both scripts on a small synthetic fixture (five areas,
 * written to a temporary directory), so it runs everywhere, CI included. The
 * fixture's numbers are made up and mean nothing; only the agreement matters.
 * The second block repeats the check on the held v8.0 inputs and is skipped
 * where they are absent.
 */
const GROUPS = ["WBI", "WIR", "WGT", "WRO", "WHO", "MWA", "MWF", "MWC", "MOM", "IND", "PAK", "BAN", "CHI", "OAS", "BAF", "BCA", "OBL", "ARB", "OOT"];
const AGES = Array.from({ length: 91 }, (_, i) => i);
const YEARS = [2031, 2041, 2051, 2061];
// DC2101EW ethnic codes for every group but Roma, which 2011 did not separate.
const DC_ETH = { WBI: 2, WIR: 3, WGT: 4, WHO: 5, MWC: 7, MWF: 8, MWA: 9, MOM: 10, IND: 12, PAK: 13, BAN: 14, CHI: 15, OAS: 16, BAF: 18, BCA: 19, OBL: 20, ARB: 22, OOT: 23 };
const DC_BANDS = 21;

// Burnley and Blackburn with Darwen keep their codes; Cardiff is Welsh;
// Buckinghamshire (E06000060) is a successor of four 2011 districts, which the
// fixture's 2011 file holds instead of the successor code.
const KEPT = ["E07000117", "E06000008", "W06000015"];
const SUCCESSOR = "E06000060";
const PREDECESSORS = ["E07000004", "E07000005", "E07000006", "E07000007"];

function rng(seed) {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 2 ** 32;
  };
}

function writeFixture() {
  const dir = mkdtempSync(path.join(os.tmpdir(), "ukd-zero-noise-"));
  const rand = rng(20261021);
  const base = { ethnicGroups: GROUPS, ages: AGES, areas: {} };
  for (const code of [...KEPT, SUCCESSOR]) {
    const area = {};
    for (const eth of GROUPS) {
      area[eth] = {};
      const scale = eth === "WBI" ? 400 : eth === "PAK" || eth === "WHO" ? 60 : 8;
      for (const sex of ["M", "F"]) {
        area[eth][sex] = {};
        let t = 0;
        for (const a of AGES) {
          const v = Math.floor(rand() * scale);
          area[eth][sex][a] = v;
          t += v;
        }
        area[eth][sex].total = t;
      }
    }
    base.areas[code] = area;
  }
  writeFileSync(path.join(dir, "base.json"), JSON.stringify(base));

  // DC2101EW layout: code, name, eth, eth name, sex, sex name, age band, band name, count.
  const dc = ['"GEOGRAPHY_CODE","GEOGRAPHY_NAME","C_ETHPUK11","N","C_SEX","N","C_AGE","N","OBS_VALUE"'];
  for (const code of [...KEPT, ...PREDECESSORS]) {
    for (const [eth, ethCode] of Object.entries(DC_ETH)) {
      const scale = eth === "WBI" ? 1500 : eth === "PAK" || eth === "WHO" ? 200 : 20;
      for (const sex of [1, 2]) for (let band = 1; band <= DC_BANDS; band++) {
        dc.push(`"${code}","x","${ethCode}","x","${sex}","x","${band}","x",${Math.floor(rand() * scale)}`);
      }
    }
  }
  writeFileSync(path.join(dir, "dc2101ew.csv"), dc.join("\n"));

  // NEWETHPOP 2011: only its area list matters here (every area has DC2101EW
  // rows), so one row of zeros per area. The successor is filed under its
  // first 2011 district, as NEWETHPOP files it.
  const zeros = Array.from({ length: 202 }, () => "0").join(",");
  const ne = ["a,b,code,eth"];
  for (const code of [...KEPT, ...PREDECESSORS]) ne.push(`x,x,${code},WBI,${zeros}`);
  writeFileSync(path.join(dir, "newethpop.csv"), ne.join("\n"));

  // SNPP persons layout, area totals.
  const snpp = ['"AREA_CODE","AREA_NAME","COMPONENT","SEX","AGE_GROUP","2031","2041","2043","2047"'];
  const totals = {};
  for (const code of [...KEPT, SUCCESSOR]) {
    let t = 0;
    for (const eth of GROUPS) t += base.areas[code][eth].M.total + base.areas[code][eth].F.total;
    totals[code] = t;
    const row = [1.04, 1.07, 1.08, 1.1].map((f) => Math.round(t * f));
    snpp.push(`${code},x,Population,persons,All ages,${row.join(",")}`);
    snpp.push(`${code},x,Population,persons,0,${row.join(",")}`);
  }
  writeFileSync(path.join(dir, "snpp.csv"), snpp.join("\n"));

  // Control-totals JSON (age and sex detail) for the age-sex cap. One cell in
  // Burnley is given a target the model cannot carry, to exercise empty cells.
  const ct = { label: "fixture control totals", years: YEARS, ages: AGES, areas: {} };
  for (const code of [...KEPT, SUCCESSOR]) {
    ct.areas[code] = { M: {}, F: {} };
    for (const sex of ["M", "F"]) for (const y of YEARS) {
      ct.areas[code][sex][y] = AGES.map((a) => {
        let v = 0;
        for (const eth of GROUPS) v += base.areas[code][eth][sex][a];
        return Math.round(v * (1 + (y - 2021) / 400));
      });
    }
  }
  writeFileSync(path.join(dir, "ct.json"), JSON.stringify(ct));

  const school = {
    areas: [
      { areaCode: "E07000117", comparison: { asian: { censusChildPct: 20, schoolPct: 25, gapPp: 5 }, white_british: { censusChildPct: 70, schoolPct: 66, gapPp: -4 } } },
      { areaCode: "E06000008", comparison: { mixed: { censusChildPct: 3, schoolPct: 5, gapPp: 2 } } },
    ],
  };
  writeFileSync(path.join(dir, "school.json"), JSON.stringify(school));
  return dir;
}

const cleanEnv = () =>
  Object.fromEntries(Object.entries(process.env).filter(([k]) => !/^(HP_|CCR_|BREXIT_DAMP$)/.test(k)));

function runBoth(dir, tag, args) {
  const det = path.join(dir, `${tag}-det.json`);
  const sto = path.join(dir, `${tag}-sto.json`);
  const env = cleanEnv();
  execFileSync(process.execPath, ["scripts/model/run_hp_single_year.mjs", "--format", "raw", "--output", det, ...args], { stdio: "ignore", env });
  execFileSync(process.execPath, ["scripts/model/run_stochastic_hp.mjs", "--simulations", "1", "--noise", "off", "--format", "raw", "--output", sto, ...args], { stdio: "ignore", env });
  return { det: JSON.parse(readFileSync(det, "utf8")), sto: JSON.parse(readFileSync(sto, "utf8")) };
}

function mismatches({ det, sto }) {
  const out = [];
  for (const [code, timeline] of Object.entries(det.areas)) {
    for (const y of YEARS) {
      const a = timeline[y];
      const b = sto.firstSimulation?.[code]?.[y];
      if (!b || a.total !== b.total || JSON.stringify(a.eth) !== JSON.stringify(b.eth)) out.push(`${code} ${y}`);
    }
  }
  for (const code of Object.keys(sto.firstSimulation ?? {})) if (!det.areas[code]) out.push(`${code} only in the stochastic run`);
  return out;
}

describe("zero-noise check on a fixture", () => {
  const dir = writeFixture();
  const f = (name) => path.join(dir, name);
  const common = ["--base", f("base.json"), "--dc2101ew", f("dc2101ew.csv"), "--newethpop-2011", f("newethpop.csv"), "--school-validation", f("school.json")];

  const cases = [
    ["v8.0 options (SNPP CSV, cap by total)", ["--control-totals", f("snpp.csv")]],
    ["Wales, successors, control-totals JSON, cap by age and sex", ["--countries-2011", "E,W", "--successors-2011", "on", "--control-totals", f("ct.json"), "--cap-mode", "age-sex"]],
    ["control-totals JSON, cap by total", ["--countries-2011", "E,W", "--successors-2011", "on", "--control-totals", f("ct.json"), "--cap-mode", "total"]],
    ["cap off, Brexit damp and calibration off", ["--snpp-cap", "off", "--brexit-damp", "off", "--school-calibration", "off"]],
  ];

  for (const [name, args] of cases) {
    it(`one simulation with the noise off reproduces the deterministic run: ${name}`, () => {
      const r = runBoth(dir, name.replace(/\W+/g, "-"), [...common, ...args]);
      expect(Object.keys(r.det.areas).length).toBeGreaterThan(1);
      expect(mismatches(r)).toEqual([]);
    }, 60_000);
  }

  it("admits the successor only when asked", () => {
    // Without --countries-2011 W, Cardiff's 2011 side comes from the NEWETHPOP
    // fallback (zeros in this fixture), as it would for any area DC2101EW lacks.
    const narrow = runBoth(dir, "narrow", [...common, "--control-totals", f("snpp.csv")]);
    expect(Object.keys(narrow.det.areas).sort()).toEqual(["E06000008", "E07000117", "W06000015"]);
    const wide = runBoth(dir, "wide", [...common, "--countries-2011", "E,W", "--successors-2011", "on", "--control-totals", f("ct.json"), "--cap-mode", "age-sex"]);
    expect(Object.keys(wide.det.areas).sort()).toEqual(["E06000008", "E06000060", "E07000117", "W06000015"]);
  }, 60_000);

  it("the check can fail: noise on moves the first simulation", () => {
    const env = cleanEnv();
    const det = path.join(dir, "noisy-det.json");
    const sto = path.join(dir, "noisy-sto.json");
    const args = [...common, "--control-totals", f("snpp.csv")];
    execFileSync(process.execPath, ["scripts/model/run_hp_single_year.mjs", "--format", "raw", "--output", det, ...args], { stdio: "ignore", env });
    execFileSync(process.execPath, ["scripts/model/run_stochastic_hp.mjs", "--simulations", "2", "--format", "raw", "--output", sto, ...args], { stdio: "ignore", env });
    const r = { det: JSON.parse(readFileSync(det, "utf8")), sto: JSON.parse(readFileSync(sto, "utf8")) };
    expect(mismatches(r).length).toBeGreaterThan(0);
  }, 60_000);

  it("refuses to write the site file with the noise off", () => {
    expect(() =>
      execFileSync(process.execPath, ["scripts/model/run_stochastic_hp.mjs", "--noise", "off", "--output", f("site.json"), ...common], { stdio: "pipe", env: cleanEnv() }),
    ).toThrow();
  });
});

const INPUTS = [
  "data/model/base_single_year_2021.json",
  "data/raw/census_2011_ethnicity_age/dc2101ew_ethnicity_sex_age_la.csv",
  "data/raw/newethpop/extracted/2DataArchive/OutputData/Population/Population2011_LEEDS2.csv",
  "data/raw/snpp/2022 SNPP Population persons.csv",
];

describe.skipIf(!INPUTS.every((p) => existsSync(p)))("zero-noise check on the held v8.0 inputs", () => {
  it("reproduces every modelled area exactly with default options", () => {
    const dir = mkdtempSync(path.join(os.tmpdir(), "ukd-zero-noise-full-"));
    const r = runBoth(dir, "full", []);
    expect(Object.keys(r.det.areas).length).toBeGreaterThan(250);
    expect(mismatches(r)).toEqual([]);
  }, 400_000);
});
