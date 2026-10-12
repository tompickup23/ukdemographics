/**
 * Rebase the Census 2011 and 2021 group fields of ethnic-projections.json on
 * the Census tables, and change nothing else.
 *
 * Why: until October 2026 the transform counted the two Mixed White and Black
 * categories as Black and missed the 2011 all-persons row, so the counts and
 * the 2011 baselines were wrong. Re-running transform-ethnicity.mjs is not the
 * fix, because it rebuilds the file from scratch. This script rewrites only:
 *
 *   current.total_population, current.groups_absolute   every area
 *   current.groups                                      areas with no model
 *                                                       output (no projections_detail)
 *   baseline.total_population, baseline.groups,
 *   baseline.groups_absolute                            every area, from the
 *                                                       Census of baseline.year
 *
 * Modelled areas keep current.groups, which the forward model writes from its
 * own base; the script checks those shares sit within 0.05pp of TS021 and stops
 * without writing if any does not. Projections, stochastic output, lastUpdated,
 * areaName, the area set and the key structure are untouched.
 *
 * Inputs (gitignored, held locally): Census 2021 TS021 and Census 2011 KS201EW
 * extracts by local authority, in --census-dir. Codes are resolved in order:
 * the site's own code; its alias (Barnsley and Sheffield, see
 * src/data/lookups/area-code-aliases.json); the sum of its predecessors (the
 * April 2023 unitaries, src/data/lookups/lad22-to-lad23.json). Where none
 * resolves, the field is left as it is and listed. Nothing is estimated.
 *
 * Writes a provenance manifest with each input's SHA-256 and the national
 * totals the tests compare against.
 *
 *   node scripts/build/rebase-census-groups.mjs \
 *     [--file src/data/live/ethnic-projections.json] \
 *     [--census-dir data/raw/census_ethnicity] \
 *     [--aliases src/data/lookups/area-code-aliases.json] \
 *     [--successors src/data/lookups/lad22-to-lad23.json] \
 *     [--manifest data/raw/manifests/census_ethnic_groups.json] [--dry-run]
 */
import { existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import path from "node:path";
import { parseCsv, fileSha256 } from "../lib/csv-parser.mjs";
import { GROUP_KEYS, classifyCensusEthnicLabel } from "../lib/census-ethnic-groups.mjs";
import { writeJsonLike } from "../lib/json-like.mjs";

function arg(name, fallback) {
  const i = process.argv.indexOf(name);
  return i >= 0 ? process.argv[i + 1] : fallback;
}

const FILE = path.resolve(arg("--file", "src/data/live/ethnic-projections.json"));
const CENSUS_DIR = path.resolve(arg("--census-dir", "data/raw/census_ethnicity"));
const ALIASES = path.resolve(arg("--aliases", "src/data/lookups/area-code-aliases.json"));
const SUCCESSORS = path.resolve(arg("--successors", "src/data/lookups/lad22-to-lad23.json"));
const MANIFEST = path.resolve(arg("--manifest", "data/raw/manifests/census_ethnic_groups.json"));
const DRY_RUN = process.argv.includes("--dry-run");

// Modelled areas keep the shares the model wrote from its own base, the ONS
// custom dataset, whose cell perturbation differs slightly from TS021. They are
// expected within 0.05pp of TS021; any beyond that is listed. Beyond 0.1pp the
// script stops, because that is no longer perturbation: the smallest Mixed
// White and Black share of any area is larger.
const MODELLED_TOLERANCE_PP = 0.05;
const MODELLED_STOP_PP = 0.1;

const INPUTS = {
  2021: {
    fileName: "census_2021_ethnicity.csv",
    table: "Census 2021 TS021 Ethnic group",
    nomisDataset: "NM_2041_1"
  },
  2011: {
    fileName: "census_2011_ethnicity.csv",
    table: "Census 2011 KS201EW Ethnic group",
    nomisDataset: "NM_608_1"
  }
};

const round2 = (n) => Math.round(n * 100) / 100;

// ---------------------------------------------------------------------------
// Raw Census tables
// ---------------------------------------------------------------------------

function loadCensus(year) {
  const spec = INPUTS[year];
  const filePath = path.join(CENSUS_DIR, spec.fileName);
  if (!existsSync(filePath)) throw new Error(`Missing ${filePath}`);
  const rows = parseCsv(readFileSync(filePath, "utf8"));
  const headers = Object.keys(rows[0] ?? {});
  const labelCol = headers.find((h) => /ETH|CELL_NAME/.test(h));
  for (const col of ["GEOGRAPHY_CODE", "OBS_VALUE"]) {
    if (!headers.includes(col)) throw new Error(`${spec.fileName}: no ${col} column`);
  }
  if (!labelCol) throw new Error(`${spec.fileName}: no ethnic group column`);

  const byCode = new Map();
  const seen = new Set();
  for (const row of rows) {
    const code = row.GEOGRAPHY_CODE.trim();
    const label = row[labelCol].trim();
    const value = Number(row.OBS_VALUE);
    if (!code) continue;
    if (!Number.isFinite(value)) throw new Error(`${spec.fileName}: non-numeric value for ${code} ${label}`);
    const key = `${code}|${label}`;
    if (seen.has(key)) throw new Error(`${spec.fileName}: duplicate row ${key}`);
    seen.add(key);

    const c = classifyCensusEthnicLabel(label);
    if (c.kind === "unknown") throw new Error(`${spec.fileName}: unrecognised label "${label}"`);
    if (c.kind === "parent") continue;
    if (!byCode.has(code)) {
      byCode.set(code, { name: row.GEOGRAPHY_NAME ?? "", total: null, groups: Object.fromEntries(GROUP_KEYS.map((g) => [g, 0])) });
    }
    const area = byCode.get(code);
    if (c.kind === "total") area.total = value;
    else area.groups[c.group] += value;
  }

  // The detailed categories must add up to the all-persons row exactly; both
  // tables are additive. Anything else means a label was missed.
  for (const [code, area] of byCode) {
    const sum = GROUP_KEYS.reduce((s, g) => s + area.groups[g], 0);
    if (area.total == null) throw new Error(`${spec.fileName}: ${code} has no all-persons row`);
    if (sum !== area.total) throw new Error(`${spec.fileName}: ${code} groups sum to ${sum}, total ${area.total}`);
  }

  const stat = statSync(filePath);
  return {
    byCode,
    provenance: {
      year: Number(year),
      table: spec.table,
      nomisDataset: spec.nomisDataset,
      fileName: spec.fileName,
      sizeBytes: stat.size,
      fileModified: stat.mtime.toISOString().slice(0, 10),
      sha256: fileSha256(filePath),
      rows: rows.length,
      areaCodes: byCode.size
    }
  };
}

// ---------------------------------------------------------------------------
// Code resolution
// ---------------------------------------------------------------------------

const aliases = existsSync(ALIASES) ? JSON.parse(readFileSync(ALIASES, "utf8")).aliases ?? {} : {};
const successors = existsSync(SUCCESSORS) ? JSON.parse(readFileSync(SUCCESSORS, "utf8")).successors ?? {} : {};

function resolve(code, census) {
  if (census.has(code)) return { via: "direct", codes: [code], ...census.get(code) };
  const alias = aliases[code];
  if (alias && census.has(alias)) return { via: "alias", codes: [alias], ...census.get(alias) };
  const preds = successors[code]?.predecessors?.map((p) => p.code) ?? [];
  if (preds.length && preds.every((p) => census.has(p))) {
    const groups = Object.fromEntries(GROUP_KEYS.map((g) => [g, 0]));
    let total = 0;
    for (const p of preds) {
      const a = census.get(p);
      total += a.total;
      for (const g of GROUP_KEYS) groups[g] += a.groups[g];
    }
    return { via: "predecessors", codes: preds, total, groups };
  }
  return null;
}

function shares(r) {
  return Object.fromEntries(GROUP_KEYS.map((g) => [g, round2((r.groups[g] / r.total) * 100)]));
}

/** Write values into an existing object so its key order survives. */
function assignInOrder(target, values) {
  for (const k of Object.keys(target)) if (k in values) target[k] = values[k];
  for (const k of Object.keys(values)) if (!(k in target)) target[k] = values[k];
  return target;
}

// ---------------------------------------------------------------------------
// Rebase
// ---------------------------------------------------------------------------

const census = { 2021: loadCensus(2021), 2011: loadCensus(2011) };
const original = readFileSync(FILE, "utf8");
const data = JSON.parse(original);
const areaCodes = Object.keys(data.areas);
const structureBefore = JSON.stringify(areaCodes);

const log = {
  resolution: {
    current2021: { direct: 0, alias: [], predecessors: [] },
    baseline2011: { direct: 0, alias: [], predecessors: [] },
    baseline2021: { direct: 0, alias: [], predecessors: [] }
  },
  unresolved: { current: [], baseline: [] },
  changed: { currentCounts: 0, currentTotal: 0, currentShares: 0, baselineCounts: 0, baselineTotal: 0, baselineShares: 0 },
  modelled: { areas: 0, maxDeviationPp: 0, maxDeviationArea: null, outside: [] },
  legacy: []
};

function note(key, code, r) {
  if (r.via === "direct") log.resolution[key].direct++;
  else log.resolution[key][r.via].push(`${code} from ${r.codes.join("+")}`);
}

for (const code of areaCodes) {
  const area = data.areas[code];
  // A record is modelled when it carries the model's own output. A duplicate
  // filed under an alias code (Asylum Stats keeps Barnsley and Sheffield under
  // both codes) holds a copy of an earlier run, not the model's 2021 base, so
  // it is judged on its own fields like any other record.
  const modelled = !!area.projections_detail;

  // Census 2021: counts and total for every area; shares only where no model output.
  const r21 = resolve(code, census[2021].byCode);
  if (!r21) {
    log.unresolved.current.push(`${code} ${area.areaName}`);
  } else {
    note("current2021", code, r21);
    const cur = area.current;
    if (cur.year !== 2021) throw new Error(`${code}: current.year is ${cur.year}, expected 2021`);
    const beforeCounts = JSON.stringify(cur.groups_absolute);
    if (cur.total_population !== r21.total) log.changed.currentTotal++;
    cur.total_population = r21.total;
    assignInOrder(cur.groups_absolute, r21.groups);
    if (JSON.stringify(cur.groups_absolute) !== beforeCounts) log.changed.currentCounts++;

    const s = shares(r21);
    if (modelled) {
      log.modelled.areas++;
      for (const g of GROUP_KEYS) {
        const d = Math.abs((cur.groups[g] ?? 0) - (r21.groups[g] / r21.total) * 100);
        if (d > log.modelled.maxDeviationPp) {
          log.modelled.maxDeviationPp = d;
          log.modelled.maxDeviationArea = `${code} ${area.areaName} ${g}`;
        }
        if (d > MODELLED_TOLERANCE_PP) log.modelled.outside.push({ area: `${code} ${area.areaName}`, group: g, deviationPp: Math.round(d * 1000) / 1000, stored: cur.groups[g], ts021: round2((r21.groups[g] / r21.total) * 100) });
      }
    } else {
      log.legacy.push(code);
      const beforeShares = JSON.stringify(cur.groups);
      assignInOrder(cur.groups, s);
      if (JSON.stringify(cur.groups) !== beforeShares) log.changed.currentShares++;
    }
  }

  // Baseline: from the Census of its own year (2011 for 307 areas; the
  // unitaries formed after 2011 carry a 2021 baseline).
  const base = area.baseline;
  const year = base.year;
  if (year !== 2011 && year !== 2021) throw new Error(`${code}: baseline.year ${year}`);
  const rb = resolve(code, census[year].byCode);
  if (!rb) {
    log.unresolved.baseline.push(`${code} ${area.areaName} (${year})`);
  } else {
    note(`baseline${year}`, code, rb);
    const bCounts = JSON.stringify(base.groups_absolute);
    const bShares = JSON.stringify(base.groups);
    if (base.total_population !== rb.total) log.changed.baselineTotal++;
    base.total_population = rb.total;
    assignInOrder(base.groups_absolute, rb.groups);
    assignInOrder(base.groups, shares(rb));
    if (JSON.stringify(base.groups_absolute) !== bCounts) log.changed.baselineCounts++;
    if (JSON.stringify(base.groups) !== bShares) log.changed.baselineShares++;
  }
}

if (JSON.stringify(Object.keys(data.areas)) !== structureBefore) throw new Error("area set changed");
const tooFar = log.modelled.outside.filter((o) => o.deviationPp > MODELLED_STOP_PP);
if (tooFar.length) {
  console.error(`Modelled shares more than ${MODELLED_STOP_PP}pp from TS021; nothing written:`);
  for (const o of tooFar) console.error(`  ${JSON.stringify(o)}`);
  process.exit(1);
}

// National totals for the tests: every authority once, on the same codes as
// the file. A record filed under an alias whose canonical code is also present
// is a duplicate and is skipped.
function national(field, year) {
  const out = { areas: 0, total: 0, groups: Object.fromEntries(GROUP_KEYS.map((g) => [g, 0])) };
  for (const [code, area] of Object.entries(data.areas)) {
    if (aliases[code] && data.areas[aliases[code]]) continue;
    const p = area[field];
    if (p.year !== year) continue;
    const r = resolve(code, census[year].byCode);
    if (!r) continue;
    out.areas++;
    out.total += r.total;
    for (const g of GROUP_KEYS) out.groups[g] += r.groups[g];
  }
  return out;
}

// England and Wales as a whole, on each Census's own boundaries: every local
// authority row in the extract, whatever the site's area codes. The 2011
// figure covers the authorities that have no 2011 record in the site's file
// (the eleven created since), so it is the one to quote for the whole country.
function englandAndWales(year) {
  const out = { areas: 0, total: 0, groups: Object.fromEntries(GROUP_KEYS.map((g) => [g, 0])) };
  for (const [code, r] of census[year].byCode) {
    if (!/^(E0[6-9]|W06)/.test(code)) throw new Error(`${INPUTS[year].fileName}: ${code} is not a local authority code`);
    out.areas++;
    out.total += r.total;
    for (const g of GROUP_KEYS) out.groups[g] += r.groups[g];
  }
  return out;
}

const manifest = {
  generatedBy: "scripts/build/rebase-census-groups.mjs",
  generatedOn: new Date().toISOString().slice(0, 10),
  publisher: "Office for National Statistics",
  description:
    "Census ethnic group extracts by local authority that the Census fields of ethnic-projections.json are rebased on. The files are gitignored; their hashes are recorded here so the inputs can be identified. National totals are summed over the file's own area codes, each authority once.",
  files: [census[2021].provenance, census[2011].provenance],
  lookups: {
    aliases: existsSync(ALIASES) ? { file: path.basename(ALIASES), sha256: fileSha256(ALIASES) } : null,
    successors: existsSync(SUCCESSORS) ? { file: path.basename(SUCCESSORS), sha256: fileSha256(SUCCESSORS) } : null
  },
  target: { file: path.basename(FILE), areas: areaCodes.length },
  resolution: log.resolution,
  unresolved: log.unresolved,
  modelledShareCheck: {
    areas: log.modelled.areas,
    tolerancePp: MODELLED_TOLERANCE_PP,
    maxDeviationPp: Math.round(log.modelled.maxDeviationPp * 1000) / 1000,
    maxDeviationArea: log.modelled.maxDeviationArea,
    outsideTolerance: log.modelled.outside
  },
  national: { 2021: national("current", 2021), 2011: national("baseline", 2011) },
  englandAndWales: { 2021: englandAndWales(2021), 2011: englandAndWales(2011) }
};

console.log(`Inputs:`);
for (const f of manifest.files) console.log(`  ${f.fileName}  sha256 ${f.sha256}  ${f.areaCodes} codes`);
console.log(`Areas: ${areaCodes.length}; modelled ${log.modelled.areas}, no model output ${log.legacy.length}`);
for (const [key, r] of Object.entries(log.resolution)) {
  console.log(`Resolved ${key}: ${r.direct} direct, ${r.alias.length} by alias, ${r.predecessors.length} summed from predecessors`);
  for (const l of [...r.alias, ...r.predecessors]) console.log(`  ${l}`);
}
console.log(`Unresolved, left unchanged: current ${log.unresolved.current.length}, baseline ${log.unresolved.baseline.length}`);
for (const l of [...log.unresolved.current, ...log.unresolved.baseline]) console.log(`  ${l}`);
console.log(`Modelled 2021 shares: max ${manifest.modelledShareCheck.maxDeviationPp}pp from TS021 (${log.modelled.maxDeviationArea}); beyond ${MODELLED_TOLERANCE_PP}pp: ${log.modelled.outside.length}`);
for (const o of log.modelled.outside) console.log(`  ${JSON.stringify(o)}`);
console.log(`Changed: ${JSON.stringify(log.changed)}`);

if (DRY_RUN) {
  console.log("Dry run: nothing written.");
} else {
  writeJsonLike(FILE, data, original);
  mkdirSync(path.dirname(MANIFEST), { recursive: true });
  writeFileSync(MANIFEST, JSON.stringify(manifest, null, 2) + "\n", "utf8");
  console.log(`Written ${path.relative(process.cwd(), FILE)} and ${path.relative(process.cwd(), MANIFEST)}`);
}
