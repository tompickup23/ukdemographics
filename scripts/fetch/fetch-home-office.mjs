/**
 * Fetch the Home Office immigration datasets this site derives from.
 *
 * Until 28 Aug 2026 there was no fetch script for these at all. The files in
 * data/raw/ho_visas, ho_visas_extra and uk_routes were downloaded by hand, which is why
 * the year ending June 2026 release (published 27 Aug 2026) left seven of them sitting
 * on mar-2026 with nothing to say so. The transforms resolve the newest file on disk via
 * scripts/lib/newest_release.py, so a missed download does not fail: it quietly serves
 * last quarter's numbers under this quarter's headline.
 *
 * Every stem below is resolved live against the GOV.UK page that lists it. No URL is
 * written down, because a Home Office asset URL carries both a release period and a
 * media hash and goes stale at every release.
 *
 *   node scripts/fetch/fetch-home-office.mjs
 *   node scripts/fetch/fetch-home-office.mjs --dry-run
 *
 * Writes data/raw/manifests/home_office.json: the release each file came from, its
 * publication date, size and sha256, so any published figure can be traced to the exact
 * file that produced it.
 */

import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { mkdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import path from "node:path";
import { listDataFiles, newestMatching, periodParts } from "../lib/govuk-discover.mjs";

const DATA_TABLES =
  "https://www.gov.uk/government/statistical-data-sets/immigration-system-statistics-data-tables";

const RELEASE_CONTENT_API =
  "https://www.gov.uk/api/content/government/statistics/immigration-system-statistics-year-ending-";

/**
 * Which stems this repo holds, and where each one lands.
 *
 * `dir` follows the split the transforms already expect: ho_visas for the two files
 * transform_visa_routes.py and the safe-and-legal-routes work read, ho_visas_extra for
 * the per-topic detail datasets, uk_routes for the asylum series shared with the
 * asylumstats repo.
 *
 * `consumed` records whether a transform reads it today. The ones marked false were
 * added on 28 Aug 2026 because they were published and simply never taken; holding them
 * costs a download and means the data is on disk the day someone wants it, rather than a
 * quarter later.
 */
const SOURCES = [
  // Consumed today.
  { stem: "entry-clearance-visa-outcomes-datasets", dir: "ho_visas", consumed: true },
  { stem: "safe-legal-routes-summary-tables", dir: "ho_visas", consumed: true },
  { stem: "citizenship-datasets", dir: "ho_visas_extra", consumed: true },
  { stem: "education-visas-datasets", dir: "ho_visas_extra", consumed: true },
  { stem: "eu-settlement-scheme-datasets", dir: "ho_visas_extra", consumed: true },
  { stem: "occupation-soc2020-visas-datasets", dir: "ho_visas_extra", consumed: true },
  { stem: "asylum-claims-datasets", dir: "uk_routes", consumed: true },
  { stem: "returns-datasets", dir: "uk_routes", consumed: true },
  { stem: "outcome-analysis-asylum-claims-datasets", dir: "uk_routes", consumed: true },

  // Published, previously never taken. Added 28 Aug 2026.
  //
  // The EU settlement scheme local authority tables are the one genuinely new coverage
  // here rather than a refresh: LA-level EUSS figures have never been held in this repo
  // in any form, and this site is organised by area.
  { stem: "eu-settlement-scheme-local-authority-tables", dir: "ho_visas_extra", consumed: false },
  { stem: "settlement-datasets", dir: "ho_visas_extra", consumed: false },
  { stem: "extensions-datasets", dir: "ho_visas_extra", consumed: false },
  { stem: "family-reunion-visa-grants-datasets", dir: "ho_visas_extra", consumed: false },
  { stem: "electronic-travel-authorisation-datasets", dir: "ho_visas_extra", consumed: false },
  { stem: "passenger-arrivals-summary", dir: "ho_visas_extra", consumed: false }
];

const dryRun = process.argv.includes("--dry-run");

/**
 * The date a quarter was published, from GOV.UK's own content API.
 *
 * `first_published_at` on the release page is the release moment. `public_updated_at` is
 * not: pages get revised weeks later, and dating the data from a revision would put a
 * wrong date under every figure derived from it.
 */
async function fetchReleaseDate(slug) {
  const url = `${RELEASE_CONTENT_API}${slug}`;
  const response = await fetch(url, { headers: { "user-agent": "ukdemographics-data-fetch" } });
  if (!response.ok) {
    throw new Error(
      `Release page for ${slug} returned ${response.status} (${url}). The files were ` +
        "found but the release they belong to was not, so their publication date cannot " +
        "be established. Refusing to guess it."
    );
  }
  const body = await response.json();
  if (!body.first_published_at) throw new Error(`No first_published_at for ${slug} at ${url}.`);
  return String(body.first_published_at).slice(0, 10);
}

/**
 * When to start complaining that a release has been missed.
 *
 * A quarter lands about two months after the period it covers: year ending June 2026 was
 * published 27 August 2026. So the next is due around five months after the current
 * period end, and this returns the last day of that month, deliberately a few days late
 * so an on-time release never trips the alarm and a missed one always does.
 */
function nextEditionFrom(period) {
  return new Date(Date.UTC(period.year, period.month + 5, 0)).toISOString().slice(0, 10);
}

const listing = await listDataFiles(DATA_TABLES);

const resolved = [];
for (const source of SOURCES) {
  const newest = newestMatching(listing, source.stem);
  if (!newest) {
    throw new Error(
      `No current file found for "${source.stem}" on ${DATA_TABLES}. Refusing to fall ` +
        "back to whatever is on disk: a silent fallback is how seven of these datasets " +
        "sat a quarter behind through the June 2026 release."
    );
  }
  const period = periodParts(newest.fileName);
  if (!period) {
    throw new Error(
      `Found "${newest.fileName}" for ${source.stem} but cannot read a period from it. ` +
        "GOV.UK has changed its filename convention; teach scripts/lib/govuk-discover.mjs " +
        "the new one rather than letting an undateable file through."
    );
  }
  resolved.push({ ...source, ...newest, period });
}

// Not every dataset moves at the same release. Education visas last published for year
// ending March 2026 and stayed there through June, so each file cites the release it
// actually came from rather than inheriting its neighbours'.
const releaseDates = new Map();
for (const slug of new Set(resolved.map((file) => file.period.slug))) {
  releaseDates.set(slug, await fetchReleaseDate(slug));
}

const currentPeriod = resolved.map((file) => file.period).sort((a, b) => b.key - a.key)[0];

for (const file of resolved) {
  const lag = file.period.key === currentPeriod.key ? "" : "  (lags)";
  console.log(`  ${file.dir.padEnd(15)} ${file.fileName}${lag}`);
}

if (dryRun) {
  console.log(`\nDry run: ${resolved.length} files resolved, nothing downloaded.`);
  process.exit(0);
}

function fileSha256(filePath) {
  return createHash("sha256").update(readFileSync(filePath)).digest("hex");
}

const manifest = {
  generatedAt: new Date().toISOString(),
  dataset: "home_office",
  publisher: "Home Office",
  cadence: "quarterly",
  release: `Immigration system statistics, ${currentPeriod.label[0].toLowerCase()}${currentPeriod.label.slice(1)}`,
  releaseDate: releaseDates.get(currentPeriod.slug),
  nextEdition: nextEditionFrom(currentPeriod),
  landing: DATA_TABLES,
  fetchedFileCount: resolved.length,
  files: []
};

const manifestDir = path.resolve("data/raw/manifests");
mkdirSync(manifestDir, { recursive: true });

for (const file of resolved) {
  const targetDir = path.resolve("data/raw", file.dir);
  mkdirSync(targetDir, { recursive: true });
  const destination = path.join(targetDir, file.fileName);
  execFileSync("curl", ["-sS", "-L", "--fail", file.url, "-o", destination], { stdio: "inherit" });

  // A GOV.UK asset that answers 200 with an HTML error page saves happily under an .xlsx
  // name and reads as coverage until an ETL opens it a long way downstream. Check the
  // magic bytes, not the extension.
  const head = readFileSync(destination).subarray(0, 4).toString("hex");
  const expected = file.fileName.endsWith(".ods") || file.fileName.endsWith(".xlsx") ? "504b0304" : null;
  if (expected && head !== expected) {
    throw new Error(
      `${file.fileName} downloaded but its first bytes are ${head}, not a zip container ` +
        `(${expected}). GOV.UK served something that is not the spreadsheet.`
    );
  }

  manifest.files.push({
    stem: file.stem,
    dir: file.dir,
    fileName: file.fileName,
    sourceUrl: file.url,
    periodSlug: file.period.slug,
    periodLabel: file.period.label,
    releaseDate: releaseDates.get(file.period.slug),
    consumedByTransform: file.consumed,
    sizeBytes: statSync(destination).size,
    fileSha256: fileSha256(destination)
  });
}

writeFileSync(path.join(manifestDir, "home_office.json"), `${JSON.stringify(manifest, null, 2)}\n`);

console.log(
  `\nFetched ${resolved.length} Home Office files for ${currentPeriod.label} ` +
    `(published ${manifest.releaseDate}, next edition due by ${manifest.nextEdition}).`
);
