/**
 * Projection integrity guard.
 *
 * Runs against the PUBLISHED src/data/live/ethnic-projections.json rather than
 * the model inputs, so it catches divergence even when the model cannot be
 * re-run (data/model/ and data/raw/newethpop/ are gitignored and are not
 * present in a fresh clone).
 *
 * Checks, in order of severity:
 *   1. group shares sum to 100 in every projected year
 *   2. no group runs away from its 2021 base beyond a plausibility ceiling
 *   3. the published point estimate sits inside its own stochastic band
 *   4. scenarioRange2051.central agrees with the headline (Hamilton-Perry) model
 *   5. 2061 is present for the same areas as 2051
 *
 * Exit code 1 on any FAIL. Usage: node scripts/validate-projections.mjs [--json]
 */
import { readFileSync } from "node:fs";
import path from "node:path";

const PROJ_PATH = path.resolve("src/data/live/ethnic-projections.json");
const data = JSON.parse(readFileSync(PROJ_PATH, "utf8"));
const areas = data.areas;
const asJson = process.argv.includes("--json");

// A residual Census category (Other, Mixed) cannot credibly become the plurality
// group in a local authority within one projection horizon. Anything past this
// ceiling is model divergence, not a demographic forecast.
const RUNAWAY_CEILING_PCT = 25;
const RUNAWAY_MULTIPLE = 3; // vs the 2021 observed share
const RESIDUAL_GROUPS = ["other", "mixed"];
const PROJ_YEARS = ["2031", "2041", "2051", "2061"];

const failures = { sum: [], runaway: [], band: [], central: [], coverage: [] };

for (const [code, a] of Object.entries(areas)) {
  const name = a.areaName ?? code;
  const proj = a.projections ?? {};
  const base = a.current?.groups ?? {};

  for (const year of PROJ_YEARS) {
    const row = proj[year];
    if (!row) continue;

    const sum = Object.values(row).reduce((t, v) => t + (v ?? 0), 0);
    if (Math.abs(sum - 100) > 0.6) {
      failures.sum.push({ code, name, year, sum: round(sum) });
    }

    for (const g of RESIDUAL_GROUPS) {
      const now = base[g] ?? 0;
      const then = row[g] ?? 0;
      if (then >= RUNAWAY_CEILING_PCT && (now === 0 || then >= now * RUNAWAY_MULTIPLE)) {
        failures.runaway.push({ code, name, year, group: g, base2021: now, projected: then });
      }
    }
  }

  // The stochastic run and the deterministic run must describe the same model.
  // If the point estimate falls outside its own 80% band, one of them is stale.
  const sto = a.stochastic ?? {};
  for (const year of ["2031", "2041", "2051"]) {
    const point = proj[year]?.white_british;
    const band = sto[year]?.wbi;
    if (point == null || !band) continue;
    if (point < band.p10 || point > band.p90) {
      failures.band.push({
        code, name, year, point,
        p10: band.p10, p90: band.p90,
        missPp: round(Math.min(Math.abs(point - band.p10), Math.abs(point - band.p90)))
      });
    }
  }

  // methodology.astro states Hamilton-Perry is the central published projection.
  // scenarioRange2051.central must therefore track the HP number, not the
  // cohort-component alternative.
  const sr = a.scenarioRange2051;
  const ms = a.modelSpread2051;
  if (sr?.central != null && ms?.hamiltonPerry != null) {
    if (Math.abs(sr.central - ms.hamiltonPerry) > 0.5) {
      failures.central.push({
        code, name,
        scenarioCentral: sr.central,
        hamiltonPerry: ms.hamiltonPerry,
        cohortComponent: ms.cohortComponent ?? null
      });
    }
  }

  if (proj["2051"] && !proj["2061"]) {
    failures.coverage.push({ code, name });
  }
}

function round(n) { return Math.round(n * 100) / 100; }

const counts = Object.fromEntries(Object.entries(failures).map(([k, v]) => [k, v.length]));
const total = Object.values(counts).reduce((a, b) => a + b, 0);

if (asJson) {
  console.log(JSON.stringify({ areas: Object.keys(areas).length, counts, failures }, null, 2));
} else {
  const n = Object.keys(areas).length;
  console.log(`Projection integrity guard: ${n} areas\n`);
  report("Group shares do not sum to 100", failures.sum,
    f => `${f.name} ${f.year}: sums to ${f.sum}`);
  report("Residual group runs away from its 2021 base", failures.runaway,
    f => `${f.name} ${f.year}: ${f.group} ${f.base2021}% (2021) -> ${f.projected}%`);
  report("Point estimate outside its own 80% stochastic band", failures.band,
    f => `${f.name} ${f.year}: ${f.point}% vs band ${f.p10}-${f.p90}% (misses by ${f.missPp}pp)`);
  report("scenarioRange2051.central does not match the Hamilton-Perry headline", failures.central,
    f => `${f.name}: central ${f.scenarioCentral}% vs HP ${f.hamiltonPerry}% (CC ${f.cohortComponent}%)`);
  report("2051 present but 2061 missing", failures.coverage, f => f.name);
  console.log(total === 0 ? "PASS" : `FAIL: ${total} problems across ${Object.entries(counts).filter(([, v]) => v > 0).length} checks`);
}

function report(title, list, fmt) {
  if (list.length === 0) {
    console.log(`  ok    ${title}`);
    return;
  }
  console.log(`  FAIL  ${title}: ${list.length}`);
  for (const f of list.slice(0, 10)) console.log(`          ${fmt(f)}`);
  if (list.length > 10) console.log(`          ... and ${list.length - 10} more`);
}

process.exit(total === 0 ? 0 : 1);
