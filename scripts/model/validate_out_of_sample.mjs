#!/usr/bin/env node
/**
 * Out-of-sample validation: fit 2001 to 2011, forecast 2021, score on Census 2021.
 *
 * Why this exists
 * ---------------
 * The model's own backcast fits cohort change ratios on 2011 and 2021 and then
 * tests them against 2021. That is circular. With the internal guardrails removed
 * it reproduces the target to 0.14pp by construction, because the ratios are the
 * 2021 population over the 2011 population applied back to the 2011 population.
 * It cannot referee a choice between guardrail settings. The DfE school census
 * cannot either, because the forward model consumes it as a calibration input.
 *
 * This breaks the circle. Ratios are fitted on 2001 to 2011 and projected forward
 * one full decade to 2021, then scored against the actual Census 2021. The
 * fitting window never touches the target, so the error is a real forecast error.
 * It is also the exact analogue of what the published model does, fit on 2011 to
 * 2021 and project to 2031 and beyond, so the error it reports is the error the
 * published projections carry.
 *
 * Scope
 * -----
 * Six broad groups, not twenty. The 2001 Census used 16 detailed groups against
 * 18 in 2011 and 20 in 2021, so only the broad groups are stable across all
 * three. Chinese moved from "Chinese/Other" in 2001 to "Asian" from 2011; it is
 * mapped to asian throughout. 307 local authorities have an unchanged code across
 * the whole period and are the scored set.
 *
 * A total-population envelope is applied at 2021, playing the part SNPP plays in
 * the forward model. It fixes the denominator only, not the composition, which is
 * what is scored.
 *
 * Usage
 * -----
 *   node scripts/model/validate_out_of_sample.mjs                 # default guardrails
 *   CCR_SHRINKAGE=1 CCR_SHRINK_K=10 node ...                      # shrinkage variant
 *   CCR_CEILING=3 node ...                                        # tighter ceiling
 *   node scripts/model/validate_out_of_sample.mjs --json          # machine-readable
 */
import { readFileSync, existsSync, writeFileSync } from "node:fs";
import path from "node:path";

const ST101 = path.resolve("data/raw/census_2001_ethnicity_age/st101_ethnicity_sex_age_la.csv");
const DC2101EW = path.resolve("data/raw/census_2011_ethnicity_age/dc2101ew_ethnicity_sex_age_la.csv");
const PROJ = path.resolve("src/data/live/ethnic-projections.json");
const OUT = path.resolve("src/data/live/out-of-sample-validation.json");

for (const [p, label] of [[ST101, "Census 2001 ST101"], [DC2101EW, "Census 2011 DC2101EW"]]) {
  if (!existsSync(p)) {
    console.error(`Missing ${label}: ${p}`);
    console.error("Run: node scripts/fetch/fetch-census-2001-ethnicity-age.mjs");
    process.exit(2);
  }
}

const asJson = process.argv.includes("--json");
const writeOut = process.argv.includes("--write");

// Guardrail settings under test. The defaults mirror run_hp_single_year.mjs so
// that running this with no environment set validates the model as published.
// Override any of them to reproduce the selection sweep.
const CCR_CEILING = Number(process.env.CCR_CEILING ?? 1.6);
const CCR_FLOOR = Number(process.env.CCR_FLOOR ?? 0.05);
const MIN_BASE = Number(process.env.CCR_MIN_BASE ?? 5);
const USE_SHRINKAGE = process.env.CCR_SHRINKAGE !== "0";
const SHRINK_K = Number(process.env.CCR_SHRINK_K ?? 25);
const LABEL =
  process.env.VARIANT_LABEL ??
  (USE_SHRINKAGE ? `shrinkage K=${SHRINK_K}` : `freeze<=${MIN_BASE}, ceiling ${CCR_CEILING}`);

const SIMPLE = ["white_british", "white_other", "asian", "black", "mixed", "other"];
const SEXES = ["M", "F"];
const MAX_AGE = 90;

// 2001 ST101 detailed code -> broad group
const ETH2001 = {
  1: "white_british",
  2: "white_other", 3: "white_other",
  4: "mixed", 5: "mixed", 6: "mixed", 7: "mixed",
  8: "asian", 9: "asian", 10: "asian", 11: "asian",
  12: "black", 13: "black", 14: "black",
  15: "asian",   // Chinese, grouped with Asian from 2011 onward
  16: "other"
};

// 2011 DC2101EW detailed code -> broad group
const ETH2011 = {
  2: "white_british",
  3: "white_other", 4: "white_other", 5: "white_other",
  7: "mixed", 8: "mixed", 9: "mixed", 10: "mixed",
  12: "asian", 13: "asian", 14: "asian", 15: "asian", 16: "asian",
  18: "black", 19: "black", 20: "black",
  22: "other", 23: "other"
};

const BANDS_2001 = {
  1: [0, 4], 2: [5, 7], 3: [8, 9], 4: [10, 14], 5: [15, 15], 6: [16, 17],
  7: [18, 19], 8: [20, 24], 9: [25, 29], 10: [30, 34], 11: [35, 39], 12: [40, 44],
  13: [45, 49], 14: [50, 54], 15: [55, 59], 16: [60, 64], 17: [65, 69], 18: [70, 74],
  19: [75, 79], 20: [80, 84], 21: [85, 89], 22: [90, 90]
};
const BANDS_2011 = {
  1: [0, 4], 2: [5, 7], 3: [8, 9], 4: [10, 14], 5: [15, 15], 6: [16, 17],
  7: [18, 19], 8: [20, 24], 9: [25, 29], 10: [30, 34], 11: [35, 39], 12: [40, 44],
  13: [45, 49], 14: [50, 54], 15: [55, 59], 16: [60, 64], 17: [65, 69], 18: [70, 74],
  19: [75, 79], 20: [80, 84], 21: [85, 90]
};

// Same within-band distribution the forward model uses, so the interpolation is
// not a source of difference between this test and the published run.
function spread(total, startAge, width) {
  if (width === 1) return [total];
  if (width === 5) {
    const w = startAge === 0 ? [0.22, 0.21, 0.20, 0.19, 0.18] : [0.19, 0.20, 0.22, 0.20, 0.19];
    return w.map((x) => total * x);
  }
  return Array.from({ length: width }, () => total / width);
}

function parseCsvLine(line) {
  const f = []; let c = ""; let q = false;
  for (const ch of line) {
    if (ch === '"') q = !q;
    else if (ch === "," && !q) { f.push(c.trim()); c = ""; }
    else c += ch;
  }
  f.push(c.trim());
  return f;
}

function loadCensus(file, ethMap, bands, cols) {
  const pop = new Map(); // "code|group|sex|age" -> count
  const areas = new Set();
  const lines = readFileSync(file, "utf8").split("\n");
  for (let i = 1; i < lines.length; i++) {
    const line = lines[i];
    if (!line.trim()) continue;
    const f = parseCsvLine(line);
    const code = f[cols.geo];
    if (!code || !code.startsWith("E")) continue;
    const group = ethMap[Number(f[cols.eth])];
    if (!group) continue;
    const band = bands[Number(f[cols.age])];
    if (!band) continue;
    const sex = f[cols.sex] === "1" ? "M" : "F";
    const count = Number(f[cols.val]) || 0;
    if (count === 0) continue;
    areas.add(code);
    const width = band[1] - band[0] + 1;
    const parts = spread(count, band[0], width);
    for (let k = 0; k < width; k++) {
      const age = Math.min(band[0] + k, MAX_AGE);
      const key = `${code}|${group}|${sex}|${age}`;
      pop.set(key, (pop.get(key) || 0) + parts[k]);
    }
  }
  return { pop, areas };
}

console.error("Loading Census 2001 ST101...");
const c2001 = loadCensus(ST101, ETH2001, BANDS_2001, { geo: 0, eth: 2, sex: 4, age: 6, val: 8 });
console.error(`  ${c2001.areas.size} areas`);

console.error("Loading Census 2011 DC2101EW...");
const c2011 = loadCensus(DC2101EW, ETH2011, BANDS_2011, { geo: 0, eth: 2, sex: 4, age: 6, val: 8 });
console.error(`  ${c2011.areas.size} areas`);

const projections = JSON.parse(readFileSync(PROJ, "utf8")).areas;

// Scored set: present in both censuses and carrying a Census 2021 observation.
const codes = [...c2001.areas]
  .filter((c) => c2011.areas.has(c))
  .filter((c) => projections[c]?.current?.groups?.white_british != null)
  .sort();
console.error(`  ${codes.length} areas scored\n`);

const get = (m, code, g, s, a) => m.get(`${code}|${g}|${s}|${a}`) || 0;

// National ratios, for the shrinkage variant.
const nationalCCR = new Map();
if (USE_SHRINKAGE) {
  const num = new Map(), den = new Map();
  for (const code of codes) {
    for (const g of SIMPLE) for (const s of SEXES) {
      for (let a = 0; a <= MAX_AGE - 10; a++) {
        const k = `${g}|${s}|${a}`;
        num.set(k, (num.get(k) || 0) + get(c2011.pop, code, g, s, a + 10));
        den.set(k, (den.get(k) || 0) + get(c2001.pop, code, g, s, a));
      }
    }
  }
  for (const [k, n] of num) {
    const d = den.get(k) || 0;
    nationalCCR.set(k, d > 5 ? Math.max(CCR_FLOOR, Math.min(CCR_CEILING, n / d)) : 1.0);
  }
}

function ccrFor(code, g, s, a) {
  const p01 = get(c2001.pop, code, g, s, a);
  const p11 = get(c2011.pop, code, g, s, a + 10);
  if (USE_SHRINKAGE) {
    const nat = nationalCCR.get(`${g}|${s}|${a}`) ?? 1.0;
    const local = p01 > 0 ? p11 / p01 : nat;
    return Math.max(CCR_FLOOR, Math.min(CCR_CEILING, (p01 * local + SHRINK_K * nat) / (p01 + SHRINK_K)));
  }
  if (p01 > MIN_BASE) return Math.max(CCR_FLOOR, Math.min(CCR_CEILING, p11 / p01));
  return 1.0;
}

const results = [];
for (const code of codes) {
  // Child-woman ratio from the 2011 Census, the fitting endpoint, exactly as the
  // forward model takes its CWR from its own latest Census.
  const cwr = {};
  for (const g of SIMPLE) {
    let children = 0, women = 0;
    for (let a = 0; a <= 9; a++) children += get(c2011.pop, code, g, "M", a) + get(c2011.pop, code, g, "F", a);
    for (let a = 15; a <= 44; a++) women += get(c2011.pop, code, g, "F", a);
    cwr[g] = women > 5 ? children / women / 10 : 0.03;
  }

  // One ten-year step, 2011 -> 2021. Cohorts first for both sexes, then births,
  // so male births are not sized off the previous decade's women.
  const next = {};
  for (const g of SIMPLE) {
    next[g] = { M: {}, F: {} };
    for (const s of SEXES) {
      for (let toAge = 10; toAge <= MAX_AGE; toAge++) {
        const fromAge = toAge - 10;
        next[g][s][toAge] = get(c2011.pop, code, g, s, fromAge) * ccrFor(code, g, s, fromAge);
      }
      next[g][s][MAX_AGE] = (next[g][s][MAX_AGE] || 0) + get(c2011.pop, code, g, s, MAX_AGE) * 0.3;
    }
  }
  for (const g of SIMPLE) {
    let women = 0;
    for (let a = 15; a <= 44; a++) women += next[g].F[a] || 0;
    const births = women * cwr[g];
    for (const s of SEXES) {
      const ratio = s === "M" ? 0.512 : 0.488;
      for (let a = 0; a <= 9; a++) next[g][s][a] = births * ratio;
    }
  }

  let total = 0;
  const totals = {};
  for (const g of SIMPLE) {
    let t = 0;
    for (const s of SEXES) for (let a = 0; a <= MAX_AGE; a++) t += next[g][s][a] || 0;
    totals[g] = t;
    total += t;
  }
  if (total <= 0) continue;

  const actual = projections[code].current.groups;
  const predicted = {};
  for (const g of SIMPLE) predicted[g] = (totals[g] / total) * 100;

  const row = { code, areaName: projections[code].areaName, predicted: {}, actual: {}, error: {} };
  for (const g of SIMPLE) {
    row.predicted[g] = Math.round(predicted[g] * 100) / 100;
    row.actual[g] = actual[g] ?? null;
    row.error[g] = actual[g] != null ? Math.round((predicted[g] - actual[g]) * 100) / 100 : null;
  }
  results.push(row);
}

function stats(key) {
  const errs = results.map((r) => r.error[key]).filter((e) => e != null);
  if (!errs.length) return null;
  const n = errs.length;
  const mae = errs.reduce((t, e) => t + Math.abs(e), 0) / n;
  const bias = errs.reduce((t, e) => t + e, 0) / n;
  const rmse = Math.sqrt(errs.reduce((t, e) => t + e * e, 0) / n);
  const over = errs.filter((e) => e > 0).length;
  const sorted = [...errs].sort((a, b) => a - b);
  const q = (p) => sorted[Math.min(n - 1, Math.floor(p * n))];
  return {
    n,
    mae: +mae.toFixed(3),
    bias: +bias.toFixed(3),
    rmse: +rmse.toFixed(3),
    overPredict: over,
    underPredict: n - over,
    p10: +q(0.1).toFixed(2),
    median: +q(0.5).toFixed(2),
    p90: +q(0.9).toFixed(2)
  };
}

const summary = {};
for (const g of SIMPLE) summary[g] = stats(g);

const out = {
  generatedAt: null,
  variant: LABEL,
  settings: { CCR_CEILING, CCR_FLOOR, MIN_BASE, USE_SHRINKAGE, SHRINK_K },
  design:
    "Cohort change ratios fitted on Census 2001 to Census 2011, projected one decade to 2021, " +
    "scored against Census 2021. The fitting window never touches the target, so this is a real " +
    "forecast error rather than the circular backcast. Six broad groups, the only classification " +
    "stable across all three censuses.",
  areasScored: results.length,
  summary,
  areas: results
};

if (writeOut) {
  writeFileSync(OUT, JSON.stringify(out, null, 2), "utf8");
  console.error(`Wrote ${OUT}`);
}

if (asJson) {
  console.log(JSON.stringify(out, null, 2));
} else {
  console.log(`Out-of-sample: fit 2001-2011, forecast 2021, score on Census 2021`);
  console.log(`Variant: ${LABEL}`);
  console.log(`Areas scored: ${results.length}\n`);
  console.log(`${"group".padEnd(15)}${"MAE".padStart(8)}${"bias".padStart(9)}${"RMSE".padStart(8)}${"over/under".padStart(13)}`);
  for (const g of SIMPLE) {
    const s = summary[g];
    if (!s) continue;
    console.log(
      `${g.padEnd(15)}${s.mae.toFixed(2).padStart(8)}${(s.bias >= 0 ? "+" : "") + s.bias.toFixed(2).padStart(8)}` +
      `${s.rmse.toFixed(2).padStart(8)}${`${s.overPredict}/${s.underPredict}`.padStart(13)}`
    );
  }
  const wb = summary.white_british;
  console.log(`\nWhite British is the headline: MAE ${wb.mae.toFixed(2)}pp, bias ${wb.bias >= 0 ? "+" : ""}${wb.bias.toFixed(2)}pp, ` +
    `over-predicts in ${wb.overPredict} of ${wb.n} areas.`);
}
