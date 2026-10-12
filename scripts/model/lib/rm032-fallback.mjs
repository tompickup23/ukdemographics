/**
 * The fallback base for authorities the Census 2021 custom dataset suppresses.
 *
 * The custom dataset (single year of age by 20 ethnic groups by sex) has no rows
 * for ten English and three Welsh authorities: ONS withholds them for disclosure
 * control. Census 2021 RM032 gives the same 20 groups by five broad age bands
 * and sex for every authority, and TS009 gives single year of age by sex. A
 * single-year table for one of these authorities is fitted to both by iterative
 * proportional fitting (IPF), starting from the country's observed profile for
 * each group and sex. The result matches RM032 exactly (the last step fits it)
 * and TS009 closely; the two tables are separately perturbed by ONS, so they
 * cannot both be met exactly.
 */
import { readFileSync } from "node:fs";
import { parseCsvLine } from "./snpp.mjs";

export const RM032_BANDS = [
  { label: "Aged 24 years and under", from: 0, to: 24 },
  { label: "Aged 25 to 34 years", from: 25, to: 34 },
  { label: "Aged 35 to 49 years", from: 35, to: 49 },
  { label: "Aged 50 to 64 years", from: 50, to: 64 },
  { label: "Aged 65 years and over", from: 65, to: 90 },
];

// RM032 group names, matched on the text after the category prefix.
const GROUPS = {
  Bangladeshi: "BAN", Chinese: "CHI", Indian: "IND", "Other Asian": "OAS", Pakistani: "PAK",
  African: "BAF", Caribbean: "BCA", "Other Black": "OBL",
  "Other Mixed or Multiple ethnic groups": "MOM", "White and Asian": "MWA",
  "White and Black African": "MWF", "White and Black Caribbean": "MWC",
  "Any other ethnic group": "OOT", Arab: "ARB",
  "English, Welsh, Scottish, Northern Irish or British": "WBI", "Gypsy or Irish Traveller": "WGT",
  Irish: "WIR", "Other White": "WHO", Roma: "WRO",
};

function csv(file) {
  const lines = readFileSync(file, "utf8").replace(/^﻿/, "").split(/\r?\n/).filter((l) => l.trim());
  const header = parseCsvLine(lines[0]).map((h) => h.replace(/^"|"$/g, ""));
  const col = (name) => {
    const i = header.indexOf(name);
    if (i < 0) throw new Error(`${file}: header "${name}" missing`);
    return i;
  };
  return { rows: lines.slice(1).map(parseCsvLine), col };
}

const sexCode = (s) => (/^male/i.test(s) ? "M" : /^female/i.test(s) ? "F" : null);

/** code -> { [eth]: { M: number[5], F: number[5] } } */
export function readRm032(file) {
  const { rows, col } = csv(file);
  const c = col("GEOGRAPHY_CODE"), e = col("C2021_ETH_20_NAME"), a = col("C2021_AGE_6_NAME"), s = col("C_SEX_NAME"), v = col("OBS_VALUE");
  const out = new Map();
  for (const r of rows) {
    const name = r[e].split(": ").slice(1).join(": ");
    const eth = GROUPS[name];
    if (!eth) {
      if (/^Total|Does not apply/i.test(r[e])) continue;
      throw new Error(`${file}: unknown group "${r[e]}"`);
    }
    const band = RM032_BANDS.findIndex((b) => b.label === r[a]);
    if (band < 0) {
      if (/^Total/i.test(r[a])) continue;
      throw new Error(`${file}: unknown age band "${r[a]}"`);
    }
    const sex = sexCode(r[s]);
    if (!sex) throw new Error(`${file}: unknown sex "${r[s]}"`);
    if (!out.has(r[c])) out.set(r[c], {});
    const area = out.get(r[c]);
    area[eth] ??= { M: [0, 0, 0, 0, 0], F: [0, 0, 0, 0, 0] };
    area[eth][sex][band] += Number(r[v]);
  }
  return out;
}

/** code -> { M: number[91], F: number[91] } */
export function readTs009(file) {
  const { rows, col } = csv(file);
  const c = col("GEOGRAPHY_CODE"), a = col("C2021_AGE_92_NAME"), s = col("C_SEX_NAME"), v = col("OBS_VALUE");
  const out = new Map();
  for (const r of rows) {
    const label = r[a];
    let age;
    if (/^Aged under 1 year$/i.test(label)) age = 0;
    else if (/^Aged 90 years and over$/i.test(label)) age = 90;
    else if (/^Aged (\d+) years?$/i.test(label)) age = Number(label.match(/\d+/)[0]);
    else if (/^Total/i.test(label)) continue;
    else throw new Error(`${file}: unknown age "${label}"`);
    const sex = sexCode(r[s]);
    if (!sex) throw new Error(`${file}: unknown sex "${r[s]}"`);
    if (!out.has(r[c])) out.set(r[c], { M: new Array(91).fill(0), F: new Array(91).fill(0) });
    out.get(r[c])[sex][age] += Number(r[v]);
  }
  return out;
}

/**
 * Fit one authority. seed[eth][sex] is a 91-long profile; margins is its RM032
 * record; ages its TS009 record. Returns fitted cells and fit diagnostics.
 */
export function ipfCell(seed, margins, ages, groups, sexes, iterations = 100) {
  const cells = {};
  for (const eth of groups) {
    cells[eth] = {};
    for (const sex of sexes) cells[eth][sex] = seed[eth][sex].map((v) => (v > 0 ? v : 1e-9));
  }
  for (let it = 0; it < iterations; it++) {
    // Single year of age by sex (TS009).
    for (const sex of sexes) {
      for (let a = 0; a <= 90; a++) {
        let s = 0;
        for (const eth of groups) s += cells[eth][sex][a];
        const f = s > 0 ? ages[sex][a] / s : 0;
        for (const eth of groups) cells[eth][sex][a] *= f;
      }
    }
    // Group by age band by sex (RM032), last so the ethnic margins hold exactly.
    for (const eth of groups) {
      for (const sex of sexes) {
        RM032_BANDS.forEach((b, bi) => {
          const target = margins[eth]?.[sex]?.[bi] ?? 0;
          let s = 0;
          for (let a = b.from; a <= b.to; a++) s += cells[eth][sex][a];
          if (s > 0) {
            const f = target / s;
            for (let a = b.from; a <= b.to; a++) cells[eth][sex][a] *= f;
          } else if (target > 0) {
            // No seed mass in this band: spread the band's count by the area's
            // own single-year profile from TS009.
            let w = 0;
            for (let a = b.from; a <= b.to; a++) w += ages[sex][a];
            for (let a = b.from; a <= b.to; a++) cells[eth][sex][a] = w > 0 ? (target * ages[sex][a]) / w : target / (b.to - b.from + 1);
          }
        });
      }
    }
  }
  let maxAgeGap = 0, rm032Total = 0, ts009Total = 0;
  for (const sex of sexes) {
    for (let a = 0; a <= 90; a++) {
      let s = 0;
      for (const eth of groups) s += cells[eth][sex][a];
      maxAgeGap = Math.max(maxAgeGap, Math.abs(s - ages[sex][a]));
      ts009Total += ages[sex][a];
    }
    for (const eth of groups) rm032Total += (margins[eth]?.[sex] ?? []).reduce((x, y) => x + y, 0);
  }
  return { cells, iterations, maxAgeGap, rm032Total, ts009Total };
}
