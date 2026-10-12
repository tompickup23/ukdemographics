#!/usr/bin/env node
/**
 * Build the v8.1 population control totals (decisions D3 and D4, 12 Oct 2026).
 *
 *   node scripts/model/link_inputs.mjs --model v8.1
 *   node scripts/model/build_control_totals.mjs
 *       [--to 2061] [--england-control npp-level|npp-change]
 *       [--out data/model/control_totals_v81.json] [--out-3596 data/model/control_totals_3596.json]
 *
 * Output: local authority by sex by single year of age (0 to 89, 90 meaning 90
 * and over) by year, mid-2022 to mid-2061, for the 296 English and 22 Welsh
 * authorities on April 2023 boundaries. The file is gitignored; its hash goes
 * in the run record of any model run that reads it.
 *
 * Method (UKD's own construction; it is not an ONS or Welsh Government series):
 *   2022 to 2025  ONS mid-year estimates as revised on 29 July 2026 (MYEB1 for
 *                 2022 to 2024, MYE2 of the mid-2025 workbook for 2025).
 *   England 2026+ each authority's growth by age and sex since mid-2025 from the
 *                 ONS 2022-based SNPP migration category variant, applied to
 *                 mid-2025, then rescaled so England by age and sex equals the
 *                 ONS 2024-based NPP for England (principal). With
 *                 --england-control npp-change the target is instead mid-2025
 *                 England moved by the NPP's own change since 2025, which avoids
 *                 a step between the revised 2025 estimate and the NPP's level.
 *   Wales 2026+   the same anchoring, growth from the Welsh Government 2022-based
 *                 principal projection, no national rescale.
 *   Beyond 2047   SNPP and Welsh growth ratios extended in a straight line from
 *                 their 2043 to 2047 change (UKD's assumption). England's total
 *                 still follows the NPP, which runs to 2124.
 *
 * A second file applies ONS user requested data 3596 to England for 2025 to 2050
 * (ONS's national rescaling of mid-2025), extended the same way after 2050, with
 * Wales as in the main file. It is a sensitivity line, never the cap.
 */
import { createHash } from "node:crypto";
import { existsSync, lstatSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { listZip, readMye2, readMyeb1, readNppPopulation, readSnppSexCsv, readWelshProjections, read3596, unzipMember } from "./lib/control-totals-sources.mjs";
import { aggregateSuccessors, applyRatios, extendRatios, growthRatios, range, rescaleToNational, zeros } from "./lib/control-totals-method.mjs";

const args = process.argv.slice(2);
const flag = (name, fallback) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 ? args[i + 1] : fallback;
};

const PATHS = {
  mye2025: flag("mye", "data/raw/ons_mye/mye25tablesew.xlsx"),
  myeb: flag("myeb", "data/raw/ons_mye_timeseries/myebtablesenglandwales20112025.xlsx"),
  snppZip: flag("snpp-zip", "data/raw/snpp/snpp_z1.zip"),
  nppZip: flag("npp-zip", "data/raw/ons_npp_england/en1.zip"),
  wales: flag("wales", "data/raw/wg_lapp/wg_lapp_2022based_036507d7_raw_extended.csv"),
  ons3596: flag("ons-3596", "data/raw/ons_3596/rescaledpop2025to2050.xlsx"),
  successors: flag("successors", "src/data/lookups/lad22-to-lad23.json"),
};
const OUT = path.resolve(flag("out", "data/model/control_totals_v81.json"));
const OUT_3596 = path.resolve(flag("out-3596", "data/model/control_totals_3596.json"));
const SKIP_3596 = args.includes("--skip-3596");
const TO = Number(flag("to", 2061));
const ENGLAND_CONTROL = flag("england-control", "npp-level");
if (!["npp-level", "npp-change"].includes(ENGLAND_CONTROL)) throw new Error("--england-control: npp-level or npp-change");

const ANCHOR = 2025;
const MYE_YEARS = [2022, 2023, 2024, 2025];
const ALL_YEARS = range(2022, TO);
const SEXES = ["M", "F"];
const sha = (p) => createHash("sha256").update(readFileSync(p)).digest("hex");
const sum = (a) => a.reduce((x, y) => x + y, 0);

for (const p of [OUT, OUT_3596]) {
  if (existsSync(p) && lstatSync(p).isSymbolicLink()) throw new Error(`refusing to write through a symlink: ${p}`);
}
for (const [k, p] of Object.entries(PATHS)) {
  if (k === "ons3596" && SKIP_3596) continue;
  if (!existsSync(p)) throw new Error(`input missing: ${p} (run node scripts/model/link_inputs.mjs --model v8.1)`);
}

const sources = [];
const note = (id, file, extra) => sources.push({ id, file, sha256: sha(file), ...extra });

// ---------------------------------------------------------------- estimates
console.log("Reading mid-year estimates...");
const mye2 = readMye2(PATHS.mye2025);
if (mye2.year !== ANCHOR) throw new Error(`${PATHS.mye2025} is mid-${mye2.year}, expected mid-${ANCHOR}`);
note("ons_mye_2025", PATHS.mye2025, { title: mye2.cover[0], published: mye2.cover.find((l) => /originally published/i.test(l)), used: "MYE2 males and females, mid-2025" });
const myeb = readMyeb1(PATHS.myeb, MYE_YEARS);
note("ons_mye_timeseries", PATHS.myeb, { title: myeb.cover[0]?.replace(/\s+/g, " "), published: myeb.cover.find((l) => /originally published/i.test(l)), used: "MYEB1, mid-2022 to mid-2024 (revised 29 July 2026)" });

// One series of estimates by area: MYEB1 for 2022 to 2024, MYE2 for 2025, and
// a check that the two releases agree on 2025 cell by cell.
const estimates = new Map();
let mye2025Mismatch = 0;
for (const [code, rec] of myeb.areas) {
  const m2 = mye2.areas.get(code);
  if (!m2) throw new Error(`${code} is in MYEB1 but not in MYE2`);
  const area = { name: rec.name, M: {}, F: {} };
  for (const s of SEXES) {
    for (const y of [2022, 2023, 2024]) area[s][y] = rec[s][y];
    area[s][ANCHOR] = m2[s];
    rec[s][ANCHOR].forEach((v, i) => {
      if (Math.abs(v - m2[s][i]) > 0.5) mye2025Mismatch += 1;
    });
  }
  estimates.set(code, area);
}
if (mye2025Mismatch) throw new Error(`MYEB1 and MYE2 disagree on mid-2025 in ${mye2025Mismatch} cells`);
const english = [...estimates.keys()].filter((c) => c.startsWith("E")).sort();
const welsh = [...estimates.keys()].filter((c) => c.startsWith("W")).sort();
console.log(`  ${english.length} English and ${welsh.length} Welsh authorities; MYEB1 and MYE2 agree on mid-2025`);

// ---------------------------------------------------------------- SNPP
console.log("Reading the 2022-based SNPP...");
const snppMembers = listZip(PATHS.snppZip);
const variantNote = snppMembers.find((m) => /variant\.txt$/i.test(m));
const variantText = variantNote ? unzipMember(PATHS.snppZip, variantNote).toString() : "";
const variantLine = variantText.split(/\r?\n/).find((l) => /^Projection:/i.test(l.trim()))?.trim();
if (!/migration category variant/i.test(variantLine ?? "")) {
  throw new Error(`${PATHS.snppZip}: expected the migration category variant, the zip says "${variantLine ?? "nothing"}"`);
}
const snppBySex = {};
for (const [s, re] of [["M", /males\.csv$/i], ["F", /females\.csv$/i]]) {
  const member = snppMembers.find((m) => re.test(m) && !(s === "M" && /females/i.test(m)));
  if (!member) throw new Error(`${PATHS.snppZip}: no ${s === "M" ? "males" : "females"} file`);
  snppBySex[s] = readSnppSexCsv(unzipMember(PATHS.snppZip, member).toString(), member);
}
note("snpp_2022_migcat", PATHS.snppZip, { title: "Subnational population projections for England, 2022-based", variant: variantLine, used: "males and females by single year of age, mid-2022 to mid-2047" });
const successorDoc = JSON.parse(readFileSync(PATHS.successors, "utf8"));
const successors = Object.fromEntries(Object.entries(successorDoc.successors).map(([k, v]) => [k, v.predecessors.map((p) => p.code)]));
const snppLastYear = Math.max(...snppBySex.M.years);
const snpp = {};
for (const s of SEXES) snpp[s] = aggregateSuccessors(snppBySex[s].areas, successors);

// ---------------------------------------------------------------- NPP
console.log("Reading the national population projections for England...");
const nppMember = listZip(PATHS.nppZip).find((m) => /^en_ppp_machine_readable\.xlsx$/i.test(m));
if (!nppMember) throw new Error(`${PATHS.nppZip}: no en_ppp_machine_readable.xlsx (England, principal)`);
const npp = readNppPopulation(unzipMember(PATHS.nppZip, nppMember), nppMember);
const nppCoverage = npp.cover.find((l) => /^Coverage:/i.test(l));
const nppProjection = npp.cover.find((l) => /^Projection:/i.test(l));
if (!/England/i.test(nppCoverage ?? "") || !/Principal/i.test(nppProjection ?? "")) {
  throw new Error(`${nppMember}: expected England, principal; cover says "${nppCoverage}" / "${nppProjection}"`);
}
if (Math.max(...npp.years) < TO) throw new Error(`NPP ends ${Math.max(...npp.years)}, before ${TO}`);
note("ons_npp_2024_england", PATHS.nppZip, { member: nppMember, title: npp.cover[0], published: npp.cover.find((l) => /published/i.test(l)), coverage: nppCoverage, projection: nppProjection, used: "sheet Population, males and females by single year of age, ages 90 and over summed" });

// ---------------------------------------------------------------- Wales
console.log("Reading the Welsh Government projections...");
const wg = readWelshProjections(PATHS.wales, "Principal");
const wgLastYear = Math.max(...Object.keys(wg.areas.values().next().value.M).map(Number));
note("wg_lapp_2022", PATHS.wales, { title: "2022-based population projections by local authority, age, sex, year and variant (StatsWales)", variant: wg.variant, used: "principal projection, males and females by single year of age" });

// ---------------------------------------------------------------- build
const projYears = range(ANCHOR + 1, TO);
const counts = { growthFallbackCells: 0, extensionHeldCells: 0, rescaleEmptyCells: 0 };

function anchored(base, series, lastYear) {
  const sourceYears = range(ANCHOR + 1, Math.min(lastYear, TO));
  const { ratios, fallbacks } = growthRatios(series, ANCHOR, sourceYears);
  counts.growthFallbackCells += fallbacks;
  if (TO > lastYear) counts.extensionHeldCells += extendRatios(ratios, lastYear, TO);
  return applyRatios(base, ratios, projYears);
}

function englandBlock() {
  const areas = {};
  for (const code of english) {
    const est = estimates.get(code);
    areas[code] = { M: {}, F: {} };
    for (const s of SEXES) {
      const series = snpp[s].get(code)?.years;
      if (!series) throw new Error(`${code} (${est.name}) has no SNPP series after successor aggregation`);
      areas[code][s] = anchored(est[s][ANCHOR], series, snppLastYear);
    }
  }
  const targets = { M: {}, F: {} };
  for (const s of SEXES) {
    const england2025 = zeros();
    for (const code of english) estimates.get(code)[s][ANCHOR].forEach((v, i) => (england2025[i] += v));
    for (const y of projYears) {
      targets[s][y] =
        ENGLAND_CONTROL === "npp-level"
          ? npp.population[s][y]
          : npp.population[s][y].map((v, i) => (npp.population[s][ANCHOR][i] > 0 ? england2025[i] * (v / npp.population[s][ANCHOR][i]) : v));
    }
  }
  counts.rescaleEmptyCells += rescaleToNational(areas, targets, projYears).emptyCells;
  return areas;
}

function walesBlock() {
  const areas = {};
  for (const code of welsh) {
    const est = estimates.get(code);
    const w = wg.areas.get(code);
    if (!w) throw new Error(`${code} (${est.name}) is missing from the Welsh Government file`);
    areas[code] = { M: anchored(est.M[ANCHOR], w.M, wgLastYear), F: anchored(est.F[ANCHOR], w.F, wgLastYear) };
  }
  return areas;
}

function assemble(projected, label, meta) {
  const areas = {};
  for (const code of [...english, ...welsh]) {
    const est = estimates.get(code);
    const p = projected[code];
    if (!p) continue;
    areas[code] = { name: est.name, country: code[0] === "E" ? "England" : "Wales", M: {}, F: {} };
    for (const s of SEXES) {
      for (const y of MYE_YEARS) areas[code][s][y] = est[s][y].map((v) => Math.round(v * 1000) / 1000);
      for (const y of projYears) areas[code][s][y] = p[s][y].map((v) => Math.round(v * 1000) / 1000);
    }
  }
  return { label, meta, years: ALL_YEARS, ages: range(0, 90), ageNote: "90 means 90 and over", sexes: SEXES, areas };
}

console.log("Building England and Wales...");
const eng = englandBlock();
const wal = walesBlock();
const assumption = (src, last) =>
  `After mid-${last} each cell's growth ratio since mid-2025 is extended in a straight line from its mid-${last - 4} to mid-${last} change and held at the mid-${last} value where the line would go negative. This is UKD's assumption; ${src} ends at mid-${last}.`;
const meta = {
  builtAt: new Date().toISOString(),
  script: "scripts/model/build_control_totals.mjs",
  decisions: "D3 and D4 of the UKD refresh plan (delegated by Tom Pickup, 12 Oct 2026)",
  construction: "UKD's own construction from published ONS and Welsh Government series. Not an ONS or Welsh Government projection.",
  englandControl: ENGLAND_CONTROL,
  yearSources: [
    { years: "2022 to 2024", areas: "England and Wales", source: "ONS mid-year estimates, detailed time series MYEB1, as revised 29 July 2026" },
    { years: "2025", areas: "England and Wales", source: "ONS mid-year estimates mid-2025, MYE2 (29 July 2026)" },
    {
      years: `2026 to ${TO}`,
      areas: "England",
      source:
        ENGLAND_CONTROL === "npp-level"
          ? `mid-2025 moved by each authority's SNPP 2022-based (migration category variant) growth by age and sex, then scaled so England equals the ONS 2024-based NPP for England (principal) by age and sex`
          : `mid-2025 moved by each authority's SNPP growth, then scaled so England equals mid-2025 England moved by the NPP's own change since 2025, by age and sex`,
    },
    { years: `2026 to ${TO}`, areas: "Wales", source: "mid-2025 moved by the Welsh Government 2022-based principal projection's growth by age and sex for each authority; no national rescale" },
  ],
  assumptions: [assumption("the SNPP", snppLastYear), assumption("the Welsh Government projection", wgLastYear)],
  geography: "Local authorities as of April 2023. SNPP districts abolished in April 2023 are summed into their successors using src/data/lookups/lad22-to-lad23.json.",
  sources,
  counts,
};
const doc = assemble({ ...eng, ...wal }, `UKD v8.1 control totals (${ENGLAND_CONTROL})`, meta);
mkdirSync(path.dirname(OUT), { recursive: true });
writeFileSync(OUT, JSON.stringify(doc));
console.log(`Written ${OUT} (${Object.keys(doc.areas).length} areas, ${ALL_YEARS[0]} to ${TO})`);

// England by age and sex against the target, as a printed check (the tests repeat it independently).
let worst = 0;
for (const s of SEXES) for (const y of projYears) {
  const t = ENGLAND_CONTROL === "npp-level" ? npp.population[s][y] : null;
  if (!t) continue;
  for (let x = 0; x < 91; x++) {
    let got = 0;
    for (const c of english) got += doc.areas[c][s][y][x];
    worst = Math.max(worst, Math.abs(got - t[x]));
  }
}
if (ENGLAND_CONTROL === "npp-level") console.log(`  England against the NPP: largest gap in any age-sex-year cell ${worst.toFixed(3)} persons`);
const step = (y) => english.reduce((a, c) => a + sum(doc.areas[c].M[y]) + sum(doc.areas[c].F[y]), 0);
console.log(`  England mid-2025 ${Math.round(step(2025)).toLocaleString("en-GB")}; mid-2026 ${Math.round(step(2026)).toLocaleString("en-GB")}; NPP mid-2025 ${Math.round(sum(npp.population.M[2025]) + sum(npp.population.F[2025])).toLocaleString("en-GB")}`);
console.log(`  counts: ${JSON.stringify(counts)}`);

// ---------------------------------------------------------------- 3596 sensitivity
if (!SKIP_3596) {
  console.log("Building the 3596 sensitivity series...");
  const r = read3596(PATHS.ons3596);
  const last = Math.max(...r.years);
  const ons = {};
  let mismatch2025 = 0;
  for (const code of english) {
    const rec = r.areas.get(code);
    if (!rec) throw new Error(`${code} missing from 3596`);
    ons[code] = { M: {}, F: {} };
    for (const s of SEXES) {
      rec[s][ANCHOR].forEach((v, i) => {
        if (Math.abs(v - estimates.get(code)[s][ANCHOR][i]) > 0.5) mismatch2025 += 1;
      });
      const ratios = growthRatios(rec[s], ANCHOR, range(ANCHOR + 1, Math.min(last, TO))).ratios;
      if (TO > last) extendRatios(ratios, last, TO);
      ons[code][s] = applyRatios(estimates.get(code)[s][ANCHOR], ratios, projYears);
    }
  }
  if (mismatch2025) console.log(`  NOTE: 3596's mid-2025 differs from MYE2 in ${mismatch2025} cells`);
  note("ons_3596", PATHS.ons3596, { title: r.cover[0], published: r.cover.find((l) => /published/i.test(l)), used: "sheet Data, 2025 to 2050" });
  const meta3596 = {
    ...meta,
    sources: [...sources],
    yearSources: [
      meta.yearSources[0],
      meta.yearSources[1],
      { years: `2026 to ${Math.min(last, TO)}`, areas: "England", source: "ONS user requested data 3596 (27 August 2026): mid-2025 estimates rescaled with the 2024-based NPP's national change by age and sex, the same for every authority" },
      meta.yearSources[3],
    ],
    assumptions: [assumption("3596", last), assumption("the Welsh Government projection", wgLastYear)],
    role: "Sensitivity line only (decision D3). Never the cap.",
  };
  const doc3596 = assemble({ ...ons, ...wal }, "UKD v8.1 sensitivity: ONS 3596 for England", meta3596);
  writeFileSync(OUT_3596, JSON.stringify(doc3596));
  console.log(`Written ${OUT_3596}`);
}
