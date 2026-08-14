/**
 * The 2011 population base, shared by every script that needs it.
 *
 * This exists because run_hp_single_year.mjs and run_stochastic_hp.mjs each had
 * their own. The deterministic model preferred Census 2011 DC2101EW (18 observed
 * groups) and fell back to NEWETHPOP; the stochastic read NEWETHPOP only, while
 * its own header comment claimed DC2101EW. Cohort change ratios are the 2021
 * population over the 2011 population, so a different 2011 base is a different
 * model, and the uncertainty bands were therefore drawn around a projection they
 * did not describe.
 *
 * That was the last and largest of four structural differences between the two
 * runs. It was isolated by running one simulation with the noise switched off,
 * which must reproduce the deterministic projection exactly and did not.
 *
 * Both scripts now call this. Neither has its own copy to drift.
 */
import { readFileSync, existsSync } from "node:fs";
import path from "node:path";

const DC2101EW_PATH = path.resolve("data/raw/census_2011_ethnicity_age/dc2101ew_ethnicity_sex_age_la.csv");
const NEWETHPOP_2011 = path.resolve("data/raw/newethpop/extracted/2DataArchive/OutputData/Population/Population2011_LEEDS2.csv");

const DC_ETH_MAP = {
  "2": "WBI", "3": "WIR", "4": "WGT", "5": "WHO",
  "7": "MWC", "8": "MWF", "9": "MWA", "10": "MOM",
  "12": "IND", "13": "PAK", "14": "BAN", "15": "CHI", "16": "OAS",
  "18": "BAF", "19": "BCA", "20": "OBL",
  "22": "ARB", "23": "OOT"
};
const AGE_BANDS = {
  "1": [0, 4], "2": [5, 7], "3": [8, 9], "4": [10, 14], "5": [15, 15],
  "6": [16, 17], "7": [18, 19], "8": [20, 24], "9": [25, 29], "10": [30, 34],
  "11": [35, 39], "12": [40, 44], "13": [45, 49], "14": [50, 54], "15": [55, 59],
  "16": [60, 64], "17": [65, 69], "18": [70, 74], "19": [75, 79], "20": [80, 84],
  "21": [85, 90]
};
const NEWETHPOP_TO_CHILDREN = {
  WBI: ["WBI"], WIR: ["WIR"], WHO: ["WGT", "WRO", "WHO"],
  MIX: ["MWA", "MWF", "MWC", "MOM"],
  IND: ["IND"], PAK: ["PAK"], BAN: ["BAN"], CHI: ["CHI"], OAS: ["OAS"],
  BLA: ["BAF"], BLC: ["BCA"], OBL: ["OBL"], OTH: ["ARB", "OOT"]
};

function parseCsvLine(line) {
  const f = []; let c = ""; let q = false;
  for (const ch of line) { if (ch === '"') q = !q; else if (ch === "," && !q) { f.push(c.trim()); c = ""; } else c += ch; }
  f.push(c.trim()); return f;
}

function distribute5YearBand(total, startAge) {
  if (startAge === 0) return [0.22, 0.21, 0.20, 0.19, 0.18].map(w => total * w);
  return [0.19, 0.20, 0.22, 0.20, 0.19].map(w => total * w);
}

/**
 * @param {object} base2021       parsed data/model/base_single_year_2021.json
 * @param {string[]} ETHNIC_GROUPS the 20 group codes
 * @param {string[]} SEXES         ["M", "F"]
 * @returns {{ pop2011: Map, areas2011: Set }}
 */
export function loadBase2011(base2021, ETHNIC_GROUPS, SEXES) {
  // ============================================================
  // Parse Census 2011 DC2101EW (18 groups, 21 age bands) → single-year
  // ============================================================
  const dc2101ewLoaded = new Map(); // "code|eth20|sex|age" → pop

  // Map DC2101EW ethnic codes to our 20-group codes


  // Age band definitions for interpolation: code → [startAge, endAge (inclusive)]


  // Beers ordinary interpolation weights for 5-year age bands
  // These distribute a 5-year total into single years using information from
  // adjacent bands. Weights sum to 1.0 for the central band.
  // Simplified form: uses only the current band (no adjacent band data since
  // we process bands independently). For proper Beers we'd need the full
  // sequence of 5-year bands — but for bands < 5 years, uniform is correct.
  // For 5-year bands, we use a mild parabolic distribution that concentrates
  // slightly more population in the middle ages (demographic convention for
  // young cohorts where births create a declining profile within 0-4).


  if (existsSync(DC2101EW_PATH)) {
    console.log("Loading Census 2011 DC2101EW (18 groups, 21 age bands)...");
    const dcLines = readFileSync(DC2101EW_PATH, "utf8").split("\n").filter(l => l.trim());
    console.log(`  ${dcLines.length - 1} data rows`);

    for (let i = 1; i < dcLines.length; i++) {
      const cols = parseCsvLine(dcLines[i]);
      if (cols.length < 9) continue;
      const laCode = cols[0];
      const ethCode = cols[2];
      const sexCode = cols[4];
      const ageCode = cols[6];
      const count = parseInt(cols[8]) || 0;

      if (!laCode?.startsWith("E")) continue;
      const eth20 = DC_ETH_MAP[ethCode];
      if (!eth20) continue;
      const sex = sexCode === "1" ? "M" : "F";
      const band = AGE_BANDS[ageCode];
      if (!band) continue;

      // Distribute band count across single years
      const bandWidth = band[1] - band[0] + 1;

      if (bandWidth === 5) {
        // Use demographic distribution for 5-year bands
        const distributed = distribute5YearBand(count, band[0]);
        for (let i = 0; i < bandWidth && (band[0] + i) <= 90; i++) {
          const key = `${laCode}|${eth20}|${sex}|${band[0] + i}`;
          dc2101ewLoaded.set(key, (dc2101ewLoaded.get(key) || 0) + distributed[i]);
        }
      } else {
        // Uniform distribution for short bands (1-3 years)
        const perYear = count / bandWidth;
        for (let age = band[0]; age <= band[1] && age <= 90; age++) {
          const key = `${laCode}|${eth20}|${sex}|${age}`;
          dc2101ewLoaded.set(key, (dc2101ewLoaded.get(key) || 0) + perYear);
        }
      }
    }

    const dcAreas = new Set([...dc2101ewLoaded.keys()].map(k => k.split("|")[0]));
    console.log(`  ${dcAreas.size} areas loaded from DC2101EW`);

    // Handle Roma (WRO) — not separate in 2011, was part of Gypsy/Traveller (WGT)
    // Split 2011 WGT into WGT + WRO using 2021 proportions
    let romaSplitCount = 0;
    for (const code of dcAreas) {
      for (const sex of SEXES) {
        for (let age = 0; age <= 90; age++) {
          const wgtKey = `${code}|WGT|${sex}|${age}`;
          const wgtPop = dc2101ewLoaded.get(wgtKey) || 0;
          if (wgtPop <= 0) continue;

          // Get 2021 WGT:WRO proportions for this cell
          const wgt2021 = base2021.areas[code]?.WGT?.[sex]?.[age] || 0;
          const wro2021 = base2021.areas[code]?.WRO?.[sex]?.[age] || 0;
          const total2021 = wgt2021 + wro2021;

          if (total2021 > 0 && wro2021 > 0) {
            const wroShare = wro2021 / total2021;
            dc2101ewLoaded.set(wgtKey, wgtPop * (1 - wroShare));
            dc2101ewLoaded.set(`${code}|WRO|${sex}|${age}`, wgtPop * wroShare);
            romaSplitCount++;
          }
          // If no 2021 Roma data, all stays in WGT (WRO = 0 for this area)
        }
      }
    }
    console.log(`  Roma split: ${romaSplitCount} cells split from WGT → WGT + WRO`);
  } else {
    console.log("DC2101EW not found — will use NEWETHPOP only");
  }

  // ============================================================
  // Parse NEWETHPOP 2011 base (12 groups) and split to 20 (fallback)
  // ============================================================
  console.log("Parsing NEWETHPOP 2011 base (12 groups)...");
  const pop2011_12 = new Map(); // "code|eth12|sex|age" → pop
  const lines2011 = readFileSync(NEWETHPOP_2011, "utf8").split("\n").filter(l => l.trim());

  for (let i = 1; i < lines2011.length; i++) {
    const cols = parseCsvLine(lines2011[i]);
    const rawCode = cols[2], eth = cols[3];
    if (!rawCode) continue;
    const codes = rawCode.split("+");

    for (const code of codes) {
      for (let age = 0; age <= 90; age++) {
        let mVal, fVal;
        if (age < 90) {
          mVal = parseFloat(cols[4 + age]) || 0;
          fVal = parseFloat(cols[105 + age]) || 0;
        } else {
          mVal = 0; fVal = 0;
          for (let a = 90; a <= 100; a++) {
            mVal += parseFloat(cols[4 + a]) || 0;
            fVal += parseFloat(cols[105 + a]) || 0;
          }
        }
        pop2011_12.set(`${code}|${eth}|M|${age}`, (pop2011_12.get(`${code}|${eth}|M|${age}`) || 0) + mVal / codes.length);
        pop2011_12.set(`${code}|${eth}|F|${age}`, (pop2011_12.get(`${code}|${eth}|F|${age}`) || 0) + fVal / codes.length);
      }
    }
  }
  const areas2011 = new Set([...pop2011_12.keys()].map(k => k.split("|")[0]));
  console.log(`  ${areas2011.size} areas (12-group)`);

  // Build unified pop2011 map: prefer DC2101EW (18-group direct), fallback to NEWETHPOP (12→20 split)
  console.log("Building unified 2011 base (DC2101EW preferred, NEWETHPOP fallback)...");
  const pop2011 = new Map(); // "code|eth20|sex|age" → pop
  let dcUsed = 0, newethpopUsed = 0;

  for (const code of Object.keys(base2021.areas)) {
    // Check if this area has DC2101EW data
    const hasDC = dc2101ewLoaded.size > 0 && dc2101ewLoaded.has(`${code}|WBI|M|0`);

    if (hasDC) {
      // Use DC2101EW data directly (18 groups → 20 with Roma split already done)
      for (const eth of ETHNIC_GROUPS) {
        for (const sex of SEXES) {
          for (let age = 0; age <= 90; age++) {
            const val = dc2101ewLoaded.get(`${code}|${eth}|${sex}|${age}`) || 0;
            pop2011.set(`${code}|${eth}|${sex}|${age}`, val);
          }
        }
      }
      dcUsed++;
    } else if (areas2011.has(code)) {
      // Fallback: NEWETHPOP 12-group split to 20
      for (const sex of SEXES) {
        for (let age = 0; age <= 90; age++) {
          for (const [parentEth, children] of Object.entries(NEWETHPOP_TO_CHILDREN)) {
            const parentPop2011 = pop2011_12.get(`${code}|${parentEth}|${sex}|${age}`) || 0;
            if (parentPop2011 <= 0) {
              for (const child of children) pop2011.set(`${code}|${child}|${sex}|${age}`, 0);
              continue;
            }
            if (children.length === 1) {
              pop2011.set(`${code}|${children[0]}|${sex}|${age}`, parentPop2011);
              continue;
            }
            let parentTotal2021 = 0;
            for (const child of children) parentTotal2021 += base2021.areas[code]?.[child]?.[sex]?.[age] || 0;
            if (parentTotal2021 <= 0) {
              for (const child of children) pop2011.set(`${code}|${child}|${sex}|${age}`, parentPop2011 / children.length);
            } else {
              for (const child of children) {
                const share = (base2021.areas[code]?.[child]?.[sex]?.[age] || 0) / parentTotal2021;
                pop2011.set(`${code}|${child}|${sex}|${age}`, parentPop2011 * share);
              }
            }
          }
        }
      }
      newethpopUsed++;
    }
  }
  console.log(`  DC2101EW: ${dcUsed} areas | NEWETHPOP fallback: ${newethpopUsed} areas | Total cells: ${pop2011.size}`);
  return { pop2011, areas2011 };
}
