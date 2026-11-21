/**
 * Stochastic Hamilton-Perry Projection — Monte Carlo with 1000 simulations
 *
 * Following Yu, Sevcikova, Raftery & Curran (2023, Demography) and
 * Stats NZ (2018) probabilistic ethnic projection methodology.
 *
 * For each simulation:
 *   1. Perturb each CCR by sampling from Normal(CCR_observed, σ)
 *   2. Perturb CWRs similarly
 *   3. Run full HP projection with perturbed ratios
 *   4. Record WBI% at each projection year
 *
 * After 1000 simulations:
 *   - Median = central projection
 *   - P10/P90 = 80% prediction interval
 *   - P2.5/P97.5 = 95% prediction interval
 *
 * RUN OPTIONS (21 Oct 2026, V81_READINESS.md blocker 2). This script reads the
 * same options as run_hp_single_year.mjs, through scripts/model/lib/hp-options.mjs
 * (base, 2011 files, countries, successors, control totals, cap mode, Brexit
 * damp, School Census calibration, paths), and projects through the same code,
 * scripts/model/lib/hp-core.mjs. Its bands are therefore drawn around the
 * projection the same options produce. Two options of its own:
 *
 *   --simulations <n>   HP_SIMULATIONS   1000
 *   --noise on|off      HP_NOISE         on
 *
 * The zero-noise check: one simulation with the noise off must reproduce the
 * deterministic run exactly. tests/stochastic-zero-noise.test.mjs runs both
 * scripts on a small fixture and compares every count.
 *
 *   node scripts/model/run_hp_single_year.mjs --format raw --output /tmp/det.json [options]
 *   node scripts/model/run_stochastic_hp.mjs --simulations 1 --noise off --format raw --output /tmp/sto.json [options]
 *
 * A site-format run merges into --site-input (default the published file) and
 * writes --output (default the same file); for v8.1 point --site-input at the
 * forward model's scratch output. --format raw writes the percentiles and the
 * first simulation's counts, for checking. Noise off is only a check and cannot
 * write the site format.
 *
 * Changes from the v8.0 script, all of which bring it into line with the
 * deterministic run: national ratios are pooled the deterministic way (sums of
 * 2021 and 2011 counts, clamped, a 2011 base of five or fewer giving 1.0) rather
 * than as a weighted mean of cells above ten; a cap factor outside 0.3 to 3.0 is
 * skipped rather than clamped; the area list is the deterministic run's. A
 * default run therefore gives slightly different bands from the v8.0 ones, which
 * were drawn by the older code. It no longer reads model-validation.json, which
 * it loaded and never used.
 */
import { createHash } from "node:crypto";
import { readFileSync, writeFileSync, existsSync, lstatSync, mkdirSync, rmSync } from "node:fs";
import { execSync } from "node:child_process";
import path from "node:path";
import { loadBase2011 } from "./lib/census-2011-base.mjs";
import { loadControlTotals } from "./lib/control-totals.mjs";
import { successors2011 } from "./lib/geography.mjs";
import { parseHpOptions } from "./lib/hp-options.mjs";
import { isV80Run, stochasticSentence } from "./lib/hp-methodology.mjs";
import {
  applyBrexitDamp, applySchoolCalibration, computeRatios, newCapStats, projectArea, ratioSettings, PROJ_YEARS, SEXES,
} from "./lib/hp-core.mjs";

let OPTS;
let N_SIMULATIONS;
let NOISE;
try {
  OPTS = parseHpOptions(process.argv.slice(2), process.env, { extraFlags: ["simulations", "noise"], recordPrefix: "stochastic" });
  if (OPTS.allPersons) throw new Error("the stochastic run reports White British bands and cannot run in all-persons mode");
  N_SIMULATIONS = Number(OPTS.extra.simulations ?? 1000);
  if (!Number.isInteger(N_SIMULATIONS) || N_SIMULATIONS < 1) throw new Error(`--simulations: expected a whole number of 1 or more, got "${OPTS.extra.simulations}"`);
  const noise = String(OPTS.extra.noise ?? "on").toLowerCase();
  if (!["on", "off"].includes(noise)) throw new Error(`--noise: expected on or off, got "${OPTS.extra.noise}"`);
  NOISE = noise === "on";
  if (!NOISE && OPTS.format === "site") throw new Error("--noise off is the zero-noise check and cannot write the site file; use --format raw");
} catch (err) {
  console.error(err.message);
  process.exit(2);
}
const SITE_INPUT = OPTS.siteInput;
const SITE_OUTPUT = OPTS.output;
if (existsSync(SITE_OUTPUT) && lstatSync(SITE_OUTPUT).isSymbolicLink()) {
  // Model inputs are symlinked from stores other repos read; never write through one.
  console.error(`Refusing to write through a symlink: ${SITE_OUTPUT}`);
  process.exit(2);
}

// Single-writer lock.
//
// This run takes over an hour and writes ethnic-projections.json at the end. Two
// copies started by mistake will both compute happily and then race on that
// write, and the second one silently discards the first. That happened during
// the v8.0 work: the first run's output was buffered behind a pipe so it looked
// dead, a second was started, and both were 85% through before it was noticed.
//
// The lock is a directory because mkdir is atomic. A stale lock from a killed run
// can be cleared by deleting it; the path is printed on failure. A run writing
// the published file takes .stochastic-run.lock in the working directory, as
// before; any other run locks its own output path.
const LOCK = SITE_OUTPUT === path.resolve("src/data/live/ethnic-projections.json") ? ".stochastic-run.lock" : `${SITE_OUTPUT}.lock`;
try {
  mkdirSync(LOCK);
} catch (err) {
  if (err.code === "EEXIST") {
    console.error(`Another stochastic run holds ${LOCK}.`);
    console.error("If no run is active, remove that directory and try again.");
    process.exit(3);
  }
  throw err;
}
const releaseLock = () => { try { rmSync(LOCK, { recursive: true, force: true }); } catch {} };
process.on("exit", releaseLock);
for (const sig of ["SIGINT", "SIGTERM"]) process.on(sig, () => { releaseLock(); process.exit(130); });

console.log(`Options: snppCap=${OPTS.snppCap ? "on" : "off"} capMode=${OPTS.capMode} brexitDamp=${OPTS.brexitDamp ? "on" : "off"} schoolCalibration=${OPTS.schoolCalibration ? "on" : "off"} format=${OPTS.format} simulations=${N_SIMULATIONS} noise=${NOISE ? "on" : "off"}`);
console.log(`  output: ${SITE_OUTPUT}`);

const base2021 = JSON.parse(readFileSync(OPTS.base, "utf8"));
const ETHNIC_GROUPS = base2021.ethnicGroups;
const AGES = base2021.ages;

// FIX 1: Cell-size-dependent σ + horizon scaling
// Base σ calibrated from the v8.0 out-of-sample test: White British MAE 1.56pp
// → base σ = 0.02 (MAE / 100, rounded to 2dp as in validate_backcast.mjs).
// That test fits ratios on Census 2001 to 2011 and scores the 2021 projection
// against Census 2021 across 285 areas, so the fitting window never touches the
// target.
// History: v5.0 σ=0.04 (MAE 3.57pp). v6.0 σ=0.02 (MAE 2.45pp, Census-direct).
// v7.0 σ=0.02 was derived instead from the 1.71pp backcast over 269 areas. That
// backcast was withdrawn on 13 August 2026 as circular, but the value is
// unchanged: 1.56/100 and 1.71/100 both round to 0.02, so no published band
// moves. The new basis is also near-unbiased (+0.05pp against +1.70pp), which is
// what makes the symmetric +/- interval defensible; see the bias warning in
// validate_backcast.mjs. The withdrawn "beats NEWETHPOP by 33%" comparison has
// been removed: NEWETHPOP's genuine out-of-sample error is 3.95pp over 296
// areas, not the 2.58pp that head-to-head used.
// Additional uncertainty for small populations: 0.25 / sqrt(pop)
// Horizon scaling: σ_t = σ_base * sqrt(t/10) (uncertainty compounds over time)
const CCR_SIGMA_BASE = 0.02;
const CCR_SIGMA_SMALL_POP = 0.25;
const CWR_SIGMA_BASE = 0.02;
const PERTURB_FACTOR = NOISE ? 1.0 : 0.0;

// Ratio guardrails: the deterministic run's, from the same environment variables.
const RATIO_SETTINGS = ratioSettings();

// Normal random using Box-Muller transform
function randn() {
  let u = 0, v = 0;
  while (u === 0) u = Math.random();
  while (v === 0) v = Math.random();
  return Math.sqrt(-2.0 * Math.log(u)) * Math.cos(2.0 * Math.PI * v);
}

// ============================================================
// 2011 base, ratios and adjustments: shared with run_hp_single_year.mjs
// ============================================================
// The 2011 base, the ratios, the Brexit damp, the School Census calibration and
// the cap are the deterministic run's own functions. Each of them was once a
// separate copy here and each copy drifted (the 2011 source, the shrink-then-
// clamp order, the two adjustments, the extension beyond 2047, the national
// ratio and the cap guard), every time found by running one simulation with the
// noise off, which must reproduce the deterministic projection exactly.
const { pop2011, areas2011 } = loadBase2011(base2021, ETHNIC_GROUPS, SEXES, {
  dc2101ewPath: OPTS.dc2101ew,
  newethpopPath: OPTS.newethpop2011,
  countries: OPTS.countries2011,
  successors: OPTS.successors2011 ? successors2011() : undefined,
});
const areaCodes = Object.keys(base2021.areas).filter((c) => areas2011.has(c));
const { ccrs, cwrs } = computeRatios(base2021, pop2011, areaCodes, ETHNIC_GROUPS, RATIO_SETTINGS);
if (OPTS.brexitDamp) applyBrexitDamp(ccrs, areaCodes);
if (OPTS.schoolCalibration) {
  let schoolData = null;
  try {
    schoolData = JSON.parse(readFileSync(OPTS.schoolValidation, "utf8"));
  } catch {
    console.log("  WARNING: school-validation.json not found, calibration skipped (the deterministic run skips it too)");
  }
  if (schoolData?.areas) {
    const n = applySchoolCalibration(ccrs, schoolData, base2021, RATIO_SETTINGS);
    console.log(`  Calibrated ${n} areas using DfE school data (matching the deterministic run)`);
  }
}

let control = null;
if (OPTS.snppCap) {
  control = loadControlTotals(OPTS.controlTotals);
  console.log(`Control totals: ${control.label}`);
  if (OPTS.capMode === "age-sex" && !control.hasCells) {
    console.error("--cap-mode age-sex needs a control-totals JSON with age and sex detail");
    process.exit(2);
  }
}

// The noise. Each ratio's σ grows with the horizon and with the thinness of the
// 2011 cell it rests on (CCRs) or of the 2021 women behind it (CWRs).
const perturb = {
  ccr(baseCCR, code, eth, sex, fromAge, year) {
    const horizonScale = Math.sqrt((year - 2021) / 10); // 2031=1.0, 2041=1.41, 2051=1.73, 2061=2.0
    const pop = pop2011.get(`${code}|${eth}|${sex}|${fromAge}`) || 1;
    const sigma = (CCR_SIGMA_BASE + CCR_SIGMA_SMALL_POP / Math.sqrt(Math.max(pop, 1))) * horizonScale;
    return Math.max(0.01, baseCCR + randn() * sigma * PERTURB_FACTOR);
  },
  cwr(baseCWR, code, eth) {
    let cwrWomen = 0;
    for (let a = 15; a <= 44; a++) cwrWomen += base2021.areas[code][eth]?.F?.[a] || 0;
    const cwrSigma = CWR_SIGMA_BASE + 0.15 / Math.sqrt(Math.max(cwrWomen, 1));
    return Math.max(0, baseCWR + randn() * cwrSigma * PERTURB_FACTOR);
  },
};

console.log(`${areaCodes.length} areas, ${ccrs.size} CCRs, running ${N_SIMULATIONS} simulations...`);

// ============================================================
// Run Monte Carlo
// ============================================================
// Only the White British share of each area and year is kept from each
// simulation (it is all the bands use); the first simulation's counts are kept
// whole for the raw output and the zero-noise check.
const nYears = PROJ_YEARS.length;
const wbiShares = []; // one Float64Array per simulation, [areaIndex * nYears + yearIndex]
let firstSimulation = null;
let capStats = newCapStats();
const progressInterval = Math.max(1, Math.floor(N_SIMULATIONS / 10));

for (let sim = 0; sim < N_SIMULATIONS; sim++) {
  if (sim % progressInterval === 0) process.stderr.write(`  Sim ${sim}/${N_SIMULATIONS}\n`);
  const stats = newCapStats();
  const ctx = { base2021, groups: ETHNIC_GROUPS, ages: AGES, ccrs, cwrs, control, capMode: OPTS.capMode, capStats: stats, ageSex: false };
  const shares = new Float64Array(areaCodes.length * nYears);
  const keep = sim === 0 ? {} : null;
  areaCodes.forEach((code, i) => {
    const timeline = projectArea(code, ctx, perturb);
    PROJ_YEARS.forEach((year, j) => {
      const { total, eth } = timeline[year];
      shares[i * nYears + j] = total > 0 ? (eth.WBI || 0) / total * 100 : 0;
    });
    if (keep) keep[code] = Object.fromEntries(PROJ_YEARS.map((y) => [y, timeline[y]]));
  });
  wbiShares.push(shares);
  if (keep) { firstSimulation = keep; capStats = stats; }
}
console.log(`  ${N_SIMULATIONS} simulations complete`);

// ============================================================
// Compute percentiles
// ============================================================
console.log("Computing percentiles...");

function percentile(arr, p) {
  const sorted = [...arr].sort((a, b) => a - b);
  const idx = Math.floor(sorted.length * p);
  return sorted[Math.min(idx, sorted.length - 1)];
}

const stochasticResults = {};
areaCodes.forEach((code, i) => {
  stochasticResults[code] = {};
  PROJ_YEARS.forEach((year, j) => {
    const wbiValues = wbiShares.map((s) => s[i * nYears + j]);
    stochasticResults[code][year] = {
      wbi: {
        p2_5: Math.round(percentile(wbiValues, 0.025) * 10) / 10,
        p10: Math.round(percentile(wbiValues, 0.10) * 10) / 10,
        median: Math.round(percentile(wbiValues, 0.50) * 10) / 10,
        p90: Math.round(percentile(wbiValues, 0.90) * 10) / 10,
        p97_5: Math.round(percentile(wbiValues, 0.975) * 10) / 10
      }
    };
  });
});

// ============================================================
// Diagnostics
// ============================================================
console.log("\n=== STOCHASTIC HP RESULTS ===");
for (const code of ["E07000117", "E06000008", "E08000025"]) {
  const s = stochasticResults[code];
  if (!s) continue;
  console.log(`\n${code}:`);
  for (const year of PROJ_YEARS) {
    const d = s[year].wbi;
    console.log(`  ${year}: WBI median=${d.median}% [80% CI: ${d.p10}-${d.p90}%] [95% CI: ${d.p2_5}-${d.p97_5}%]`);
  }
}

// National aggregate: the simple mean of the areas' White British shares, not
// population-weighted; printed for orientation only.
PROJ_YEARS.forEach((year, j) => {
  const natWBI = wbiShares.map((s) => {
    let wbi = 0;
    for (let i = 0; i < areaCodes.length; i++) wbi += s[i * nYears + j];
    return wbi / areaCodes.length;
  });
  console.log(`\nNational ${year}: median WBI=${percentile(natWBI, 0.5).toFixed(1)}% [80%: ${percentile(natWBI, 0.1).toFixed(1)}-${percentile(natWBI, 0.9).toFixed(1)}%]`);
});

// ============================================================
// Raw output (for checking, not for publication)
// ============================================================
if (OPTS.format === "raw") {
  const out = {
    model: "Stochastic Hamilton-Perry (scripts/model/run_stochastic_hp.mjs)",
    simulations: N_SIMULATIONS,
    noise: NOISE,
    groups: ETHNIC_GROUPS,
    controlTotals: control ? control.label : "none (cap off)",
    capMode: control ? OPTS.capMode : null,
    note: "Model output for checking, not for publication. stochastic holds White British percentiles by area and year; firstSimulation holds the first simulation's projected persons by area, year and group.",
    stochastic: stochasticResults,
    firstSimulation,
  };
  writeFileSync(SITE_OUTPUT, JSON.stringify(out), "utf8");
  console.log(`Written raw output ${SITE_OUTPUT}`);
  writeRunRecord();
  process.exit(0);
}

// ============================================================
// Update site data
// ============================================================
console.log("\nUpdating ethnic-projections.json...");
if (!isV80Run(OPTS, RATIO_SETTINGS)) {
  console.log("NOTE: a non-default configuration. The appended methodology sentence describes it; read it before anything is published.");
}
const existing = JSON.parse(readFileSync(SITE_INPUT, "utf8"));

for (const code of areaCodes) {
  if (!existing.areas[code] || !stochasticResults[code]) continue;
  const area = existing.areas[code];

  area.stochastic = {};
  for (const year of [2031, 2041, 2051, 2061]) {
    if (stochasticResults[code][year]) {
      area.stochastic[String(year)] = stochasticResults[code][year];
    }
  }

  // Update confidence band in headline
  const s51 = stochasticResults[code][2051]?.wbi;
  if (s51) {
    area.confidenceBand2051 = {
      median: s51.median,
      ci80: [s51.p10, s51.p90],
      ci95: [s51.p2_5, s51.p97_5]
    };
  }
}
// modelVersion and methodology are owned by run_hp_single_year.mjs, which is
// the model. This script is a consumer of the model output, so it must not
// stamp its own version: ten scripts used to write this field and whichever
// ran last won, which is how the published file came to report a version
// three releases behind the projections it actually contained.

existing.lastUpdated = new Date().toISOString().slice(0, 10);
existing.methodology += stochasticSentence({ opts: OPTS, settings: RATIO_SETTINGS, simulations: N_SIMULATIONS });

writeFileSync(SITE_OUTPUT, JSON.stringify(existing, null, 2), "utf8");
writeRunRecord();
console.log("Done.");

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
    script: "scripts/model/run_stochastic_hp.mjs",
    ranAt: new Date().toISOString(),
    commit,
    node: process.version,
    options: { ...OPTS, simulations: N_SIMULATIONS, noise: NOISE, ...RATIO_SETTINGS },
    v80Configuration: isV80Run(OPTS, RATIO_SETTINGS),
    inputs: Object.fromEntries(Object.entries(inputs).map(([k, p]) => [k, p ? { path: p, sha256: hashFile(p) } : null])),
    areasProjected: areaCodes.length,
    cap: control ? { mode: OPTS.capMode, firstSimulation: capStats } : null,
    output: { path: SITE_OUTPUT, sha256: hashFile(SITE_OUTPUT) },
  };
  mkdirSync(path.dirname(OPTS.runRecord), { recursive: true });
  writeFileSync(OPTS.runRecord, JSON.stringify(record, null, 2), "utf8");
  console.log(`Run record ${OPTS.runRecord}`);
}
