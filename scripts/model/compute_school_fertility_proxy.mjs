/**
 * Compute per-LA ethnic fertility proxy from DfE School Census Reception intake.
 *
 * The DfE School Census provides annual ethnic enrollment by LA and school phase.
 * Reception year (age 4-5) pupils entering primary school each year are a direct
 * proxy for births 4-5 years earlier. The year-on-year change in Reception ethnic
 * composition is the only annual inter-censal ethnic fertility signal at LA level.
 *
 * This script:
 * 1. Extracts State-funded primary school pupils by ethnicity x LA x year
 * 2. Computes primary-school ethnic composition trends for every year in the file
 * 3. Derives implied ethnic fertility differentials per LA
 * 4. Outputs school-fertility-proxy.json
 *
 * Nothing reads school-fertility-proxy.json: not the model (run_hp_single_year.mjs
 * calibrates on school-validation.json, built by validate_schools.mjs from the unsuffixed
 * spc_pupils_ethnicity_and_language.csv), not a page. It is refreshed with the display
 * files and does not touch the model's inputs.
 *
 * Input:  data/raw/dfe_schools/spc_pupils_ethnicity_and_language_<yyyy-yy>.csv, newest
 *         release, resolved by stem (scripts/fetch/fetch-dfe-pupil-characteristics.mjs);
 *         data/raw/manifests/dfe_pupil_characteristics.json for the release title and
 *         dates, matched to the file by sha256
 * Output: src/data/live/school-fertility-proxy.json
 *
 * Columns are found by header name, not position: the 2025/26 file added pcon_code and
 * pcon_name after new_la_code, which moved every later column along by two. The years are
 * read from the time_period column rather than listed here.
 */
import { createHash } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";

import { parseCsv } from "../lib/csv-parser.mjs";
import { newestEdition } from "../lib/newest-release.mjs";

const INPUT = newestEdition(
  path.resolve("data/raw/dfe_schools"),
  /spc_pupils_ethnicity_and_language_(?<edition>\d{4})-\d{2}\.csv/i
);
const MANIFEST = path.resolve("data/raw/manifests/dfe_pupil_characteristics.json");
const OUTPUT = path.resolve("src/data/live/school-fertility-proxy.json");
const REQUIRED = ["time_period", "geographic_level", "new_la_code", "phase_type_grouping",
  "ethnicity_minor", "language", "headcount"];

// Map DfE ethnicity labels to our 20-group codes
const ETH_MAP = {
  "White - Irish": "WIR",
  "White - Gypsy/Roma": "WGT",
  "White - Traveller of Irish heritage": "WGT",
  "White - Any other White background": "WHO",
  "Mixed - White and Asian": "MWA",
  "Mixed - White and Black African": "MWF",
  "Mixed - White and Black Caribbean": "MWC",
  "Mixed - Any other Mixed background": "MOM",
  "Asian - Indian": "IND",
  "Asian - Pakistani": "PAK",
  "Asian - Bangladeshi": "BAN",
  "Asian - Chinese": "CHI",
  "Asian - Any other Asian background": "OAS",
  "Black - Black African": "BAF",
  "Black - Black Caribbean": "BCA",
  "Black - Any other Black background": "OBL",
  "Any other ethnic group": "OOT"
};

// 6-group aggregation
const SIX_GROUP_MAP = {
  "WBI": "white_british", "WIR": "white_other", "WGT": "white_other", "WHO": "white_other",
  "MWA": "mixed", "MWF": "mixed", "MWC": "mixed", "MOM": "mixed",
  "IND": "asian", "PAK": "asian", "BAN": "asian", "CHI": "asian", "OAS": "asian",
  "BAF": "black", "BCA": "black", "OBL": "black",
  "ARB": "other", "OOT": "other"
};

console.log(`Reading ${path.basename(INPUT)}...`);
const bytes = readFileSync(INPUT);
const digest = createHash("sha256").update(bytes).digest("hex");
const manifest = JSON.parse(readFileSync(MANIFEST, "utf8"));
const entry = Object.values(manifest.current ?? {}).find((e) => e.fileSha256 === digest);
if (!entry || !manifest.release?.published) {
  throw new Error(`${path.basename(INPUT)} is not the file ${path.basename(MANIFEST)} records; run the fetch script`);
}
const rows = parseCsv(bytes.toString("utf8"));
console.log(`  ${rows.length} data rows`);
const missing = REQUIRED.filter((c) => !(c in (rows[0] ?? {})));
if (missing.length) throw new Error(`${path.basename(INPUT)}: missing columns ${missing.join(", ")}`);

// Aggregate: LA code -> year -> ethnicity -> headcount (primary schools, total language)
const data = {}; // laCode -> year -> ethCode -> headcount
const periodsSeen = new Set();

for (const row of rows) {
  const year = row.time_period; // e.g. "202526"
  const laCode = row.new_la_code;
  const ethnicity = row.ethnicity_minor;
  const headcount = parseInt(row.headcount) || 0;
  periodsSeen.add(year);

  // Only LA-level, primary schools, total language
  if (row.geographic_level !== "Local authority") continue;
  if (row.phase_type_grouping !== "State-funded primary") continue;
  if (row.language !== "Total") continue;
  if (!laCode || !laCode.startsWith("E")) continue;
  if (headcount === 0) continue;

  // Map ethnicity
  let ethCode;
  if (ethnicity === "White - White British") ethCode = "WBI";
  else ethCode = ETH_MAP[ethnicity];
  if (!ethCode) continue;

  if (!data[laCode]) data[laCode] = {};
  if (!data[laCode][year]) data[laCode][year] = {};
  data[laCode][year][ethCode] = (data[laCode][year][ethCode] || 0) + headcount;
}

const laCodes = Object.keys(data).sort();
console.log(`  ${laCodes.length} LAs with primary school data`);

// Compute trends: for each LA, WBI share in primary schools over time
const yearOrder = [...periodsSeen].filter((p) => /^\d{6}$/.test(p)).sort();
const ay = (p) => `${p.slice(0, 4)}/${p.slice(4)}`;
// '2026-06-04' -> '4 June 2026'
const longDate = (iso) => new Date(`${iso}T12:00:00Z`).toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" });
if (ay(yearOrder[yearOrder.length - 1]) !== manifest.release.yearTitle) {
  throw new Error(`file runs to ${ay(yearOrder[yearOrder.length - 1])}, the manifest's release is ${manifest.release.yearTitle}`);
}

const output = {
  generatedAt: new Date().toISOString(),
  source: `${manifest.publisher}, ${manifest.release.publication}, academic year ${manifest.release.yearTitle} ` +
    `(published ${longDate(manifest.release.published)}, last updated ${longDate(manifest.release.lastUpdated)}). ` +
    `State-funded primary school pupils by ethnicity and local authority, ${ay(yearOrder[0])} to ${ay(yearOrder[yearOrder.length - 1])}.`,
  sourceFile: path.basename(INPUT),
  lastUpdated: manifest.release.lastUpdated,
  methodology: "Primary school enrollment by ethnicity tracks actual births ~4-5 years lagged. Year-on-year change in ethnic composition is a proxy for ethnic-specific fertility differentials at LA level. This is the only annual inter-censal ethnic signal available.",
  years: yearOrder,
  areas: {}
};

let areasWithTrend = 0;

for (const laCode of laCodes) {
  const laData = data[laCode];
  const timeSeries = {};
  const wbiTrend = [];

  for (const year of yearOrder) {
    const yearData = laData[year];
    if (!yearData) continue;

    const total = Object.values(yearData).reduce((s, v) => s + v, 0);
    if (total < 100) continue; // Skip tiny LAs

    const groups = {};
    for (const [eth, count] of Object.entries(yearData)) {
      const sixGroup = SIX_GROUP_MAP[eth] || "other";
      groups[sixGroup] = (groups[sixGroup] || 0) + count;
    }

    // Convert to percentages
    const pcts = {};
    for (const [g, count] of Object.entries(groups)) {
      pcts[g] = Math.round(count / total * 1000) / 10;
    }

    timeSeries[year] = { total, ...pcts };

    if (pcts.white_british !== undefined) {
      wbiTrend.push({ year, wbiPct: pcts.white_british });
    }
  }

  if (wbiTrend.length < 3) continue; // Need at least 3 years

  // Compute annual WBI change rate
  const firstYear = wbiTrend[0];
  const lastYear = wbiTrend[wbiTrend.length - 1];
  const yearSpan = (parseInt(lastYear.year.slice(0, 4)) - parseInt(firstYear.year.slice(0, 4)));
  const annualWbiChangePp = yearSpan > 0
    ? Math.round((lastYear.wbiPct - firstYear.wbiPct) / yearSpan * 100) / 100
    : 0;

  // Compute latest Pakistani and Asian shares for fertility comparison
  const latestYear = timeSeries[yearOrder[yearOrder.length - 1]] || timeSeries[yearOrder[yearOrder.length - 2]];

  output.areas[laCode] = {
    timeSeries,
    wbiTrend,
    annualWbiChangePp,
    latestWbiPct: lastYear.wbiPct,
    latestAsianPct: latestYear?.asian || 0,
    latestBlackPct: latestYear?.black || 0,
    latestMixedPct: latestYear?.mixed || 0,
    totalYears: wbiTrend.length,
    totalPupils: latestYear?.total || 0
  };
  areasWithTrend++;
}

// National summary
const fastestDecline = Object.entries(output.areas)
  .filter(([, a]) => a.totalPupils >= 5000)
  .sort(([, a], [, b]) => a.annualWbiChangePp - b.annualWbiChangePp)
  .slice(0, 20);

output.summary = {
  areasWithTrend,
  fastestWbiDecline: fastestDecline.map(([code, a]) => ({
    laCode: code,
    annualChangePp: a.annualWbiChangePp,
    latestWbiPct: a.latestWbiPct,
    pupils: a.totalPupils
  }))
};

writeFileSync(OUTPUT, JSON.stringify(output, null, 2), "utf8");

const fileSizeKB = Math.round(Buffer.byteLength(JSON.stringify(output)) / 1024);
console.log(`\nWritten ${OUTPUT} (${fileSizeKB} KB, ${areasWithTrend} areas)`);

console.log("\nFastest WBI decline in primary schools (annual pp):");
for (const [code, a] of fastestDecline.slice(0, 10)) {
  console.log(`  ${code}: ${a.annualWbiChangePp > 0 ? "+" : ""}${a.annualWbiChangePp}pp/yr (WBI ${a.latestWbiPct}%, ${a.totalPupils.toLocaleString()} pupils)`);
}
