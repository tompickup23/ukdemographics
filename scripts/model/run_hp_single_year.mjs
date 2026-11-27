/**
 * Hamilton-Perry Model — Single Year of Age, 20 Ethnic Groups
 *
 * CCR(age_a, eth, sex, LA) = Pop(age_a+10, eth, sex, LA, 2021) / Pop(age_a, eth, sex, LA, 2011)
 * CWR(eth, LA) = Children(0-4, eth, LA, 2021) / Women(15-44, eth, LA, 2021)
 *
 * Data:
 * - 2021 base: Census 2021 custom dataset (20 groups, direct observations, no IPF)
 * - 2011 base: PRIMARY: Census 2011 DC2101EW (18 groups, 21 age bands, interpolated to single-year)
 *              FALLBACK: NEWETHPOP Population2011_LEEDS2.csv (12 groups, split to 20 using 2021 proportions)
 * - SNPP envelope: ONS 2022-based Z1
 * - DfE calibration: School Census 2024/25 for young-cohort CCR adjustment
 *
 * 20 groups: WBI WIR WGT WRO WHO MWA MWF MWC MOM IND PAK BAN CHI OAS BAF BCA OBL ARB OOT
 *
 * RUN OPTIONS: scripts/model/lib/hp-options.mjs lists every flag. With none the
 * run is the published v8.0 run, and tests/hp-regression.test.mjs checks that a
 * default run to a scratch file reproduces the published projections exactly.
 *   node scripts/model/run_hp_single_year.mjs --output /tmp/hp.json
 *   node scripts/model/run_hp_single_year.mjs --groups all-persons --snpp-cap off --output /tmp/all.json
 *   node scripts/model/run_hp_single_year.mjs --control-totals data/model/control_totals_v81.json --cap-mode age-sex --output /tmp/v81.json
 *
 * METHODOLOGY NOTE on 2011 base:
 * Census 2011 DC2101EW provides 18 ethnic groups (Roma not separate from Gypsy/Traveller)
 * at 21 age bands. We interpolate to single-year using uniform distribution within bands.
 * For Roma (WRO), we split the 2011 Gypsy/Traveller count using 2021 WGT:WRO proportions.
 * Fallback to NEWETHPOP 12-group proportional splitting for areas not in DC2101EW.
 */
import { createHash } from "node:crypto";
import { readFileSync, writeFileSync, existsSync, lstatSync, mkdirSync } from "node:fs";
import { execSync } from "node:child_process";
import path from "node:path";
import { loadBase2011 } from "./lib/census-2011-base.mjs";
import { loadControlTotals } from "./lib/control-totals.mjs";
import { parseHpOptions } from "./lib/hp-options.mjs";
import { isV80Run, methodologyText } from "./lib/hp-methodology.mjs";
import { successors2011 } from "./lib/geography.mjs";
import { applyBrexitDamp, applySchoolCalibration, computeRatios, newCapStats, projectArea, ratioSettings, SEXES } from "./lib/hp-core.mjs";

let OPTS;
try {
  OPTS = parseHpOptions();
} catch (err) {
  console.error(err.message);
  process.exit(2);
}
const BASE_2021_PATH = OPTS.base;
const SCHOOL_VALIDATION_PATH = OPTS.schoolValidation;
// The published file by default. Set --output (or HP_OUTPUT) to run the model
// without touching what the site serves, which is how you compare a code change
// against the live output before deciding to publish it. A site-format run
// merges into --site-input, so the published file is read regardless of where
// the result is written.
const SITE_INPUT = OPTS.siteInput;
const SITE_OUTPUT = OPTS.output;
if (existsSync(SITE_OUTPUT) && lstatSync(SITE_OUTPUT).isSymbolicLink()) {
  // Model inputs are symlinked from stores other repos read; never write through one.
  console.error(`Refusing to write through a symlink: ${SITE_OUTPUT}`);
  process.exit(2);
}
console.log(`Options: groups=${OPTS.groups} snppCap=${OPTS.snppCap ? "on" : "off"} capMode=${OPTS.capMode} brexitDamp=${OPTS.brexitDamp ? "on" : "off"} schoolCalibration=${OPTS.schoolCalibration ? "on" : "off"} format=${OPTS.format}`);
console.log(`  output: ${SITE_OUTPUT}`);

const base2021 = JSON.parse(readFileSync(BASE_2021_PATH, "utf8"));
let ETHNIC_GROUPS = base2021.ethnicGroups; // 20 groups
const AGES = base2021.ages;

// The 2011 base now comes from scripts/model/lib/census-2011-base.mjs, shared
// with run_stochastic_hp.mjs. The two scripts each had their own copy and the
// stochastic one read a different source, which made the uncertainty bands
// describe a different model from the projections they were drawn around.
const { pop2011, areas2011, successorsSummed } = loadBase2011(base2021, ETHNIC_GROUPS, SEXES, {
  dc2101ewPath: OPTS.dc2101ew,
  newethpopPath: OPTS.newethpop2011,
  countries: OPTS.countries2011,
  successors: OPTS.successors2011 ? successors2011() : undefined,
});

// All-persons mode: one group, the sum of the twenty, in both censuses. The
// 2011 loader runs on the detailed base first because it splits 2011 counts by
// 2021 proportions; those splits preserve each parent's total, so summing after
// loading gives the same all-persons 2011 population as summing before.
if (OPTS.allPersons) {
  for (const code of Object.keys(base2021.areas)) {
    const all = { M: {}, F: {} };
    for (const sex of SEXES) {
      let total = 0;
      for (const age of AGES) {
        let v = 0;
        for (const eth of ETHNIC_GROUPS) v += base2021.areas[code][eth]?.[sex]?.[age] || 0;
        all[sex][age] = v;
        total += v;
      }
      all[sex].total = total;
    }
    base2021.areas[code] = { ALL: all };
  }
  const collapsed = new Map();
  for (const [key, v] of pop2011) {
    const [code, , sex, age] = key.split("|");
    const k = `${code}|ALL|${sex}|${age}`;
    collapsed.set(k, (collapsed.get(k) || 0) + v);
  }
  pop2011.clear();
  for (const [k, v] of collapsed) pop2011.set(k, v);
  ETHNIC_GROUPS = ["ALL"];
  console.log("All-persons mode: 20 groups summed into one");
}

// ============================================================
// Compute single-year CCRs: Pop(age+10, 2021) / Pop(age, 2011)
// ============================================================
// The arithmetic lives in scripts/model/lib/hp-core.mjs, shared with
// run_stochastic_hp.mjs so the bands and the projection are the same model.
console.log("Computing single-year CCRs (20 groups)...");
const areaCodes = Object.keys(base2021.areas).filter(c => areas2011.has(c));
console.log(`  ${areaCodes.length} areas in both censuses`);

// Optional empirical-Bayes shrinkage toward the national CCR.
//
// The default guardrails are a hard ceiling of 5.0 and a rule that freezes any
// cell whose 2011 base held five people or fewer to CCR 1.0. Both truncate in
// one direction, because the cells concerned are overwhelmingly minority groups
// growing from a thin base: 557,013 frozen cells covering 1,174,312 people of
// 2021 population in the published run. That is most of the backcast's one-sided
// +1.2pp bias, and a ceiling of 5.0 still lets a group quintuple per decade,
// which compounds to 625x over four steps and produces the runaway "Other"
// projections (Enfield at 67% by 2051).
//
// Shrinkage replaces both with one rule: trust a local ratio in proportion to
// how much data it rests on.
//
//   ccr = (n11 * ccr_local + K * ccr_national) / (n11 + K)
//
// A cell with thousands of people keeps its own ratio. A cell with two people
// borrows the national rate for its group, age and sex rather than being frozen
// at 1.0, which is the honest answer when there is no local signal. Extreme
// ratios off a small base are pulled in automatically, so the ceiling stops
// doing the work.
//
// Opt in with CCR_SHRINKAGE=1; tune with CCR_SHRINK_K (default 10).
// Defaults selected on the out-of-sample test in
// scripts/model/validate_out_of_sample.mjs, which fits ratios on Census 2001 to
// 2011 and forecasts 2021, so the fitting window never touches the target. On
// that test the previous settings (freeze at a 2011 base of five or fewer,
// ceiling 5.0) scored MAE 2.82pp on the White British share with a bias of
// -2.12pp, under-predicting in 192 of 285 areas: the model was projecting change
// too fast, not too slow. These settings score MAE 1.53pp with a bias of +0.03pp,
// and improve five of the six groups. Total MAE across all groups falls from
// 8.14 to 5.53.
//
// The ceiling is what mattered. At 5.0 a group could quintuple in a decade,
// which is 625x over four steps and is what produced the runaway projections.
// The optimum is a broad plateau: ceilings of 1.6 to 2.0 all score within 0.05pp
// of each other, so this is not a knife-edge fit. The value is chosen as the
// point where the forecast is unbiased rather than the point that minimises MAE
// by a hair, because bias compounds across projection steps and noise does not.
//
// 1.65 rather than 1.60 because the ceiling must be selected at the granularity
// the model runs at. Fitting the validation on six broad groups put the unbiased
// point at 1.60; fitting it on the 16 groups common to all three censuses, which
// is far closer to the 20 this model uses, puts it at 1.65 and reports the more
// honest error of MAE 1.56pp with bias +0.05pp. Cell sizes differ enough between
// the two that a setting tuned on the coarse fit does not transfer cleanly.
const RATIO_SETTINGS = ratioSettings();
const { useShrinkage: USE_SHRINKAGE, shrinkK: SHRINK_K, ceiling: CCR_CEILING, floor: CCR_FLOOR } = RATIO_SETTINGS;
const { ccrs, cwrs, nationalCCRs } = computeRatios(base2021, pop2011, areaCodes, ETHNIC_GROUPS, RATIO_SETTINGS);
if (USE_SHRINKAGE) console.log(`  shrinkage on, K=${SHRINK_K}, ${nationalCCRs.size} national CCRs`);

// Brexit adjustment: WHO only (not WGT/WRO which are domestic populations).
//
// This is a judgement, not an observation, and it is the one adjustment the
// out-of-sample test cannot referee: the test fits 2001 to 2011 and forecasts
// 2021, so "post-Brexit" sits inside its target window rather than beyond it.
//
// What the test does say is that the model already UNDER-projects White Other,
// by -0.87pp. Damping White Other growth further pushes in the same direction as
// an error the model is already making. Set BREXIT_DAMP=0 to run without it.
const APPLY_BREXIT_DAMP = OPTS.brexitDamp;
const brexitAdjusted = APPLY_BREXIT_DAMP ? applyBrexitDamp(ccrs, areaCodes) : 0;
console.log(`  Brexit-adjusted ${brexitAdjusted} WHO CCRs (ages 10-34, -15% growth)${APPLY_BREXIT_DAMP ? "" : " (damp off)"}`);
console.log(`  ${ccrs.size} CCRs, ${cwrs.size} CWRs`);

// ============================================================
// DfE School Census Calibration
// ============================================================
console.log("\nDfE school census calibration...");
let schoolData = null;
if (OPTS.schoolCalibration) {
  try {
    schoolData = JSON.parse(readFileSync(SCHOOL_VALIDATION_PATH, "utf8"));
  } catch (e) {
    console.log("  WARNING: school-validation.json not found. Skipping calibration.");
  }
} else {
  console.log("  calibration off");
}

// Calibration approach:
// The school census gives observed ethnic composition of ages 4-15 in 2024/25.
// Our Census 2021 base gives ethnic composition of ages 4-15 in 2021.
// Children aged 4-15 in 2024/25 were aged 1-12 in 2021.
// If school data shows more Asian children than our Census base predicted,
// the birth/young-cohort CCRs for Asian groups need upward adjustment.
//
// We compute a calibration factor per area per group:
//   schoolObserved / censusBase for ages 4-15
// Then apply a damped version (20% of the gap) to CCRs for ages 0-5 (the
// cohorts that are 10 to 15 at the next step).
// This is conservative — we only partially trust the school signal because:
// 1. School enrollment ≠ resident population (cross-boundary attendance)
// 2. Unclassified pupils (~3-5%) introduce noise
// 3. Only 3-year gap, so change should be small
let calibratedAreas = 0;
if (schoolData?.areas) {
  calibratedAreas = applySchoolCalibration(ccrs, schoolData, base2021, RATIO_SETTINGS);
  console.log(`  Calibrated ${calibratedAreas} areas using DfE school data (20% damping, ages 0-5 CCRs)`);
} else {
  console.log("  No school data available for calibration.");
}

// ============================================================
// Control totals (v8.0: the SNPP persons CSV, area totals)
// ============================================================
let control = null;
if (OPTS.snppCap) {
  console.log(`Reading control totals: ${OPTS.controlTotals}`);
  control = loadControlTotals(OPTS.controlTotals);
  console.log(`  ${control.areas.size} areas (${control.label})`);
  if (OPTS.capMode === "age-sex" && !control.hasCells) {
    console.error("--cap-mode age-sex needs a control-totals JSON with age and sex detail");
    process.exit(2);
  }
} else {
  console.log("Control totals: cap off");
}
const capStats = newCapStats();

// ============================================================
// PROJECT FORWARD: 10-year steps using single-year CCRs
// ============================================================
console.log("\nProjecting...");
const projections = {};
const projectionCtx = {
  base2021, groups: ETHNIC_GROUPS, ages: AGES, ccrs, cwrs, control,
  capMode: OPTS.capMode, capStats, ageSex: OPTS.format === "raw",
};
for (const code of areaCodes) projections[code] = projectArea(code, projectionCtx);

console.log(`Projected ${Object.keys(projections).length} areas`);
if (control) console.log(`  cap (${OPTS.capMode}): applied ${capStats.capped} area-years, skipped ${capStats.skippedOutOfRange} outside the 0.3 to 3.0 guard, ${capStats.noTarget} without a target, ${capStats.emptyCells} empty age-sex cells with a positive target`);

// ============================================================
// DIAGNOSTICS
// ============================================================
function natSummary(year) {
  let total = 0, wbi = 0;
  for (const code of areaCodes) {
    const d = projections[code][year]; if (!d) continue;
    total += d.total; wbi += d.eth.WBI || 0;
  }
  return { total, wbi: (wbi / total * 100).toFixed(1) };
}

if (OPTS.allPersons) {
  console.log("\n=== ALL-PERSONS HP NATIONAL SUMMARY ===");
  for (const y of [2021, 2031, 2041, 2051, 2061]) console.log(`${y}: Total=${(natSummary(y).total / 1e6).toFixed(2)}M`);
  finish();
}

console.log("\n=== 20-GROUP HP NATIONAL SUMMARY ===");
for (const y of [2021, 2031, 2041, 2051, 2061]) {
  const s = natSummary(y);
  console.log(`${y}: WBI=${s.wbi}%, Total=${(s.total / 1e6).toFixed(1)}M`);
}

// New group breakdowns
function natGroupSummary(year) {
  const totals = {};
  let grand = 0;
  for (const code of areaCodes) {
    const d = projections[code][year]; if (!d) continue;
    for (const eth of ETHNIC_GROUPS) {
      totals[eth] = (totals[eth] || 0) + (d.eth[eth] || 0);
    }
    grand += d.total;
  }
  return { totals, grand };
}

console.log("\n=== NEW GROUP PROJECTIONS (national) ===");
for (const eth of ["WBI", "WGT", "WRO", "ARB", "MWA", "MWC", "OBL"]) {
  const t21 = natGroupSummary(2021), t51 = natGroupSummary(2051);
  const p21 = ((t21.totals[eth] || 0) / t21.grand * 100).toFixed(2);
  const p51 = ((t51.totals[eth] || 0) / t51.grand * 100).toFixed(2);
  console.log(`  ${eth}: ${p21}% → ${p51}% (2021→2051)`);
}

let wb50_41 = 0, wb50_51 = 0;
for (const code of areaCodes) {
  const d41 = projections[code][2041], d51 = projections[code][2051];
  if (d41 && d41.total > 0 && d41.eth.WBI / d41.total < 0.5) wb50_41++;
  if (d51 && d51.total > 0 && d51.eth.WBI / d51.total < 0.5) wb50_51++;
}
console.log(`\nWBI <50% by 2041: ${wb50_41} | by 2051: ${wb50_51}`);

for (const code of ["E06000008", "E08000025", "E07000117"]) {
  const d = projections[code]; if (!d) continue;
  const w = (y) => (d[y].eth.WBI / d[y].total * 100).toFixed(1);
  console.log(`${code}: WBI ${w(2021)}% → 2041 ${w(2041)}% → 2051 ${w(2051)}% → 2061 ${w(2061)}%`);
}

// ============================================================
// UPDATE SITE DATA
// ============================================================
if (OPTS.format === "raw") finish();
if (!isV80Run(OPTS, RATIO_SETTINGS)) {
  console.log("\nNOTE: a non-default configuration is writing the site format. Its methodology string is composed from the options and inputs used (scripts/model/lib/hp-methodology.mjs); read it before anything is published.");
}
console.log("\nUpdating ethnic-projections.json...");
const existing = JSON.parse(readFileSync(SITE_INPUT, "utf8"));

// 6-group output (backwards compatible)
function toSimple(eth, total) {
  if (total === 0) return { white_british:0, white_other:0, asian:0, black:0, mixed:0, other:0 };
  return {
    white_british: Math.round((eth.WBI||0)/total*10000)/100,
    white_other: Math.round(((eth.WIR||0)+(eth.WGT||0)+(eth.WRO||0)+(eth.WHO||0))/total*10000)/100,
    asian: Math.round(((eth.IND||0)+(eth.PAK||0)+(eth.BAN||0)+(eth.CHI||0)+(eth.OAS||0))/total*10000)/100,
    black: Math.round(((eth.BAF||0)+(eth.BCA||0)+(eth.OBL||0))/total*10000)/100,
    mixed: Math.round(((eth.MWA||0)+(eth.MWF||0)+(eth.MWC||0)+(eth.MOM||0))/total*10000)/100,
    other: Math.round(((eth.ARB||0)+(eth.OOT||0))/total*10000)/100
  };
}

// 20-group detail output (new)
function toDetail(eth, total) {
  if (total === 0) return {};
  const detail = {};
  for (const e of ETHNIC_GROUPS) {
    if ((eth[e] || 0) > 0) {
      detail[e] = Math.round((eth[e] || 0) / total * 10000) / 100;
    }
  }
  return detail;
}

for (const code of areaCodes) {
  if (!existing.areas[code]) continue;
  const area = existing.areas[code];
  const d = projections[code];

  // Current (2021) with detail
  if (d[2021]) {
    area.current.groups = toSimple(d[2021].eth, d[2021].total);
    area.current.groups_detail = toDetail(d[2021].eth, d[2021].total);
    area.current.groups_absolute_detail = {};
    for (const e of ETHNIC_GROUPS) {
      if ((d[2021].eth[e] || 0) > 0) area.current.groups_absolute_detail[e] = d[2021].eth[e];
    }
  }

  // Projections with detail
  area.projections = {};
  area.projections_detail = {};
  for (const y of [2031, 2041, 2051, 2061]) {
    if (d[y]) {
      area.projections[String(y)] = toSimple(d[y].eth, d[y].total);
      area.projections_detail[String(y)] = toDetail(d[y].eth, d[y].total);
    }
  }

  // Thresholds
  area.thresholds = [];
  const wbs = [2021, 2031, 2041, 2051, 2061].map(y => ({
    year: y, wb: d[y] ? d[y].eth.WBI / d[y].total * 100 : 100
  }));
  for (let i = 0; i < wbs.length - 1; i++) {
    if (wbs[i].wb >= 50 && wbs[i+1].wb < 50) {
      const cross = Math.round(wbs[i].year + (50 - wbs[i].wb) / (wbs[i+1].wb - wbs[i].wb) * (wbs[i+1].year - wbs[i].year));
      area.thresholds.push({ label: "White British <50%", year: cross, confidence: cross <= 2036 ? "high" : cross <= 2051 ? "medium" : "low" });
      break;
    }
  }

  const wb21 = wbs[0].wb, wb51 = wbs[3]?.wb ?? wb21;
  if (wb21 - wb51 > 2) {
    area.headlineStat = { value: `-${(wb21 - wb51).toFixed(1)}pp`, trend: `WBI ${wb21.toFixed(1)}% → ${wb51.toFixed(1)}% by 2051 (20-group HP, Census-direct, SNPP-constrained)` };
  }
}

// The v8.0 configuration writes the v8.0 text byte for byte; any other run
// describes the options and inputs it actually used.
const written = areaCodes.filter((code) => existing.areas[code]);
existing.methodology = methodologyText({
  opts: OPTS,
  settings: RATIO_SETTINGS,
  base2021,
  projected: written,
  names: Object.fromEntries(written.map((code) => [code, existing.areas[code].areaName])),
  successorsSummed,
  control,
  capStats,
  schoolData,
  calibratedAreas,
});
existing.modelVersion = OPTS.modelVersion;
existing.lastUpdated = new Date().toISOString().slice(0, 10);

writeFileSync(SITE_OUTPUT, JSON.stringify(existing, null, 2), "utf8");
console.log("Written ethnic-projections.json");
writeRunRecord();

// ============================================================
// RAW OUTPUT AND RUN RECORD
// ============================================================
function finish() {
  const out = {
    model: "Hamilton-Perry single year of age (scripts/model/run_hp_single_year.mjs)",
    groups: ETHNIC_GROUPS,
    ages: AGES,
    controlTotals: control ? control.label : "none (cap off)",
    capMode: control ? OPTS.capMode : null,
    note: "Model output for checking, not for publication. Counts are projected persons by area, group, year and (ageSex) sex and single year of age, 90 meaning 90 and over.",
    areas: projections,
  };
  writeFileSync(SITE_OUTPUT, JSON.stringify(out), "utf8");
  console.log(`Written raw output ${SITE_OUTPUT}`);
  writeRunRecord();
  process.exit(0);
}

function writeRunRecord() {
  const hashFile = (p) => (existsSync(p) ? createHash("sha256").update(readFileSync(p)).digest("hex") : null);
  let commit = null;
  try {
    commit = execSync("git rev-parse HEAD", { stdio: ["ignore", "pipe", "ignore"] }).toString().trim();
  } catch {
    commit = null;
  }
  const inputs = {
    base: OPTS.base,
    dc2101ew: OPTS.dc2101ew,
    newethpop2011: OPTS.newethpop2011,
    controlTotals: OPTS.snppCap ? OPTS.controlTotals : null,
    schoolValidation: OPTS.schoolCalibration ? OPTS.schoolValidation : null,
    siteInput: OPTS.format === "site" ? OPTS.siteInput : null,
  };
  const record = {
    script: "scripts/model/run_hp_single_year.mjs",
    ranAt: new Date().toISOString(),
    commit,
    node: process.version,
    options: { ...OPTS, ccrShrinkage: USE_SHRINKAGE, ccrShrinkK: SHRINK_K, ccrCeiling: CCR_CEILING, ccrFloor: CCR_FLOOR },
    v80Configuration: isV80Run(OPTS, RATIO_SETTINGS),
    inputs: Object.fromEntries(Object.entries(inputs).map(([k, p]) => [k, p ? { path: p, sha256: hashFile(p) } : null])),
    areasProjected: Object.keys(projections).length,
    successors2011Summed: successorsSummed,
    cap: control ? { mode: OPTS.capMode, ...capStats } : null,
    output: { path: SITE_OUTPUT, sha256: hashFile(SITE_OUTPUT) },
  };
  mkdirSync(path.dirname(OPTS.runRecord), { recursive: true });
  writeFileSync(OPTS.runRecord, JSON.stringify(record, null, 2), "utf8");
  console.log(`Run record ${OPTS.runRecord}`);
}
