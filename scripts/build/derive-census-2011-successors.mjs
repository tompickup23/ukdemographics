/**
 * Census 2011 ethnic group counts for the councils formed since 2011, as exact sums of
 * their 2011 districts' published KS201EW counts.
 *
 * ethnic-projections.json holds no 2011 figure for eleven councils (its baseline for them
 * is the 2021 Census: baseline.year === 2021): Bournemouth, Christchurch and Poole; Dorset;
 * Buckinghamshire; North and West Northamptonshire; East and West Suffolk (2019 to 2021),
 * and Cumberland, Westmorland and Furness, North Yorkshire and Somerset (April 2023).
 * Each is a merger of whole 2011 districts, so summing their counts is a sum of published
 * figures, not an estimate. The map module reads this file; ethnic-projections.json is not
 * touched, because changing its baseline changes eleven place pages.
 *
 * Predecessors: scripts/model/geography/lad11-successors.json for the 2019 to 2021
 * mergers, src/data/lookups/lad22-to-lad23.json for April 2023, with Somerset West and
 * Taunton (itself formed in 2019) expanded through lad11-successors.json. Only whole
 * districts appear in either.
 *
 * Checks before writing: every predecessor has a row; every district's groups add up to its
 * all-persons row; no district is used twice; and the 318 site areas' 2011 totals (307 from
 * ethnic-projections.json, these 11) add up to the KS201EW England and Wales total exactly,
 * so no district is missing or counted twice anywhere.
 *
 *   node scripts/build/derive-census-2011-successors.mjs \
 *     [--census-dir data/raw/census_ethnicity] [--out src/data/live/census-2011-successors.json]
 *
 * The census file is gitignored; its sha256 must match data/raw/manifests/census_ethnic_groups.json.
 */
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { parseCsv, fileSha256 } from "../lib/csv-parser.mjs";
import { GROUP_KEYS, classifyCensusEthnicLabel } from "../lib/census-ethnic-groups.mjs";

const arg = (name, fallback) => {
  const i = process.argv.indexOf(name);
  return i >= 0 ? process.argv[i + 1] : fallback;
};
const CENSUS = path.resolve(arg("--census-dir", "data/raw/census_ethnicity"), "census_2011_ethnicity.csv");
const OUT = path.resolve(arg("--out", "src/data/live/census-2011-successors.json"));
const read = (p) => JSON.parse(readFileSync(p, "utf8"));

if (!existsSync(CENSUS)) throw new Error(`Missing ${CENSUS}`);
const manifest = read("data/raw/manifests/census_ethnic_groups.json");
const held = manifest.files.find((f) => f.year === 2011);
const sha = fileSha256(CENSUS);
if (sha !== held.sha256) throw new Error(`census_2011_ethnicity.csv sha256 ${sha} is not the manifest's ${held.sha256}`);

// ---- KS201EW by district, six groups, groups checked against the all-persons row ----
const byCode = new Map();
for (const row of parseCsv(readFileSync(CENSUS, "utf8"))) {
  const code = row.GEOGRAPHY_CODE.trim(), label = row.CELL_NAME.trim(), value = Number(row.OBS_VALUE);
  const c = classifyCensusEthnicLabel(label);
  if (c.kind === "unknown") throw new Error(`unrecognised label "${label}"`);
  if (c.kind === "parent") continue;
  if (!byCode.has(code)) byCode.set(code, { name: row.GEOGRAPHY_NAME, total: null, groups: Object.fromEntries(GROUP_KEYS.map((g) => [g, 0])) });
  const a = byCode.get(code);
  if (c.kind === "total") a.total = value; else a.groups[c.group] += value;
}
for (const [code, a] of byCode) {
  const sum = GROUP_KEYS.reduce((s, g) => s + a.groups[g], 0);
  if (sum !== a.total) throw new Error(`${code}: groups sum to ${sum}, total ${a.total}`);
}

// ---- Predecessors ----
const lad11 = read("scripts/model/geography/lad11-successors.json").successors;
const lad23 = read("src/data/lookups/lad22-to-lad23.json").successors;
const expand = (code) => (byCode.has(code) ? [code] : (lad11[code]?.predecessors2011 ?? []).flatMap(expand));
function predecessors(code) {
  const direct = lad11[code]?.predecessors2011 ?? lad23[code]?.predecessors?.map((p) => p.code);
  if (!direct?.length) throw new Error(`${code}: no predecessor list`);
  const codes = direct.flatMap(expand);
  for (const c of codes) if (!byCode.has(c)) throw new Error(`${code}: predecessor ${c} has no KS201EW row`);
  return codes;
}

const projections = read("src/data/live/ethnic-projections.json").areas;
const formed = Object.entries(projections).filter(([, a]) => a.baseline.year !== 2011).map(([c]) => c).sort();
const used = new Set();
const areas = {};
for (const code of formed) {
  const preds = predecessors(code);
  const groups = Object.fromEntries(GROUP_KEYS.map((g) => [g, 0]));
  let total = 0;
  for (const p of preds) {
    if (used.has(p)) throw new Error(`${p} is a predecessor of two councils`);
    used.add(p);
    total += byCode.get(p).total;
    for (const g of GROUP_KEYS) groups[g] += byCode.get(p).groups[g];
  }
  areas[code] = {
    areaName: projections[code].areaName,
    year: 2011,
    predecessors: preds.map((p) => ({ code: p, name: byCode.get(p).name })),
    total_population: total,
    groups_absolute: groups
  };
}

// ---- Partition check: every 2011 district once, across all 318 site areas ----
let siteTotal = 0;
for (const [code, a] of Object.entries(projections)) siteTotal += a.baseline.year === 2011 ? a.baseline.total_population : areas[code].total_population;
const ewTotal = manifest.englandAndWales["2011"].total;
if (siteTotal !== ewTotal) throw new Error(`site areas sum to ${siteTotal} in 2011, KS201EW England and Wales ${ewTotal}`);

const out = {
  source: {
    publisher: "Office for National Statistics",
    table: "Census 2011 KS201EW Ethnic group",
    nomisDataset: held.nomisDataset,
    fileName: held.fileName,
    sha256: sha
  },
  method:
    "Each council's 2011 counts are the sum of its 2011 districts' KS201EW counts. Every council here is a merger of whole districts, so the sums are exact. Groups as in scripts/lib/census-ethnic-groups.mjs.",
  checks: {
    areas: formed.length,
    districtsSummed: used.size,
    siteAreas2011Total: siteTotal,
    englandAndWales2011Total: ewTotal
  },
  areas
};
writeFileSync(OUT, JSON.stringify(out, null, 2) + "\n");
console.log(`${formed.length} councils from ${used.size} districts; 318 areas sum to ${siteTotal} = KS201EW England and Wales ${ewTotal}`);
