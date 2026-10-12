/**
 * Build single-year-of-age ethnic population base from Census 2021 custom dataset.
 *
 * REPLACES IPF. The ONS "Create a custom dataset" provides Census 2021
 * single-year × 20 ethnic groups × sex × 311 LAs as direct observations.
 * No estimation required — every cell is an observed Census count.
 *
 * 20 ethnic groups (ONS codes 1-19):
 *   BAN, CHI, IND, PAK, OAS (Asian subcategories)
 *   BAF, BCA, OBL (Black subcategories)
 *   MWA, MWF, MWC, MOM (Mixed subcategories)
 *   WBI, WIR, WGT, WRO, WHO (White subcategories)
 *   ARB, OOT (Other subcategories)
 *
 * 20 areas are suppressed for disclosure control — identified and listed.
 *
 * Output: data/model/base_single_year_2021.json
 *
 * OPTIONS (12 Oct 2026, for v8.1). With none the output is the v8.0 base,
 * byte for byte (tests/base-builder.test.mjs checks this against the held copy).
 *
 *   --out <file>          20-group output (default data/model/base_single_year_2021.json)
 *   --out-12 <file>       12-group output (default beside --out)
 *   --input <file>        the custom dataset CSV
 *   --include-wales       keep the 19 Welsh authorities the custom dataset holds
 *   --geography 2023      file the April 2023 unitaries (Cumberland, Westmorland
 *                         and Furness, North Yorkshire, Somerset) under their own
 *                         codes: summed from their 2022 districts where every one
 *                         is in the custom dataset, otherwise built by the fallback.
 *                         The 2022 districts are dropped either way.
 *   --fallback rm032      build authorities the custom dataset suppresses (ten
 *                         English, three Welsh) and the 2023 unitaries it cannot
 *                         sum, by iterative proportional fitting: Census 2021 RM032
 *                         (20 groups by 5 age bands by sex) and TS009 (single year
 *                         of age by sex) as margins, seeded with the country's
 *                         observed single-year profile for each group and sex.
 *                         These cells are estimates, not observations, and the
 *                         output lists them under estimatedAreas.
 *   --rm032 <file>, --ts009 <file>   the margin files
 *
 * The script refuses to write through a symlink: data/model/ in a linked
 * checkout points at a held copy other repos read.
 */
import { readFileSync, writeFileSync, mkdirSync, existsSync, lstatSync } from "node:fs";
import path from "node:path";
import { successors2023 } from "./lib/geography.mjs";
import { ipfCell, readRm032, readTs009, RM032_BANDS } from "./lib/rm032-fallback.mjs";

const argv = process.argv.slice(2);
const opt = (name, fallback) => {
  const i = argv.indexOf(`--${name}`);
  return i >= 0 ? argv[i + 1] : fallback;
};
const INCLUDE_WALES = argv.includes("--include-wales");
const GEOGRAPHY = opt("geography", "2022");
const FALLBACK = opt("fallback", "none");
if (!["2022", "2023"].includes(GEOGRAPHY)) throw new Error("--geography: 2022 or 2023");
if (!["none", "rm032"].includes(FALLBACK)) throw new Error("--fallback: none or rm032");
const DEFAULT_RUN = !INCLUDE_WALES && GEOGRAPHY === "2022" && FALLBACK === "none";

const CENSUS_CSV = path.resolve(opt("input", "data/raw/census_single_year/census2021_ethnic_age_sex_la_singleyear.csv"));
const OUTPUT_PATH = path.resolve(opt("out", "data/model/base_single_year_2021.json"));
const OUTPUT_DIR = path.dirname(OUTPUT_PATH);
const OUTPUT_12_PATH = path.resolve(opt("out-12", path.join(OUTPUT_DIR, "base_single_year_2021_12group.json")));
const RM032_PATH = path.resolve(opt("rm032", "data/raw/census_base/rm032_ethnic_age_sex.csv"));
const TS009_PATH = path.resolve(opt("ts009", "data/raw/census_base/ts009_single_year_age_sex.csv"));
for (const p of [OUTPUT_PATH, OUTPUT_12_PATH]) {
  if (existsSync(p) && lstatSync(p).isSymbolicLink()) {
    console.error(`Refusing to write through a symlink: ${p} (pass --out to write elsewhere)`);
    process.exit(2);
  }
}
mkdirSync(OUTPUT_DIR, { recursive: true });
const COUNTRY_PREFIXES = INCLUDE_WALES ? ["E", "W"] : ["E"];

// 20-group ethnic codes (our internal codes)
const ETHNIC_GROUPS_20 = [
  "WBI", "WIR", "WGT", "WRO", "WHO",  // White: British, Irish, Gypsy/Traveller, Roma, Other
  "MWA", "MWF", "MWC", "MOM",          // Mixed: White+Asian, White+Black African, White+Black Caribbean, Other Mixed
  "IND", "PAK", "BAN", "CHI", "OAS",   // Asian: Indian, Pakistani, Bangladeshi, Chinese, Other Asian
  "BAF", "BCA", "OBL",                  // Black: African, Caribbean, Other Black
  "ARB", "OOT"                          // Other: Arab, Any Other
];

// Also define the 12-group backwards-compatible mapping
const MAP_20_TO_12 = {
  WBI: "WBI", WIR: "WIR", WGT: "WHO", WRO: "WHO", WHO: "WHO",
  MWA: "MIX", MWF: "MIX", MWC: "MIX", MOM: "MIX",
  IND: "IND", PAK: "PAK", BAN: "BAN", CHI: "CHI", OAS: "OAS",
  BAF: "BAF", BCA: "BCA", OBL: "OTH",
  ARB: "OTH", OOT: "OTH"
};
const ETHNIC_GROUPS_12 = ["WBI", "WIR", "WHO", "MIX", "IND", "PAK", "BAN", "CHI", "OAS", "BCA", "BAF", "OTH"];

// Map ONS Census CSV ethnic codes (integers) to our 20-group codes
const ONS_CODE_MAP = {
  1: "BAN",   // Bangladeshi
  2: "CHI",   // Chinese
  3: "IND",   // Indian
  4: "PAK",   // Pakistani
  5: "OAS",   // Other Asian
  6: "BAF",   // African
  7: "BCA",   // Caribbean
  8: "OBL",   // Other Black
  9: "MWA",   // White and Asian
  10: "MWF",  // White and Black African
  11: "MWC",  // White and Black Caribbean
  12: "MOM",  // Other Mixed
  13: "WBI",  // English, Welsh, Scottish, Northern Irish or British
  14: "WIR",  // Irish
  15: "WGT",  // Gypsy or Irish Traveller
  16: "WRO",  // Roma
  17: "WHO",  // Other White
  18: "ARB",  // Arab
  19: "OOT"   // Any other ethnic group
};

const SEXES = ["M", "F"];
const AGES = []; for (let a = 0; a <= 90; a++) AGES.push(a);

console.log("Parsing Census 2021 custom dataset (single-year × 20 ethnic × sex × LA)...");
console.log(`  Source: ${CENSUS_CSV}`);

// Use Python-style CSV parsing for robustness with quoted fields
function parseCsvLine(line) {
  const f = []; let c = ""; let q = false;
  for (const ch of line) {
    if (ch === '"') q = !q;
    else if (ch === "," && !q) { f.push(c.trim()); c = ""; }
    else c += ch;
  }
  f.push(c.trim()); return f;
}

const fileContent = readFileSync(CENSUS_CSV, "utf8");
const lines = fileContent.split("\n").filter(l => l.trim());
console.log(`  ${lines.length - 1} data rows`);

// Columns: LA Code, LA Name, Age Code, Age Name, Eth Code, Eth Name, Sex Code, Sex Name, Observation
const result = {};     // code → { eth → { sex → { age → pop, total → sum } } }
const suppressedAreas = new Set();
let rowCount = 0;

for (let i = 1; i < lines.length; i++) {
  const cols = parseCsvLine(lines[i]);
  const laCode = cols[0];
  const ageCode = parseInt(cols[2]);
  const ethCode = parseInt(cols[4]);
  const sexCode = parseInt(cols[6]);
  const observation = parseInt(cols[8]) || 0;

  if (!laCode || !COUNTRY_PREFIXES.some((c) => laCode.startsWith(c))) continue;

  // Map ethnic code
  const eth = ONS_CODE_MAP[ethCode];
  if (!eth) continue; // Skip "Does not apply" (code -8)

  // Map sex
  const sex = sexCode === 1 ? "F" : sexCode === 2 ? "M" : null;
  if (!sex) continue;

  // Map age: 0-89 = individual years, 90-100 = sum into 90+
  let age;
  if (ageCode >= 0 && ageCode <= 89) {
    age = ageCode;
  } else if (ageCode >= 90 && ageCode <= 100) {
    age = 90; // Sum into 90+ bucket
  } else {
    continue;
  }

  // Initialize area/eth/sex structures
  if (!result[laCode]) result[laCode] = {};
  if (!result[laCode][eth]) result[laCode][eth] = {};
  if (!result[laCode][eth][sex]) {
    result[laCode][eth][sex] = {};
    for (const a of AGES) result[laCode][eth][sex][a] = 0;
    result[laCode][eth][sex].total = 0;
  }

  result[laCode][eth][sex][age] += observation;
  result[laCode][eth][sex].total += observation;
  rowCount++;
}

// Compute totals and verify
let areaCodes = Object.keys(result).sort();
let totalPop = 0, totalWBI = 0;
const areaPopulations = {};

for (const code of areaCodes) {
  let areaPop = 0;
  for (const eth of ETHNIC_GROUPS_20) {
    for (const sex of SEXES) {
      const pop = result[code]?.[eth]?.[sex]?.total || 0;
      areaPop += pop;
      totalPop += pop;
      if (eth === "WBI") totalWBI += pop;
    }
  }
  areaPopulations[code] = areaPop;

  // Check for suppressed areas (very low populations across all groups)
  // ONS suppresses 20 areas for disclosure control
  if (areaPop < 1000) {
    suppressedAreas.add(code);
  }
}

// ------------------------------------------------------------------
// v8.1 options: April 2023 geography and the RM032 fallback
// ------------------------------------------------------------------
const aggregatedAreas = {};
const estimatedAreas = {};
const notBuilt = [];
if (!DEFAULT_RUN) {
  const observed = new Set(areaCodes.filter((c) => !suppressedAreas.has(c)));
  const toBuild = new Set();
  if (GEOGRAPHY === "2023") {
    for (const [succ, preds] of Object.entries(successors2023())) {
      const present = preds.filter((p) => observed.has(p));
      if (present.length === preds.length) {
        const sum = {};
        for (const eth of ETHNIC_GROUPS_20) {
          sum[eth] = {};
          for (const sex of SEXES) {
            sum[eth][sex] = {};
            for (const a of AGES) sum[eth][sex][a] = 0;
            sum[eth][sex].total = 0;
            for (const p of preds) {
              for (const a of AGES) sum[eth][sex][a] += result[p]?.[eth]?.[sex]?.[a] || 0;
              sum[eth][sex].total += result[p]?.[eth]?.[sex]?.total || 0;
            }
          }
        }
        result[succ] = sum;
        aggregatedAreas[succ] = { method: "sum of 2022 districts in the custom dataset", predecessors: preds };
      } else {
        toBuild.add(succ);
      }
      for (const p of preds) delete result[p];
    }
  }
  if (FALLBACK === "rm032") {
    const rm032 = readRm032(RM032_PATH);
    const ts009 = readTs009(TS009_PATH);
    // Every RM032 authority of a selected country that the base still lacks.
    // On 2022 geography the 2023 unitaries are left out, because their 2022
    // districts are already in the base.
    const unitaries2023 = new Set(Object.keys(successors2023()));
    for (const code of rm032.keys()) {
      if (!COUNTRY_PREFIXES.some((c) => code.startsWith(c))) continue;
      if (result[code] && !suppressedAreas.has(code)) continue;
      if (GEOGRAPHY === "2022" && unitaries2023.has(code)) continue;
      toBuild.add(code);
    }
    // Seed: the country's observed single-year profile for each group and sex.
    const seeds = {};
    for (const country of COUNTRY_PREFIXES) {
      const donors = [...observed].filter((c) => c.startsWith(country) && result[c]);
      const pool = donors.length ? donors : [...observed].filter((c) => result[c]);
      const seed = {};
      for (const eth of ETHNIC_GROUPS_20) {
        seed[eth] = {};
        for (const sex of SEXES) {
          seed[eth][sex] = AGES.map((a) => pool.reduce((t, c) => t + (result[c]?.[eth]?.[sex]?.[a] || 0), 0));
        }
      }
      seeds[country] = { seed, donors: donors.length ? country : "E" };
    }
    for (const code of [...toBuild].sort()) {
      const margins = rm032.get(code);
      const ages = ts009.get(code);
      if (!margins || !ages) {
        notBuilt.push({ code, reason: !margins ? "not in RM032" : "not in TS009" });
        continue;
      }
      const { seed, donors } = seeds[code[0]] ?? seeds.E;
      const fit = ipfCell(seed, margins, ages, ETHNIC_GROUPS_20, SEXES);
      const area = {};
      for (const eth of ETHNIC_GROUPS_20) {
        area[eth] = {};
        for (const sex of SEXES) {
          area[eth][sex] = {};
          let t = 0;
          for (const a of AGES) {
            const v = Math.round(fit.cells[eth][sex][a] * 10000) / 10000;
            area[eth][sex][a] = v;
            t += v;
          }
          area[eth][sex].total = t;
        }
      }
      result[code] = area;
      suppressedAreas.delete(code);
      estimatedAreas[code] = {
        method: `IPF on Census 2021 RM032 (group by ${RM032_BANDS.length} age bands by sex) and TS009 (single year by sex), seeded with the ${donors === "W" ? "Welsh" : "English"} observed profile; ${fit.iterations} iterations, ending on the RM032 margin`,
        rm032Total: fit.rm032Total,
        ts009Total: fit.ts009Total,
        maxSingleYearGap: Math.round(fit.maxAgeGap * 1000) / 1000,
      };
    }
  } else {
    for (const code of toBuild) notBuilt.push({ code, reason: "2023 unitary without every 2022 district; needs --fallback rm032" });
  }
  areaCodes = Object.keys(result).sort();
  for (const code of areaCodes) {
    let areaPop = 0;
    for (const eth of ETHNIC_GROUPS_20) for (const sex of SEXES) areaPop += result[code]?.[eth]?.[sex]?.total || 0;
    areaPopulations[code] = areaPop;
  }
  console.log(`Options: wales=${INCLUDE_WALES} geography=${GEOGRAPHY} fallback=${FALLBACK}`);
  console.log(`  summed ${Object.keys(aggregatedAreas).length}, estimated ${Object.keys(estimatedAreas).length}, not built ${notBuilt.length}`);
  for (const n of notBuilt) console.log(`  not built: ${n.code} (${n.reason})`);
}

console.log(`\nParsed ${areaCodes.length} areas from Census custom dataset`);
console.log(`Total population: ${totalPop.toLocaleString()}`);
console.log(`WBI: ${totalWBI.toLocaleString()} (${(totalWBI / totalPop * 100).toFixed(1)}%)`);
console.log(`Suppressed areas (pop < 1000): ${suppressedAreas.size}`);

// Also generate a 12-group version for backwards compatibility
const result12 = {};
for (const code of areaCodes) {
  if (suppressedAreas.has(code)) continue;
  result12[code] = {};
  for (const eth20 of ETHNIC_GROUPS_20) {
    const eth12 = MAP_20_TO_12[eth20];
    if (!result12[code][eth12]) {
      result12[code][eth12] = {};
      for (const sex of SEXES) {
        result12[code][eth12][sex] = {};
        for (const a of AGES) result12[code][eth12][sex][a] = 0;
        result12[code][eth12][sex].total = 0;
      }
    }
    for (const sex of SEXES) {
      for (const a of AGES) {
        result12[code][eth12][sex][a] += result[code]?.[eth20]?.[sex]?.[a] || 0;
      }
      result12[code][eth12][sex].total += result[code]?.[eth20]?.[sex]?.total || 0;
    }
  }
}

// Write 20-group output
const output20 = {
  baseYear: 2021,
  source: "Census 2021 custom dataset: single-year-of-age × 20 ethnic groups × sex × 311 LAs. Direct observations — no IPF or estimation.",
  methodology: "ONS 'Create a custom dataset' tool. Every cell is a directly observed Census 2021 count. Ages 90-100 summed into 90+ bucket. No iterative fitting, no seed profiles, no estimation. 20 ethnic groups as defined by ONS Census 2021 classification.",
  ethnicGroups: ETHNIC_GROUPS_20,
  ethnicGroups12: ETHNIC_GROUPS_12,
  map20to12: MAP_20_TO_12,
  ages: AGES,
  areaCount: areaCodes.length - suppressedAreas.size,
  suppressedAreas: [...suppressedAreas],
  areas: {}
};
if (!DEFAULT_RUN) {
  const observedCount = areaCodes.length - suppressedAreas.size - Object.keys(estimatedAreas).length;
  output20.source = `Census 2021 custom dataset (single year of age by 20 ethnic groups by sex), ${observedCount} authorities observed directly${Object.keys(aggregatedAreas).length ? `, of which ${Object.keys(aggregatedAreas).length} April 2023 unitaries are sums of their 2022 districts` : ""}; ${Object.keys(estimatedAreas).length} authorities estimated from Census 2021 RM032 and TS009 by IPF.`;
  output20.methodology = output20.methodology.replace("No iterative fitting, no seed profiles, no estimation. ", "") + " Authorities listed under estimatedAreas are not direct observations: their cells are fitted to RM032 and TS009 margins.";
  output20.options = { includeWales: INCLUDE_WALES, geography: GEOGRAPHY, fallback: FALLBACK };
  output20.aggregatedAreas = aggregatedAreas;
  output20.estimatedAreas = estimatedAreas;
  output20.notBuilt = notBuilt;
}

// Only include non-suppressed areas
for (const code of areaCodes) {
  if (suppressedAreas.has(code)) continue;
  output20.areas[code] = result[code];
}

writeFileSync(OUTPUT_PATH, JSON.stringify(output20), "utf8");
console.log(`\nWritten 20-group base: ${OUTPUT_PATH} (${(JSON.stringify(output20).length / 1e6).toFixed(1)} MB)`);

// Write 12-group backwards-compatible version
const output12Path = OUTPUT_12_PATH;
const output12 = {
  baseYear: 2021,
  source: "Census 2021 custom dataset, aggregated from 20 to 12 groups for backwards compatibility.",
  methodology: "Direct Census observations aggregated: WGT+WRO→WHO, MWA+MWF+MWC+MOM→MIX, OBL+ARB+OOT→OTH.",
  ethnicGroups: ETHNIC_GROUPS_12,
  ages: AGES,
  areaCount: Object.keys(result12).length,
  areas: result12
};

writeFileSync(output12Path, JSON.stringify(output12), "utf8");
console.log(`Written 12-group base: ${output12Path} (${(JSON.stringify(output12).length / 1e6).toFixed(1)} MB)`);

// Spot checks
const bb = output20.areas["E06000008"];
if (bb) {
  console.log("\nBlackburn age pyramid (selected groups, males, selected ages):");
  for (const age of [0, 5, 15, 25, 35, 50, 65, 80]) {
    const wbi = bb.WBI?.M?.[age] || 0;
    const pak = bb.PAK?.M?.[age] || 0;
    const arb = bb.ARB?.M?.[age] || 0;
    const wro = bb.WRO?.M?.[age] || 0;
    console.log(`  Age ${age}: WBI=${wbi} PAK=${pak} ARB=${arb} Roma=${wro}`);
  }
}

// New group totals
console.log("\nNew group national totals:");
const natTotals = {};
for (const code of areaCodes) {
  if (suppressedAreas.has(code)) continue;
  for (const eth of ETHNIC_GROUPS_20) {
    natTotals[eth] = (natTotals[eth] || 0) + (result[code]?.[eth]?.M?.total || 0) + (result[code]?.[eth]?.F?.total || 0);
  }
}
for (const eth of ETHNIC_GROUPS_20) {
  console.log(`  ${eth}: ${(natTotals[eth] || 0).toLocaleString()} (${((natTotals[eth] || 0) / totalPop * 100).toFixed(2)}%)`);
}
