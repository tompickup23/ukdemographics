/**
 * Records a table of ONS population estimates for Westminster constituencies by
 * single year of age and sex, downloaded in a browser. It makes no request of any kind.
 *
 * Why not a fetch script: on 25 November 2024 ONS stopped releasing constituency
 * estimates on ons.gov.uk ("Parliamentary Constituency population estimates are no
 * longer released on this page. Latest estimates, and all data for 2012 onwards, are
 * available on the Nomis website", read 27 November 2026 on the dataset page). The
 * Nomis dataset is "Population estimates - small area" (reference PESTOA2021). Its
 * robots.txt disallows /query/ and the dataset interface for all agents (read 27
 * November 2026), so no script here requests it. The table comes from one query in
 * the query tool, in a browser, once a year. --retrieved-by says who made it and how:
 * on 27 November 2026 Tom had the mid-2024 sample made in his own Chrome by Claude.
 *
 *   node scripts/fetch/adopt-ons-pcon-estimates.mjs --adopt <file> \
 *     --reference-date 2025-06-30 --retrieved-at <iso> \
 *     --retrieved-by "<who, and how>" [--dry-run]
 *
 * The file is copied to data/raw/ons_pcon_estimates/ (not in git) and its hash, size
 * and the facts above go to data/raw/manifests/ons_pcon_estimates.json (in git).
 * scripts/build/build-pcon-population.mjs then reads the copy and checks the hash.
 */

import { createHash } from "node:crypto";
import { copyFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { readPconTable } from "../lib/pcon-population.mjs";

const args = process.argv.slice(2);
const argValue = (flag) => {
  const i = args.indexOf(flag);
  return i >= 0 ? args[i + 1] : undefined;
};
const dryRun = args.includes("--dry-run");
const adoptPath = argValue("--adopt");
const referenceDate = argValue("--reference-date");
const retrievedAt = argValue("--retrieved-at");
const retrievedBy = argValue("--retrieved-by");

const rawDir = path.resolve("data/raw/ons_pcon_estimates");
const manifestPath = path.resolve("data/raw/manifests/ons_pcon_estimates.json");

if (!adoptPath || !referenceDate || !retrievedAt || !retrievedBy) {
  console.error("Needs --adopt <file> --reference-date <yyyy-06-30> --retrieved-at <iso> --retrieved-by <who made the query, and how>");
  process.exit(2);
}
if (!/^\d{4}-06-30$/.test(referenceDate)) {
  console.error(`--reference-date must be a 30 June date, got ${referenceDate}`);
  process.exit(2);
}
if (Number.isNaN(Date.parse(retrievedAt))) {
  console.error(`--retrieved-at is not a date: ${retrievedAt}`);
  process.exit(2);
}

const bytes = readFileSync(adoptPath);
const name = path.basename(adoptPath);
if (!/\.(csv|tsv|txt)$/i.test(name)) {
  console.error(`Refusing to adopt ${name}: download the table as CSV or tab separated text, not a workbook`);
  process.exit(2);
}

// The file must read as a constituency table before it is recorded as one.
const table = readPconTable(bytes.toString("utf8"));

const attempt = {
  attempted_at: new Date().toISOString(),
  outcome: "adopted_browser_download",
  retrieved_at: retrievedAt,
  retrieved_by: retrievedBy,
  reference_date: referenceDate,
  blob_sha256: createHash("sha256").update(bytes).digest("hex"),
  bytes: bytes.length,
  file_name: name,
  layout: table.layout,
  seats: table.seats.size,
  dates_in_file: table.dates
};

const previous = existsSync(manifestPath) ? JSON.parse(readFileSync(manifestPath, "utf8")) : { attempts: [] };
const attempts = [...(previous.attempts ?? []), attempt];
const manifest = {
  dataset: "ons_pcon_estimates",
  publisher: "Office for National Statistics",
  // The dataset's name as its page prints it, kept verbatim.
  datasetName: "Population estimates - small area",
  datasetReference: "PESTOA2021",
  table: "2024 parliamentary constituencies, by single year of age and sex",
  release: "Population estimates by output areas, electoral, health and other geographies, England and Wales",
  cadence: "annual",
  landing: "https://www.nomisweb.co.uk/datasets/pestoa2021",
  route: "One query in the publisher's query tool, made in a browser. No script requests it: robots.txt disallows the query tool and the dataset interface to all agents. retrievedBy says who made the query and how.",
  current: { fileName: name, fileSha256: attempt.blob_sha256, sizeBytes: attempt.bytes, referenceDate, retrievedAt, retrievedBy },
  attempts
};

if (dryRun) {
  console.log(`would adopt ${name} ${attempt.blob_sha256} (${attempt.bytes} bytes, ${table.layout} layout, ${table.seats.size} seats)`);
} else {
  mkdirSync(rawDir, { recursive: true });
  copyFileSync(adoptPath, path.join(rawDir, name));
  mkdirSync(path.dirname(manifestPath), { recursive: true });
  writeFileSync(manifestPath, JSON.stringify(manifest, null, 2) + "\n");
  console.log(`adopted ${name} ${attempt.blob_sha256} (${attempt.bytes} bytes, ${table.layout} layout, ${table.seats.size} seats)`);
}
