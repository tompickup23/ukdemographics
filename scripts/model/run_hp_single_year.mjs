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
 * METHODOLOGY NOTE on 2011 base:
 * Census 2011 DC2101EW provides 18 ethnic groups (Roma not separate from Gypsy/Traveller)
 * at 21 age bands. We interpolate to single-year using uniform distribution within bands.
 * For Roma (WRO), we split the 2011 Gypsy/Traveller count using 2021 WGT:WRO proportions.
 * Fallback to NEWETHPOP 12-group proportional splitting for areas not in DC2101EW.
 */
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import path from "node:path";
import { loadBase2011 } from "./lib/census-2011-base.mjs";

const BASE_2021_PATH = path.resolve("data/model/base_single_year_2021.json");
const DC2101EW_PATH = path.resolve("data/raw/census_2011_ethnicity_age/dc2101ew_ethnicity_sex_age_la.csv");
const NEWETHPOP_2011 = path.resolve("data/raw/newethpop/extracted/2DataArchive/OutputData/Population/Population2011_LEEDS2.csv");
const SNPP_PATH = path.resolve("data/raw/snpp/2022 SNPP Population persons.csv");
const SCHOOL_VALIDATION_PATH = path.resolve("src/data/live/school-validation.json");
// The published file by default. Override to run the model without touching what
// the site serves, which is how you compare a code change against the live
// output before deciding to publish it:
//   HP_OUTPUT=/tmp/candidate.json node scripts/model/run_hp_single_year.mjs
// The script merges into the existing published file, so the base is always read
// from src/data/live/ regardless of where the result is written.
const SITE_INPUT = path.resolve("src/data/live/ethnic-projections.json");
const SITE_OUTPUT = process.env.HP_OUTPUT
  ? path.resolve(process.env.HP_OUTPUT)
  : SITE_INPUT;

const base2021 = JSON.parse(readFileSync(BASE_2021_PATH, "utf8"));
const ETHNIC_GROUPS = base2021.ethnicGroups; // 20 groups
const AGES = base2021.ages;
const SEXES = ["M", "F"];

// Map NEWETHPOP 12-group codes to parent groups for splitting
const NEWETHPOP_TO_CHILDREN = {
  WBI: ["WBI"],
  WIR: ["WIR"],
  WHO: ["WGT", "WRO", "WHO"],  // Gypsy/Traveller, Roma, Other White
  MIX: ["MWA", "MWF", "MWC", "MOM"],  // 4 Mixed subcategories
  IND: ["IND"],
  PAK: ["PAK"],
  BAN: ["BAN"],
  CHI: ["CHI"],
  OAS: ["OAS"],
  BLA: ["BAF"],  // NEWETHPOP uses BLA for African
  BLC: ["BCA"],  // NEWETHPOP uses BLC for Caribbean
  OBL: ["OBL"],
  OTH: ["ARB", "OOT"]  // Arab + Other
};

function parseCsvLine(line) {
  const f = []; let c = ""; let q = false;
  for (const ch of line) { if (ch === '"') q = !q; else if (ch === "," && !q) { f.push(c.trim()); c = ""; } else c += ch; }
  f.push(c.trim()); return f;
}

// The 2011 base now comes from scripts/model/lib/census-2011-base.mjs, shared
// with run_stochastic_hp.mjs. The two scripts each had their own copy and the
// stochastic one read a different source, which made the uncertainty bands
// describe a different model from the projections they were drawn around.
const { pop2011, areas2011 } = loadBase2011(base2021, ETHNIC_GROUPS, SEXES);

// ============================================================
// Compute single-year CCRs: Pop(age+10, 2021) / Pop(age, 2011)
// ============================================================
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
const USE_SHRINKAGE = process.env.CCR_SHRINKAGE !== "0";
const SHRINK_K = Number(process.env.CCR_SHRINK_K ?? 25);
const CCR_CEILING = Number(process.env.CCR_CEILING ?? 1.65);
const CCR_FLOOR = Number(process.env.CCR_FLOOR ?? 0.05);

const nationalCCRs = new Map(); // "eth|sex|fromAge" -> pop-weighted national ratio
if (USE_SHRINKAGE) {
  const num = new Map(), den = new Map();
  for (const code of areaCodes) {
    for (const eth of ETHNIC_GROUPS) {
      for (const sex of SEXES) {
        for (let fromAge = 0; fromAge <= 80; fromAge++) {
          const key = `${eth}|${sex}|${fromAge}`;
          num.set(key, (num.get(key) || 0) + (base2021.areas[code][eth]?.[sex]?.[fromAge + 10] || 0));
          den.set(key, (den.get(key) || 0) + (pop2011.get(`${code}|${eth}|${sex}|${fromAge}`) || 0));
        }
      }
    }
  }
  for (const [key, n] of num) {
    const d = den.get(key) || 0;
    nationalCCRs.set(key, d > 5 ? Math.max(CCR_FLOOR, Math.min(CCR_CEILING, n / d)) : 1.0);
  }
  console.log(`  shrinkage on, K=${SHRINK_K}, ${nationalCCRs.size} national CCRs`);
}

const ccrs = new Map();
const cwrs = new Map();

for (const code of areaCodes) {
  for (const eth of ETHNIC_GROUPS) {
    // CWR: children / women of childbearing age
    let children = 0, women = 0;
    for (let age = 0; age <= 9; age++) {
      children += (base2021.areas[code][eth]?.M?.[age] || 0) + (base2021.areas[code][eth]?.F?.[age] || 0);
    }
    for (let age = 15; age <= 44; age++) {
      women += base2021.areas[code][eth]?.F?.[age] || 0;
    }
    cwrs.set(`${code}|${eth}`, women > 5 ? children / women / 10 : 0.03);

    for (const sex of SEXES) {
      for (let fromAge = 0; fromAge <= 80; fromAge++) {
        const toAge = fromAge + 10;
        const pop11 = pop2011.get(`${code}|${eth}|${sex}|${fromAge}`) || 0;
        const pop21 = base2021.areas[code][eth]?.[sex]?.[toAge] || 0;

        let ccr;
        if (USE_SHRINKAGE) {
          const nat = nationalCCRs.get(`${eth}|${sex}|${fromAge}`) ?? 1.0;
          const local = pop11 > 0 ? pop21 / pop11 : nat;
          ccr = (pop11 * local + SHRINK_K * nat) / (pop11 + SHRINK_K);
          ccr = Math.max(CCR_FLOOR, Math.min(CCR_CEILING, ccr));
        } else if (pop11 > 5) {
          ccr = pop21 / pop11;
          ccr = Math.max(CCR_FLOOR, Math.min(CCR_CEILING, ccr));
        } else {
          ccr = 1.0;
        }
        ccrs.set(`${code}|${eth}|${sex}|${fromAge}`, ccr);
      }
    }
  }
}

// Brexit adjustment: WHO only (not WGT/WRO which are domestic populations).
//
// This is a judgement, not an observation, and it is the one adjustment the
// out-of-sample test cannot referee: the test fits 2001 to 2011 and forecasts
// 2021, so "post-Brexit" sits inside its target window rather than beyond it.
//
// What the test does say is that the model already UNDER-projects White Other,
// by -0.87pp. Damping White Other growth further pushes in the same direction as
// an error the model is already making. Set BREXIT_DAMP=0 to run without it.
const APPLY_BREXIT_DAMP = process.env.BREXIT_DAMP !== "0";
let brexitAdjusted = 0;
if (APPLY_BREXIT_DAMP) for (const code of areaCodes) {
  for (const sex of SEXES) {
    for (let fromAge = 10; fromAge <= 34; fromAge++) {
      const key = `${code}|WHO|${sex}|${fromAge}`;
      const ccr = ccrs.get(key);
      if (ccr && ccr > 1.0) {
        ccrs.set(key, 1.0 + (ccr - 1.0) * 0.85);
        brexitAdjusted++;
      }
    }
  }
}
console.log(`  Brexit-adjusted ${brexitAdjusted} WHO CCRs (ages 20-44, -15% growth)`);
console.log(`  ${ccrs.size} CCRs, ${cwrs.size} CWRs`);

// ============================================================
// DfE School Census Calibration
// ============================================================
console.log("\nDfE school census calibration...");
let schoolData = null;
try {
  schoolData = JSON.parse(readFileSync(SCHOOL_VALIDATION_PATH, "utf8"));
} catch (e) {
  console.log("  WARNING: school-validation.json not found. Skipping calibration.");
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
// Then apply a damped version (20% of the gap) to CCRs for ages 0-15.
// This is conservative — we only partially trust the school signal because:
// 1. School enrollment ≠ resident population (cross-boundary attendance)
// 2. Unclassified pupils (~3-5%) introduce noise
// 3. Only 3-year gap, so change should be small

const CALIBRATION_GROUPS = {
  "white_british": ["WBI"],
  "white_other": ["WIR", "WGT", "WRO", "WHO"],
  "asian": ["IND", "PAK", "BAN", "CHI", "OAS"],
  "black": ["BAF", "BCA", "OBL"],
  "mixed": ["MWA", "MWF", "MWC", "MOM"],
  "other": ["ARB", "OOT"]
};

let calibratedAreas = 0;
if (schoolData?.areas) {
  for (const sv of schoolData.areas) {
    const code = sv.areaCode;
    if (!base2021.areas[code]) continue;

    for (const [group, ethCodes] of Object.entries(CALIBRATION_GROUPS)) {
      const comparison = sv.comparison?.[group];
      if (!comparison?.censusChildPct || !comparison?.schoolPct) continue;

      // Gap between school observation and Census child population
      const gapPp = comparison.gapPp; // schoolPct - censusChildPct
      if (Math.abs(gapPp) < 1.5) continue; // Only calibrate significant gaps

      // Damped calibration: adjust CCRs by 20% of the gap
      // A 10pp gap → 2pp adjustment to the group's share
      const dampFactor = 0.2;
      const adjustment = 1 + (gapPp / 100) * dampFactor;

      // Apply to young-cohort CCRs (ages 0-15) for all eth codes in this group
      for (const eth of ethCodes) {
        for (const sex of SEXES) {
          for (let fromAge = 0; fromAge <= 5; fromAge++) {
            const key = `${code}|${eth}|${sex}|${fromAge}`;
            const ccr = ccrs.get(key);
            if (ccr) {
              const newCcr = Math.max(CCR_FLOOR, Math.min(CCR_CEILING, ccr * adjustment));
              ccrs.set(key, newCcr);
            }
          }
        }
      }
    }
    calibratedAreas++;
  }
  console.log(`  Calibrated ${calibratedAreas} areas using DfE school data (20% damping, ages 0-5 CCRs)`);
} else {
  console.log("  No school data available for calibration.");
}

// ============================================================
// Parse SNPP
// ============================================================
console.log("Parsing SNPP...");
const snppTotals = new Map();
const snppLines = readFileSync(SNPP_PATH, "utf8").split("\n").filter(l => l.trim());
const snppHeader = parseCsvLine(snppLines[0]);
const yearCols = snppHeader.slice(5);

for (let i = 1; i < snppLines.length; i++) {
  const cols = parseCsvLine(snppLines[i]);
  const code = cols[0]; if (!code?.startsWith("E")) continue;
  if (cols[4] !== "All ages") continue;
  if (!snppTotals.has(code)) { snppTotals.set(code, {}); }
  for (let j = 0; j < yearCols.length; j++) {
    const v = parseFloat(cols[5 + j]);
    if (!isNaN(v)) snppTotals.get(code)[yearCols[j]] = v;
  }
}
console.log(`  ${snppTotals.size} areas`);

// ============================================================
// PROJECT FORWARD: 10-year steps using single-year CCRs
// ============================================================
console.log("\nProjecting...");
const PROJ_YEARS = [2031, 2041, 2051, 2061];
const projections = {};

for (const code of areaCodes) {
  const timeline = {};

  // 2021 baseline
  let total2021 = 0;
  const eth2021 = {};
  for (const eth of ETHNIC_GROUPS) {
    eth2021[eth] = 0;
    for (const sex of SEXES) {
      eth2021[eth] += base2021.areas[code][eth]?.[sex]?.total || 0;
    }
    total2021 += eth2021[eth];
  }
  timeline[2021] = { total: total2021, eth: eth2021 };

  // Current population matrix
  let currentPop = {};
  for (const eth of ETHNIC_GROUPS) {
    currentPop[eth] = {};
    for (const sex of SEXES) {
      currentPop[eth][sex] = {};
      for (const age of AGES) {
        currentPop[eth][sex][age] = base2021.areas[code][eth]?.[sex]?.[age] || 0;
      }
    }
  }

  for (const year of PROJ_YEARS) {
    const newPop = {};

    // Pass 1: advance every surviving cohort for BOTH sexes.
    // Births must not be computed inside this loop: the female 15-44 population
    // that drives them does not exist until the "F" iteration has run, so a
    // births block here sizes male births off the PREVIOUS step's women.
    for (const eth of ETHNIC_GROUPS) {
      newPop[eth] = {};
      for (const sex of SEXES) {
        newPop[eth][sex] = {};

        // Apply CCRs
        for (let toAge = 10; toAge <= 90; toAge++) {
          const fromAge = toAge - 10;
          const ccr = ccrs.get(`${code}|${eth}|${sex}|${fromAge}`) || 1.0;
          newPop[eth][sex][toAge] = Math.round((currentPop[eth][sex][fromAge] || 0) * ccr);
        }

        // 90+ survivors
        newPop[eth][sex][90] = (newPop[eth][sex][90] || 0) +
          Math.round((currentPop[eth][sex][90] || 0) * 0.3);
      }
    }

    // Pass 2: births (ages 0-9), driven by the projected women of this step.
    for (const eth of ETHNIC_GROUPS) {
      const cwr = cwrs.get(`${code}|${eth}`) || 0.03;
      let women = 0;
      for (let age = 15; age <= 44; age++) {
        women += newPop[eth].F[age] || 0;
      }
      const birthsPerYear = women * cwr;
      for (const sex of SEXES) {
        const sexRatio = sex === "M" ? 0.512 : 0.488;
        for (let age = 0; age <= 9; age++) {
          newPop[eth][sex][age] = Math.round(birthsPerYear * sexRatio);
        }
      }
    }

    // SNPP constraint
    let snppTarget;
    if (year <= 2047) {
      snppTarget = snppTotals.get(code)?.[String(year)];
    } else {
      const s43 = snppTotals.get(code)?.["2043"];
      const s47 = snppTotals.get(code)?.["2047"];
      if (s43 && s47 && s43 > 0) {
        const annualGrowth = (s47 - s43) / 4;
        snppTarget = s47 + annualGrowth * (year - 2047);
        if (snppTarget < 0) snppTarget = s47;
      } else {
        snppTarget = snppTotals.get(code)?.["2047"];
      }
    }
    if (snppTarget && snppTarget > 0) {
      let modelTotal = 0;
      for (const eth of ETHNIC_GROUPS) for (const sex of SEXES) for (const age of AGES) {
        modelTotal += newPop[eth][sex][age] || 0;
      }
      if (modelTotal > 0) {
        const scale = snppTarget / modelTotal;
        if (scale > 0.3 && scale < 3.0) {
          for (const eth of ETHNIC_GROUPS) for (const sex of SEXES) for (const age of AGES) {
            newPop[eth][sex][age] = Math.round((newPop[eth][sex][age] || 0) * scale);
          }
        }
      }
    }

    // Summarize
    let total = 0;
    const eth = {};
    for (const e of ETHNIC_GROUPS) {
      eth[e] = 0;
      for (const s of SEXES) for (const a of AGES) eth[e] += newPop[e][s][a] || 0;
      total += eth[e];
    }
    timeline[year] = { total, eth };
    currentPop = newPop;
  }

  projections[code] = timeline;
}

console.log(`Projected ${Object.keys(projections).length} areas`);

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

existing.methodology = "Hamilton-Perry v8.0 single-year-of-age model with 20 ethnic groups. Census 2021 base from ONS custom dataset (direct observations, no IPF). Census 2011 base from DC2101EW (18 groups, 21 age bands, interpolated to single-year; Roma split from Gypsy/Traveller using 2021 proportions). 91 age groups x 20 ethnic groups x 2 sexes. SNPP 2022-based envelope constraint (linear extrapolation beyond 2047). Cohort change ratios shrunk toward the national ratio by cell size (K=25) with a growth ceiling of 1.65 per decade, both selected on an out-of-sample test that fits 2001 to 2011 and forecasts 2021 at 16 ethnic groups: MAE 1.56pp on the White British share across 285 areas, bias +0.05pp. The previous settings (freeze at a 2011 base of five or fewer, ceiling 5.0) scored MAE 2.82pp with a bias of -2.13pp on the same test. Brexit WHO adjustment (-15% growth ages 10-34). DfE School Census 2024/25 calibration (20% damped adjustment for ages 0-5). Monte Carlo stochastic: 1000 simulations, sharing this model\u0027s ratio settings and population envelope. The stochastic run does not apply the School Census calibration, so a minority of areas disagree at the margin and their bands are withheld rather than drawn."
existing.modelVersion = "8.0-out-of-sample-calibrated";
existing.lastUpdated = new Date().toISOString().slice(0, 10);

writeFileSync(SITE_OUTPUT, JSON.stringify(existing, null, 2), "utf8");
console.log("Written ethnic-projections.json");
