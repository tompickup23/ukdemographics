#!/usr/bin/env node
/**
 * Reconcile derived fields with the projections they are supposed to describe.
 *
 * ethnic-projections.json is written by several scripts in sequence. The forward
 * model refreshes projections, projections_detail, headlineStat and thresholds.
 * Everything else is written by a different script at a different time, and
 * nothing checks that the two agree.
 *
 * They stopped agreeing. After the v8.0 recalibration Birmingham's chart showed
 * White British at 15.3% for 2051 while modelSpread2051.hamiltonPerry, rendered
 * three sections below it as the two-model comparison, still held 10.8% from the
 * previous run. That is the same class of defect as the confidence bands that did
 * not contain their own point estimate: two numbers describing one thing,
 * produced by two jobs, never checked against each other.
 *
 * This script does two things:
 *   1. Repoints the Hamilton-Perry side of modelSpread2051 at the live
 *      projection and recomputes the spread. The cohort-component side is a
 *      genuinely separate model and is left alone.
 *   2. Reports any derived field that still looks stale, so the drift is visible
 *      rather than silent.
 *
 *   node scripts/model/reconcile_derived.mjs           # fix and report
 *   node scripts/model/reconcile_derived.mjs --check   # report only, exit 1 if drifted
 */
import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";

const PROJ = path.resolve("src/data/live/ethnic-projections.json");
const checkOnly = process.argv.includes("--check");

const data = JSON.parse(readFileSync(PROJ, "utf8"));
const areas = data.areas;

let spreadFixed = 0;
let bandsDropped = 0;
const drift = { spread: [], band: [], uncovered: [] };

// The forward model can only project an area present in both the 2011 and 2021
// Censuses under one code. Welsh authorities are absent from the England-only
// 2011 extract, and authorities created after 2011 have no 2011 base. 51 areas
// are in that position: they carry projections from an older run that the
// current model cannot reproduce, and writing a fresh stochastic band beside
// those stale projections produces a band describing a different model. 106 of
// the 131 material band contradictions were exactly this.
//
// projections_detail is written only for areas the current model projected, so
// its presence is the coverage signal.
const isModelCovered = (area) => Boolean(area.projections_detail);

for (const [code, area] of Object.entries(areas)) {
  const hp2051 = area.projections?.["2051"]?.white_british;
  const ms = area.modelSpread2051;

  if (hp2051 != null && ms && typeof ms.hamiltonPerry === "number") {
    if (Math.abs(ms.hamiltonPerry - hp2051) > 0.05) {
      drift.spread.push({
        code,
        name: area.areaName,
        stored: ms.hamiltonPerry,
        live: Math.round(hp2051 * 100) / 100
      });
      if (!checkOnly) {
        ms.hamiltonPerry = Math.round(hp2051 * 100) / 100;
        if (typeof ms.cohortComponent === "number") {
          ms.spreadPp = Math.round(Math.abs(ms.cohortComponent - ms.hamiltonPerry) * 10) / 10;
        }
        spreadFixed++;
      }
    }
  }

  if (!isModelCovered(area)) {
    drift.uncovered.push({ code, name: area.areaName });
    if (!checkOnly && (area.stochastic || area.confidenceBand2051)) {
      delete area.stochastic;
      delete area.confidenceBand2051;
      bandsDropped++;
    }
    continue;
  }

  // The stochastic run should describe the same model as the deterministic one.
  // This does not repair it, because a band cannot be derived from a point
  // estimate; it reports so that a stale stochastic run is caught here rather
  // than by a reader.
  for (const year of ["2031", "2041", "2051"]) {
    const point = area.projections?.[year]?.white_british;
    const b = area.stochastic?.[year]?.wbi;
    if (point == null || !b) continue;
    if (point < b.p10 || point > b.p90) {
      drift.band.push({ code, name: area.areaName, year, point, p10: b.p10, p90: b.p90 });
    }
  }
}

if (!checkOnly && (spreadFixed > 0 || bandsDropped > 0)) {
  writeFileSync(PROJ, JSON.stringify(data, null, 2), "utf8");
}

console.log(`Derived-field reconciliation across ${Object.keys(areas).length} areas\n`);
console.log(`  modelSpread2051 disagreeing with the live projection: ${drift.spread.length}`);
for (const d of drift.spread.slice(0, 5)) {
  console.log(`      ${d.name}: stored ${d.stored}% vs live ${d.live}%`);
}
if (drift.spread.length > 5) console.log(`      ... and ${drift.spread.length - 5} more`);
if (!checkOnly) console.log(`  repointed at the live projection: ${spreadFixed}`);

console.log(`\n  areas the current model does not project: ${drift.uncovered.length}`);
if (!checkOnly) console.log(`  stochastic bands dropped from those areas: ${bandsDropped}`);
console.log(`\n  stochastic bands not containing their own estimate: ${drift.band.length}`);
for (const d of drift.band.slice(0, 5)) {
  console.log(`      ${d.name} ${d.year}: ${d.point}% vs ${d.p10}-${d.p90}%`);
}
if (drift.band.length > 5) console.log(`      ... and ${drift.band.length - 5} more`);
if (drift.band.length > 0) {
  console.log(`      (re-run scripts/model/run_stochastic_hp.mjs against the current model)`);
}

const failed = checkOnly && (drift.spread.length > 0 || drift.band.length > 0);
process.exit(failed ? 1 : 0);
