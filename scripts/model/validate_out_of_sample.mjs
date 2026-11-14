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
 * Scoring is always on the six broad groups so results stay comparable with each
 * other and with NEWETHPOP. Ratios are fitted at 16 groups by default, the finest
 * classification common to 2001, 2011 and 2021, because the model being validated
 * runs at 20 and a setting selected on a coarser fit does not transfer cleanly.
 * GROUPING=broad reverts to a six-group fit. Chinese moved from "Chinese/Other"
 * in 2001 to "Asian" from 2011 and is mapped to asian throughout. 285 local
 * authorities have an unchanged code across all three censuses and carry a Census
 * 2021 observation; they are the scored set.
 *
 * No total-population envelope is applied. The forward model constrains to SNPP,
 * but an envelope scales every cell by one factor and so leaves shares unchanged,
 * and shares are what is scored. Omitting it also keeps any 2021 information out
 * of the forecast.
 *
 * What this does NOT validate: the horizon. It tests one ten-year step, which is
 * what the published model's first step does. The published 2051 and 2061 figures
 * run that step three and four times, and no data available here can test whether
 * a calibration chosen on one step holds over four.
 *
 * Usage
 * -----
 *   node scripts/model/validate_out_of_sample.mjs                 # default guardrails
 *   CCR_SHRINKAGE=1 CCR_SHRINK_K=10 node ...                      # shrinkage variant
 *   CCR_CEILING=3 node ...                                        # tighter ceiling
 *   node scripts/model/validate_out_of_sample.mjs --json          # machine-readable
 *
 * Coverage options (21 Oct 2026, V81_READINESS.md blocker 3). With none the
 * scored set and every number are v8.0's: English authorities whose code is the
 * same in all three censuses (285).
 *
 *   --countries E[,W]       code prefixes read from ST101 and DC2101EW (default E).
 *                           W adds the 22 Welsh authorities, which both files hold.
 *   --successors on|off     default off. On: an authority whose code changed after
 *                           2011 (scripts/model/geography/lad11-successors.json and
 *                           the April 2023 changes in src/data/lookups/lad22-to-lad23.json,
 *                           through lib/geography.mjs successors2011()) is scored on
 *                           the summed counts of its 2011 districts, on both sides:
 *                           DC2101EW for 2011 and ST101 for 2001. ST101 is published
 *                           on the same 2011 local authority geography as DC2101EW
 *                           (the held files list the same 348 codes), so the 2001
 *                           side uses the same districts. A successor is scored only
 *                           if every one of its districts is in both files; any that
 *                           is not is listed under coverage.successorGaps, never
 *                           filled in.
 *   --actual <file>         the Census 2021 shares scored against. Default
 *                           src/data/live/ethnic-projections.json (current.groups).
 *                           A base file from build_single_year_base.mjs (it has
 *                           ethnicGroups) is read instead as 20 groups summed to six;
 *                           its estimatedAreas are listed under coverage, since their
 *                           cells are IPF fits whose group totals are RM032's.
 *   --site-input <file>     the site file read for area names (and the default actual)
 *   --st101 <file>, --dc2101ew <file>   the census files
 *   --out <file>            where --write writes (default src/data/live/out-of-sample-validation.json)
 *
 *   node scripts/model/validate_out_of_sample.mjs --countries E,W --successors on \
 *     --actual /tmp/v81/base_single_year_2021_v81.json --json > /tmp/v81/oos.json
 *
 * Extended measures (14 Nov 2026, register row R657). None changes the output
 * above unless asked for; each adds an `extended` block (and type and counts on
 * each area row).
 *
 *   --extended              the split by authority type (London apart from the other
 *                           metropolitan boroughs); with a base file as --actual, also
 *                           percentage errors on counts (median and 90th percentile
 *                           over every area, mean over areas with 1,000 or more of
 *                           the group) and the index of dissimilarity per group,
 *                           projected against actual.
 *   --cap-mode none|total|age-sex   cap the 2021 step to the actual Census 2021
 *                           persons from the base file: one factor per area, or one
 *                           per sex and single year of age, as the forward model's
 *                           two cap modes do. Implies --extended and needs a base
 *                           file. The control is the actual 2021 population, so this
 *                           scores each mode at its best, not with a forecast control.
 *   --simulations N         band calibration: rerun the step N times with the
 *                           published noise rule (run_stochastic_hp.mjs at its first
 *                           step) and report the share of areas whose actual White
 *                           British share falls inside the 80 and 95 per cent bands.
 *   --seed S                seed for --simulations (default 1), so a run repeats.
 *
 *   node scripts/model/validate_out_of_sample.mjs --countries E,W --successors on \
 *     --actual data/model/base_single_year_2021_v81.json --cap-mode age-sex \
 *     --simulations 200 --json > /tmp/v81/oos-age-sex.json
 */
import { readFileSync, existsSync, writeFileSync } from "node:fs";
import path from "node:path";
import { successors2011 } from "./lib/geography.mjs";

const argv = process.argv.slice(2);
const flag = (name, fallback) => {
  const i = argv.indexOf(`--${name}`);
  if (i < 0) return fallback;
  const v = argv[i + 1];
  if (v === undefined || v.startsWith("--")) {
    console.error(`--${name} needs a value`);
    process.exit(2);
  }
  return v;
};
const KNOWN = new Set([
  "json", "write", "countries", "successors", "actual", "site-input", "st101", "dc2101ew", "out",
  "extended", "cap-mode", "simulations", "seed",
]);
for (const a of argv) {
  if (a.startsWith("--") && !KNOWN.has(a.slice(2))) {
    console.error(`unknown flag ${a}`);
    process.exit(2);
  }
}

const ST101 = path.resolve(flag("st101", "data/raw/census_2001_ethnicity_age/st101_ethnicity_sex_age_la.csv"));
const DC2101EW = path.resolve(flag("dc2101ew", "data/raw/census_2011_ethnicity_age/dc2101ew_ethnicity_sex_age_la.csv"));
const PROJ = path.resolve(flag("site-input", "src/data/live/ethnic-projections.json"));
const ACTUAL = path.resolve(flag("actual", PROJ));
const OUT = path.resolve(flag("out", "src/data/live/out-of-sample-validation.json"));
const COUNTRIES = flag("countries", "E").split(",").map((c) => c.trim()).filter(Boolean);
const SUCCESSORS = (() => {
  const v = flag("successors", "off");
  if (!["on", "off"].includes(v)) {
    console.error(`--successors: expected on or off, got "${v}"`);
    process.exit(2);
  }
  return v === "on";
})();
// Every coverage option at its default: the v8.0 test, whose output must not change.
const DEFAULT_COVERAGE = COUNTRIES.join(",") === "E" && !SUCCESSORS && ACTUAL === PROJ;

// Extended measures (R657, 14 Nov 2026). Off by default, so the output above is
// unchanged unless one of these flags is given.
const CAP_MODE = flag("cap-mode", "none");
if (!["none", "total", "age-sex"].includes(CAP_MODE)) {
  console.error(`--cap-mode: expected none, total or age-sex, got "${CAP_MODE}"`);
  process.exit(2);
}
const SIMULATIONS = Number(flag("simulations", "0"));
const SEED = Number(flag("seed", "1"));
if (!Number.isInteger(SIMULATIONS) || SIMULATIONS < 0 || !Number.isInteger(SEED)) {
  console.error("--simulations and --seed take whole numbers");
  process.exit(2);
}
const EXTENDED = argv.includes("--extended") || CAP_MODE !== "none" || SIMULATIONS > 0;

for (const [p, label] of [[ST101, "Census 2001 ST101"], [DC2101EW, "Census 2011 DC2101EW"]]) {
  if (!existsSync(p)) {
    console.error(`Missing ${label}: ${p}`);
    console.error("Run: node scripts/fetch/fetch-census-2001-ethnicity-age.mjs");
    process.exit(2);
  }
}

const asJson = argv.includes("--json");
const writeOut = argv.includes("--write");

// Guardrail settings under test. The defaults mirror run_hp_single_year.mjs so
// that running this with no environment set validates the model as published.
// Override any of them to reproduce the selection sweep.
const CCR_CEILING = Number(process.env.CCR_CEILING ?? 1.65);
const CCR_FLOOR = Number(process.env.CCR_FLOOR ?? 0.05);
const MIN_BASE = Number(process.env.CCR_MIN_BASE ?? 5);
const USE_SHRINKAGE = process.env.CCR_SHRINKAGE !== "0";
const SHRINK_K = Number(process.env.CCR_SHRINK_K ?? 25);
const LABEL =
  process.env.VARIANT_LABEL ??
  (USE_SHRINKAGE ? `shrinkage K=${SHRINK_K}` : `freeze<=${MIN_BASE}, ceiling ${CCR_CEILING}`);

// Granularity the ratios are computed at. This matters and is easy to get wrong.
//
// Scoring is always on the six broad groups, so results stay comparable with each
// other and with NEWETHPOP. But the RATIOS can be fitted at two granularities,
// and the shrinkage constant K is not scale-free: it is a cell count, so the same
// K shrinks a fine-grained model much harder than a coarse one. In the six-group
// fit the median cell holds 13.4 people and K=25 leaves a weight of 0.35 on local
// information; in the twenty-group model the published code actually runs, the
// median cell holds 5 and the same K leaves 0.17. Selecting K on the coarse fit
// and applying it to the fine one over-shrinks the published model toward the
// national average.
//
// GROUPING=detailed fits at the 16 groups common to all three censuses, which is
// close to the 20 the model runs at, and is the setting K should be chosen on.
const GROUPING = process.env.GROUPING ?? "detailed";
const SIMPLE = ["white_british", "white_other", "asian", "black", "mixed", "other"];

// 16 groups common to 2001, 2011 and 2021. 2001 has no separate Gypsy/Traveller,
// Roma or Arab, so those sit inside White Other and Other respectively.
const DETAILED = [
  "WBI", "WIR", "WHO", "MWC", "MWF", "MWA", "MOM",
  "IND", "PAK", "BAN", "OAS", "CHI", "BCA", "BAF", "OBL", "OTH"
];
const DETAILED_TO_BROAD = {
  WBI: "white_british", WIR: "white_other", WHO: "white_other",
  MWC: "mixed", MWF: "mixed", MWA: "mixed", MOM: "mixed",
  IND: "asian", PAK: "asian", BAN: "asian", OAS: "asian", CHI: "asian",
  BCA: "black", BAF: "black", OBL: "black",
  OTH: "other"
};
const ETH2001_DETAILED = {
  1: "WBI", 2: "WIR", 3: "WHO",
  4: "MWC", 5: "MWF", 6: "MWA", 7: "MOM",
  8: "IND", 9: "PAK", 10: "BAN", 11: "OAS",
  12: "BCA", 13: "BAF", 14: "OBL",
  15: "CHI", 16: "OTH"
};
const ETH2011_DETAILED = {
  2: "WBI", 3: "WIR", 4: "WHO", 5: "WHO",
  7: "MWC", 8: "MWF", 9: "MWA", 10: "MOM",
  12: "IND", 13: "PAK", 14: "BAN", 15: "CHI", 16: "OAS",
  18: "BAF", 19: "BCA", 20: "OBL",
  22: "OTH", 23: "OTH"
};
const FIT_GROUPS = GROUPING === "detailed" ? DETAILED : SIMPLE;
const toBroad = (g) => (GROUPING === "detailed" ? DETAILED_TO_BROAD[g] : g);
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
    if (!code || !COUNTRIES.some((p) => code.startsWith(p))) continue;
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

console.error(`Loading Census 2001 ST101 (fitting at ${FIT_GROUPS.length} groups)...`);
const c2001 = loadCensus(ST101, GROUPING === "detailed" ? ETH2001_DETAILED : ETH2001, BANDS_2001, { geo: 0, eth: 2, sex: 4, age: 6, val: 8 });
console.error(`  ${c2001.areas.size} areas`);

console.error("Loading Census 2011 DC2101EW...");
const c2011 = loadCensus(DC2101EW, GROUPING === "detailed" ? ETH2011_DETAILED : ETH2011, BANDS_2011, { geo: 0, eth: 2, sex: 4, age: 6, val: 8 });
console.error(`  ${c2011.areas.size} areas`);

// Successors: the summed counts of their 2011 districts, on both sides. Only a
// successor whose code neither file holds, and all of whose districts both files
// hold, is summed; anything else is reported, not estimated.
const successorsSummed = [];
const successorGaps = [];
if (SUCCESSORS) {
  const sumInto = (census, succ, preds) => {
    const add = new Map();
    for (const [key, v] of census.pop) {
      const bar = key.indexOf("|");
      if (preds.includes(key.slice(0, bar))) {
        const k = succ + key.slice(bar);
        add.set(k, (add.get(k) || 0) + v);
      }
    }
    for (const [k, v] of add) census.pop.set(k, v);
    census.areas.add(succ);
  };
  for (const [succ, preds] of Object.entries(successors2011())) {
    if (!COUNTRIES.some((p) => succ.startsWith(p))) continue;
    const in01 = c2001.areas.has(succ), in11 = c2011.areas.has(succ);
    if (in01 && in11) continue; // held under its current code in both files
    if (in01 !== in11) {
      successorGaps.push({ code: succ, reason: `held under its current code in ${in01 ? "ST101" : "DC2101EW"} only` });
      continue;
    }
    const missing = [
      ...preds.filter((p) => !c2001.areas.has(p)).map((p) => `${p} (ST101)`),
      ...preds.filter((p) => !c2011.areas.has(p)).map((p) => `${p} (DC2101EW)`),
    ];
    if (!preds.length || missing.length) {
      successorGaps.push({ code: succ, reason: preds.length ? `2011 districts missing: ${missing.join(", ")}` : "no 2011 districts listed" });
      continue;
    }
    sumInto(c2001, succ, preds);
    sumInto(c2011, succ, preds);
    successorsSummed.push({ code: succ, districts2011: preds });
  }
  console.error(`  ${successorsSummed.length} successors summed from their 2011 districts in both censuses; ${successorGaps.length} gaps`);
  for (const g of successorGaps) console.error(`  gap: ${g.code} ${g.reason}`);
}

const projections = JSON.parse(readFileSync(PROJ, "utf8")).areas;

// The Census 2021 shares scored against: the site file's current.groups, or a
// 2021 base file summed from 20 groups to six.
const BROAD_OF_20 = {
  WBI: "white_british", WIR: "white_other", WGT: "white_other", WRO: "white_other", WHO: "white_other",
  MWA: "mixed", MWF: "mixed", MWC: "mixed", MOM: "mixed",
  IND: "asian", PAK: "asian", BAN: "asian", CHI: "asian", OAS: "asian",
  BAF: "black", BCA: "black", OBL: "black",
  ARB: "other", OOT: "other"
};
const actualDoc = ACTUAL === PROJ ? null : JSON.parse(readFileSync(ACTUAL, "utf8"));
const actualFromBase = Array.isArray(actualDoc?.ethnicGroups);
const actualGroups = new Map();
// Counts as well as shares, when the actual is a base file: the extended measures
// read them (counts by broad group, and persons by sex and single year of age,
// which is the control both cap modes scale to).
const actualCounts = new Map();
for (const [code, area] of Object.entries(actualDoc ? actualDoc.areas : projections)) {
  if (!actualFromBase) {
    if (area?.current?.groups?.white_british != null) actualGroups.set(code, area.current.groups);
    continue;
  }
  const sums = Object.fromEntries(SIMPLE.map((g) => [g, 0]));
  const ageSex = { M: new Array(MAX_AGE + 1).fill(0), F: new Array(MAX_AGE + 1).fill(0) };
  let total = 0;
  for (const eth of actualDoc.ethnicGroups) {
    const v = (area[eth]?.M?.total || 0) + (area[eth]?.F?.total || 0);
    if (!BROAD_OF_20[eth]) throw new Error(`${ACTUAL}: unknown group ${eth}`);
    sums[BROAD_OF_20[eth]] += v;
    total += v;
    for (const s of SEXES) for (let a = 0; a <= MAX_AGE; a++) ageSex[s][a] += Number(area[eth]?.[s]?.[a]) || 0;
  }
  if (total <= 0) continue;
  actualCounts.set(code, { groups: sums, total, ageSex });
  // Rounded as run_hp_single_year.mjs rounds current.groups.
  actualGroups.set(code, Object.fromEntries(SIMPLE.map((g) => [g, Math.round(sums[g] / total * 10000) / 100])));
}

// Scored set: present in both censuses and carrying a Census 2021 observation.
const codes = [...c2001.areas]
  .filter((c) => c2011.areas.has(c))
  .filter((c) => actualGroups.has(c))
  .sort();
console.error(`  ${codes.length} areas scored\n`);

const get = (m, code, g, s, a) => m.get(`${code}|${g}|${s}|${a}`) || 0;

// National ratios, for the shrinkage variant.
const nationalCCR = new Map();
if (USE_SHRINKAGE) {
  const num = new Map(), den = new Map();
  for (const code of codes) {
    for (const g of FIT_GROUPS) for (const s of SEXES) {
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

if (CAP_MODE !== "none" && !actualFromBase) {
  console.error("--cap-mode needs --actual <2021 base file>: the cap scales to its persons by sex and age");
  process.exit(2);
}

// Seeded generator for the band calibration, so a run can be repeated exactly.
function mulberry32(a) {
  return () => {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
function makeRandn(rand) {
  return () => {
    let u = 0, v = 0;
    while (u === 0) u = rand();
    while (v === 0) v = rand();
    return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
  };
}

// The published band's noise rule (run_stochastic_hp.mjs) at its first step, where
// the horizon scale is 1: each ratio moves by sigma = 0.02 + 0.25 / sqrt(cell), the
// cell being the fitting window's start population (2001 here, as 2011 there), and
// each child-woman ratio by 0.02 + 0.15 / sqrt(women at the latest census).
const CCR_SIGMA_BASE = 0.02, CCR_SIGMA_SMALL_POP = 0.25, CWR_SIGMA_BASE = 0.02;

const capCounts = { capped: 0, emptyCells: 0 };

// Each area's inputs, read once: the 2011 cohorts, the deterministic ratios, the
// 2001 cell sizes the noise rule reads, and the child-woman ratios. The band
// calibration reruns the step many times, and the string-keyed lookups were most
// of its cost.
const inputsCache = new Map();
function areaInputs(code) {
  let c = inputsCache.get(code);
  if (c) return c;
  c = { cwr: {}, women11: {}, g: {} };
  for (const g of FIT_GROUPS) {
    // Child-woman ratio from the 2011 Census, the fitting endpoint, exactly as the
    // forward model takes its CWR from its own latest Census.
    let children = 0, women = 0;
    for (let a = 0; a <= 9; a++) children += get(c2011.pop, code, g, "M", a) + get(c2011.pop, code, g, "F", a);
    for (let a = 15; a <= 44; a++) women += get(c2011.pop, code, g, "F", a);
    c.cwr[g] = women > 5 ? children / women / 10 : 0.03;
    c.women11[g] = women;
    c.g[g] = {};
    for (const s of SEXES) {
      const p11 = new Float64Array(MAX_AGE + 1), ccr = new Float64Array(MAX_AGE + 1), cell01 = new Float64Array(MAX_AGE + 1);
      for (let a = 0; a <= MAX_AGE; a++) {
        p11[a] = get(c2011.pop, code, g, s, a);
        cell01[a] = get(c2001.pop, code, g, s, a);
        if (a <= MAX_AGE - 10) ccr[a] = ccrFor(code, g, s, a);
      }
      c.g[g][s] = { p11, ccr, cell01 };
    }
  }
  inputsCache.set(code, c);
  return c;
}

// One ten-year step for one area. randn null means no noise (the deterministic
// test). Returns persons by fitted group, sex and single year of age.
function projectArea(code, randn) {
  const inp = areaInputs(code);
  const cwr = {};
  for (const g of FIT_GROUPS) {
    cwr[g] = inp.cwr[g];
    if (randn) cwr[g] = Math.max(0, cwr[g] + randn() * (CWR_SIGMA_BASE + 0.15 / Math.sqrt(Math.max(inp.women11[g], 1))));
  }

  // One ten-year step, 2011 -> 2021. Cohorts first for both sexes, then births,
  // so male births are not sized off the previous decade's women.
  const next = {};
  for (const g of FIT_GROUPS) {
    next[g] = { M: {}, F: {} };
    for (const s of SEXES) {
      const { p11, ccr: ccrs, cell01 } = inp.g[g][s];
      for (let toAge = 10; toAge <= MAX_AGE; toAge++) {
        const fromAge = toAge - 10;
        let ccr = ccrs[fromAge];
        if (randn) {
          ccr = Math.max(0.01, ccr + randn() * (CCR_SIGMA_BASE + CCR_SIGMA_SMALL_POP / Math.sqrt(Math.max(cell01[fromAge], 1))));
        }
        next[g][s][toAge] = p11[fromAge] * ccr;
      }
      next[g][s][MAX_AGE] = (next[g][s][MAX_AGE] || 0) + p11[MAX_AGE] * 0.3;
    }
  }
  for (const g of FIT_GROUPS) {
    let women = 0;
    for (let a = 15; a <= 44; a++) women += next[g].F[a] || 0;
    const births = women * cwr[g];
    for (const s of SEXES) {
      const ratio = s === "M" ? 0.512 : 0.488;
      for (let a = 0; a <= 9; a++) next[g][s][a] = births * ratio;
    }
  }
  return next;
}

// Cap to the actual 2021 persons: one factor for the area (total), or one per sex
// and single year of age (age-sex), with each cell's ethnic mix kept. A cell with
// people in 2021 and none projected cannot be scaled; it is counted and left empty,
// as the forward model does. count true adds to capCounts (the deterministic pass).
function applyCap(code, next, count) {
  if (CAP_MODE === "none") return;
  const act = actualCounts.get(code);
  if (CAP_MODE === "total") {
    let t = 0;
    for (const g of FIT_GROUPS) for (const s of SEXES) for (let a = 0; a <= MAX_AGE; a++) t += next[g][s][a] || 0;
    if (t <= 0) return;
    const f = act.total / t;
    for (const g of FIT_GROUPS) for (const s of SEXES) for (let a = 0; a <= MAX_AGE; a++) next[g][s][a] = (next[g][s][a] || 0) * f;
    if (count) capCounts.capped++;
    return;
  }
  for (const s of SEXES) for (let a = 0; a <= MAX_AGE; a++) {
    let p = 0;
    for (const g of FIT_GROUPS) p += next[g][s][a] || 0;
    const target = act.ageSex[s][a];
    if (p <= 0) { if (target > 0 && count) capCounts.emptyCells++; continue; }
    for (const g of FIT_GROUPS) next[g][s][a] = (next[g][s][a] || 0) * (target / p);
  }
  if (count) capCounts.capped++;
}

function broadTotals(next) {
  let total = 0;
  const totals = {};
  for (const g of SIMPLE) totals[g] = 0;
  for (const g of FIT_GROUPS) {
    let t = 0;
    for (const s of SEXES) for (let a = 0; a <= MAX_AGE; a++) t += next[g][s][a] || 0;
    totals[toBroad(g)] += t;
    total += t;
  }
  return { totals, total };
}

// Authority type from the code prefix. London is kept apart from the other
// metropolitan boroughs because its migration is unlike anywhere else's.
const TYPES = { E09: "London borough", E08: "Metropolitan borough", E06: "Unitary authority", E07: "Shire district", W06: "Welsh authority" };
function authorityType(code) {
  return TYPES[code.slice(0, 3)] ?? "Other";
}

const results = [];
for (const code of codes) {
  const next = projectArea(code, null);
  applyCap(code, next, true);
  const { totals, total } = broadTotals(next);
  if (total <= 0) continue;

  const actual = actualGroups.get(code);
  const predicted = {};
  for (const g of SIMPLE) predicted[g] = (totals[g] / total) * 100;

  const row = { code, areaName: projections[code]?.areaName ?? null, predicted: {}, actual: {}, error: {} };
  for (const g of SIMPLE) {
    row.predicted[g] = Math.round(predicted[g] * 100) / 100;
    row.actual[g] = actual[g] ?? null;
    row.error[g] = actual[g] != null ? Math.round((predicted[g] - actual[g]) * 100) / 100 : null;
  }
  if (EXTENDED) {
    // Kept off the row unless asked for, so the default output is unchanged.
    row.type = authorityType(code);
    row.predictedCount = Object.fromEntries(SIMPLE.map((g) => [g, Math.round(totals[g])]));
    row.predictedTotal = Math.round(total);
  }
  results.push(row);
}

function stats(key, rows = results) {
  const errs = rows.map((r) => r.error[key]).filter((e) => e != null);
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

const quant = (xs, p) => {
  const sorted = [...xs].sort((a, b) => a - b);
  return sorted[Math.min(sorted.length - 1, Math.floor(p * sorted.length))];
};
const r2 = (v) => (v == null || !Number.isFinite(v) ? null : Math.round(v * 100) / 100);

// Smallest actual count for an area to enter the mean absolute percentage error.
// A percentage error on a group of a few dozen people says nothing about the
// model; the median takes every area.
const MAPE_FLOOR = 1000;

function extendedMeasures() {
  const ext = {
    capMode: CAP_MODE,
    capControl: CAP_MODE === "none" ? null : "actual Census 2021 persons from the --actual base file",
    capCounts: CAP_MODE === "none" ? null : { ...capCounts },
    byType: {},
  };
  const typeNames = [...new Set(results.map((r) => r.type))].sort();
  for (const t of typeNames) {
    const rows = results.filter((r) => r.type === t);
    ext.byType[t] = { n: rows.length, ...Object.fromEntries(SIMPLE.map((g) => [g, stats(g, rows)])) };
  }

  if (!actualFromBase) {
    ext.counts = null;
    ext.dissimilarity = null;
    ext.note = "Count measures and the index of dissimilarity need --actual <2021 base file>.";
    return ext;
  }

  // Percentage error on counts, the measure published benchmarks use. Under
  // either cap the area total equals the actual total by construction (less any
  // empty cells), so the total row is only informative with no cap.
  const ape = (pred, act) => (act > 0 ? Math.abs(pred - act) / act * 100 : null);
  const countSummary = (rows, pick) => {
    const all = rows.map(pick).filter((x) => x && x.ape != null);
    if (!all.length) return null;
    const floored = all.filter((x) => x.act >= MAPE_FLOOR);
    const algebraic = all.map((x) => (x.pred - x.act) / x.act * 100);
    return {
      n: all.length,
      medianAPE: r2(quant(all.map((x) => x.ape), 0.5)),
      p90APE: r2(quant(all.map((x) => x.ape), 0.9)),
      MAPE: floored.length ? r2(floored.reduce((t, x) => t + x.ape, 0) / floored.length) : null,
      nMAPE: floored.length,
      medianALPE: r2(quant(algebraic, 0.5)),
    };
  };
  const pickGroup = (g) => (r) => {
    const act = actualCounts.get(r.code).groups[g];
    return { pred: r.predictedCount[g], act, ape: ape(r.predictedCount[g], act) };
  };
  const pickTotal = (r) => {
    const act = actualCounts.get(r.code).total;
    return { pred: r.predictedTotal, act, ape: ape(r.predictedTotal, act) };
  };
  ext.counts = {
    mapeFloor: MAPE_FLOOR,
    total: countSummary(results, pickTotal),
    byGroup: Object.fromEntries(SIMPLE.map((g) => [g, countSummary(results, pickGroup(g))])),
    byType: Object.fromEntries(typeNames.map((t) => {
      const rows = results.filter((r) => r.type === t);
      return [t, { total: countSummary(rows, pickTotal), white_british: countSummary(rows, pickGroup("white_british")) }];
    })),
  };

  // Index of dissimilarity of each group against everyone else, across the scored
  // areas: half the sum over areas of |g_i / G - r_i / R|. Projected against actual
  // shows whether the step gets each group's spread between areas right, the test
  // ONS's own roll-forward by ethnic group failed on (Simpson, 2014).
  const dissim = (countOf) => {
    const out = {};
    for (const g of SIMPLE) {
      let G = 0, R = 0;
      const parts = results.map((r) => {
        const { gi, ti } = countOf(r, g);
        G += gi; R += ti - gi;
        return { gi, ri: ti - gi };
      });
      out[g] = G > 0 && R > 0 ? parts.reduce((t, p) => t + Math.abs(p.gi / G - p.ri / R), 0) / 2 * 100 : null;
    }
    return out;
  };
  const dPred = dissim((r, g) => ({ gi: r.predictedCount[g], ti: r.predictedTotal }));
  const dAct = dissim((r, g) => ({ gi: actualCounts.get(r.code).groups[g], ti: actualCounts.get(r.code).total }));
  ext.dissimilarity = Object.fromEntries(SIMPLE.map((g) => [g, { actual: r2(dAct[g]), projected: r2(dPred[g]), difference: r2(dPred[g] - dAct[g]) }]));
  return ext;
}

// Band calibration: rerun the step SIMULATIONS times with the published noise rule
// and count how often the actual 2021 White British share falls inside the 80 and
// 95 per cent bands, read with run_stochastic_hp.mjs's percentile rule.
function calibration() {
  const randn = makeRandn(mulberry32(SEED));
  const pct = (sorted, p) => sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * p))];
  const perArea = [];
  for (const r of results) {
    const shares = [];
    for (let i = 0; i < SIMULATIONS; i++) {
      const next = projectArea(r.code, randn);
      applyCap(r.code, next, false);
      const { totals, total } = broadTotals(next);
      shares.push(total > 0 ? totals.white_british / total * 100 : 0);
    }
    shares.sort((a, b) => a - b);
    const b = { p2_5: pct(shares, 0.025), p10: pct(shares, 0.1), p90: pct(shares, 0.9), p97_5: pct(shares, 0.975) };
    const act = r.actual.white_british;
    perArea.push({ code: r.code, type: r.type, in80: act >= b.p10 && act <= b.p90, in95: act >= b.p2_5 && act <= b.p97_5, width80: b.p90 - b.p10, width95: b.p97_5 - b.p2_5 });
  }
  const sum = (rows) => ({
    n: rows.length,
    inside80: r2(rows.filter((x) => x.in80).length / rows.length * 100),
    inside95: r2(rows.filter((x) => x.in95).length / rows.length * 100),
    medianWidth80: r2(quant(rows.map((x) => x.width80), 0.5)),
    medianWidth95: r2(quant(rows.map((x) => x.width95), 0.5)),
  });
  const types = [...new Set(perArea.map((x) => x.type))].sort();
  return {
    group: "white_british",
    simulations: SIMULATIONS,
    seed: SEED,
    noiseRule: "run_stochastic_hp.mjs at horizon scale 1: CCR sigma 0.02 + 0.25 / sqrt(2001 cell), CWR sigma 0.02 + 0.15 / sqrt(2011 women aged 15 to 44)",
    all: sum(perArea),
    byType: Object.fromEntries(types.map((t) => [t, sum(perArea.filter((x) => x.type === t))])),
  };
}

const out = {
  generatedAt: null,
  variant: LABEL,
  grouping: GROUPING,
  settings: { CCR_CEILING, CCR_FLOOR, MIN_BASE, USE_SHRINKAGE, SHRINK_K },
  design:
    "Cohort change ratios fitted on Census 2001 to Census 2011, projected one decade to 2021, " +
    "scored against Census 2021. The fitting window never touches the target, so this is a real " +
    "forecast error rather than the circular backcast. " +
    (GROUPING === "detailed"
      ? "Ratios are fitted at the 16 groups common to all three censuses and scored on the six " +
        "broad groups, the only classification stable across all three."
      : "Ratios are fitted and scored on six broad groups, the only classification stable " +
        "across all three censuses."),
  areasScored: results.length,
  summary,
  areas: results
};
if (!DEFAULT_COVERAGE) {
  // Kept out of the default output so the v8.0 file is unchanged.
  const summedCodes = new Set(successorsSummed.map((s) => s.code));
  for (const r of results) if (summedCodes.has(r.code)) r.basis = "summed 2011 districts in 2001 and 2011";
  out.coverage = {
    countries: COUNTRIES,
    successors: SUCCESSORS,
    actual: actualFromBase ? `2021 base ${path.basename(ACTUAL)} (20 groups summed to six)` : `current.groups of ${path.basename(ACTUAL)}`,
    successorsSummed: successorsSummed.filter((s) => results.some((r) => r.code === s.code)),
    successorGaps,
    estimatedActual: actualFromBase ? Object.keys(actualDoc.estimatedAreas ?? {}).filter((c) => results.some((r) => r.code === c)) : [],
    byCountry: Object.fromEntries(COUNTRIES.map((p) => [p, results.filter((r) => r.code.startsWith(p)).length])),
  };
  out.design +=
    " Coverage extended: " +
    (COUNTRIES.includes("W") ? "Welsh authorities included; " : "") +
    (SUCCESSORS ? "authorities whose code changed after 2011 are scored on the summed counts of their 2011 districts in both ST101 and DC2101EW; " : "") +
    `actual shares from ${out.coverage.actual}.`;
}

if (EXTENDED) {
  out.extended = extendedMeasures();
  if (SIMULATIONS > 0) {
    console.error(`Band calibration: ${SIMULATIONS} simulations per area...`);
    out.extended.calibration = calibration();
  }
  if (CAP_MODE !== "none") {
    out.design +=
      ` Capped (${CAP_MODE}) to the actual Census 2021 persons from the base file: a perfect control, so ` +
      "this scores each cap mode at its best and is not the error a projection capped to a forecast would carry.";
  }
}

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
