/**
 * Fetch the DfT electric vehicle charging infrastructure geography tables.
 *
 * New to this repo on 28 Aug 2026, from the release published 27 August 2026 covering
 * devices as at 1 July 2026.
 *
 * Why this site and not the council one: EVCI is one of the very few quarterly series
 * published on clean local authority AND parliamentary constituency geography at the
 * same time, which is exactly the join this site is organised around. The scheme tables
 * on the same page (ORCS, LEVI, EVCG, workplace charging) are grant delivery rather than
 * geography and belong with the council spending work, so they are deliberately not
 * taken here.
 *
 *   node scripts/fetch/fetch-evci.mjs [--dry-run]
 *
 * Filenames carry their period as `YYYY-MM` in the middle rather than the `-mmm-yyyy`
 * suffix the Home Office uses, so scripts/lib/govuk-discover.mjs cannot read them. The
 * resolver here matches the stable `evciNNNN_` table code and takes the newest period,
 * which is the same principle: never write a URL down, because a GOV.UK asset URL
 * carries a media hash and goes stale at every release.
 */

import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { mkdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import path from "node:path";

const DATA_TABLES =
  "https://www.gov.uk/government/statistical-data-sets/" +
  "electric-vehicle-charging-infrastructure-statistics-data-tables-evci";

const RELEASE_SEARCH =
  "https://www.gov.uk/api/search.json?count=1&order=-public_timestamp" +
  "&filter_content_store_document_type=official_statistics" +
  "&filter_organisations=department-for-transport" +
  "&q=electric%20vehicle%20charging%20infrastructure%20statistics" +
  "&fields=title&fields=link&fields=public_timestamp";

/**
 * The tables worth holding, by DfT's own table code.
 *
 * Coded rather than named because the human-readable half of the filename changes
 * wording between releases while the code does not.
 */
const TABLES = [
  { code: "evci0101", note: "chargers by region and country, UK" },
  { code: "evci0102", note: "chargers by local authority, UK" },
  { code: "evci0103", note: "chargers by parliamentary constituency, UK" },
  { code: "evci0104", note: "chargers by rural urban classification, England and Wales" },
  { code: "evci0105", note: "chargers by combined authority, England" },
  { code: "evci0106", note: "chargers by county council, England" },
  { code: "evci0401", note: "plug-in and battery electric vehicles per public charger" },
  { code: "evci9001", note: "EV charging devices, UK" }
];

const dryRun = process.argv.includes("--dry-run");
const rawDir = path.resolve("data/raw/dft_evci");
const manifestDir = path.resolve("data/raw/manifests");

const response = await fetch(DATA_TABLES, { headers: { "user-agent": "ukdemographics-data-fetch" } });
if (!response.ok) throw new Error(`${DATA_TABLES} returned ${response.status}`);
const html = await response.text();

const assets = [
  ...new Set(
    [...html.matchAll(/https:\/\/assets\.publishing\.service\.gov\.uk\/media\/[^"' ]+\.ods/gi)].map(
      (match) => match[0]
    )
  )
].map((url) => ({ url, fileName: decodeURIComponent(url.split("/").pop()) }));

/** `evci0102_2026-07_EV_chargers_by_local_authority_UK.ods` -> 202607. */
function periodKey(fileName) {
  const match = fileName.match(/_(\d{4})-(\d{2})_/);
  return match ? Number(match[1]) * 100 + Number(match[2]) : null;
}

const resolved = [];
for (const table of TABLES) {
  const candidates = assets
    .filter((asset) => asset.fileName.startsWith(`${table.code}_`) && periodKey(asset.fileName))
    .sort((a, b) => periodKey(b.fileName) - periodKey(a.fileName));
  if (!candidates.length) {
    throw new Error(
      `No file for table ${table.code} (${table.note}) on ${DATA_TABLES}. Refusing to ` +
        "fall back to whatever is on disk: DfT may have renumbered its tables, and a " +
        "silent fallback would keep serving an old quarter under a new headline."
    );
  }
  resolved.push({ ...table, ...candidates[0], periodKey: periodKey(candidates[0].fileName) });
}

for (const file of resolved) console.log(`  ${file.code}  ${file.fileName}`);

if (dryRun) {
  console.log(`\nDry run: ${resolved.length} tables resolved, nothing downloaded.`);
  process.exit(0);
}

// The release the tables belong to, asked of GOV.UK rather than derived from a filename,
// so the publication date under any figure is the one GOV.UK states.
const searchResponse = await fetch(RELEASE_SEARCH, {
  headers: { "user-agent": "ukdemographics-data-fetch" }
});
if (!searchResponse.ok) throw new Error(`GOV.UK search returned ${searchResponse.status}`);
const [release] = (await searchResponse.json()).results;
if (!release) throw new Error("No DfT EVCI statistics release found via GOV.UK search.");

const period = String(resolved[0].periodKey);
const manifest = {
  generatedAt: new Date().toISOString(),
  dataset: "dft_evci",
  publisher: "Department for Transport",
  cadence: "quarterly",
  release: release.title,
  releaseDate: String(release.public_timestamp).slice(0, 10),
  releasePage: `https://www.gov.uk${release.link}`,
  devicesAsAt: `${period.slice(0, 4)}-${period.slice(4)}`,
  landing: DATA_TABLES,
  fetchedFileCount: resolved.length,
  files: []
};

mkdirSync(rawDir, { recursive: true });
mkdirSync(manifestDir, { recursive: true });

for (const file of resolved) {
  const destination = path.join(rawDir, file.fileName);
  execFileSync("curl", ["-sS", "-L", "--fail", file.url, "-o", destination], { stdio: "inherit" });

  // An HTML error page saves happily under an .ods name and reads as coverage until
  // something opens it a long way downstream. Check the magic bytes, not the extension.
  const head = readFileSync(destination).subarray(0, 4).toString("hex");
  if (head !== "504b0304") {
    throw new Error(`${file.fileName} is not a zip container (first bytes ${head}).`);
  }

  manifest.files.push({
    tableCode: file.code,
    description: file.note,
    fileName: file.fileName,
    sourceUrl: file.url,
    sizeBytes: statSync(destination).size,
    fileSha256: createHash("sha256").update(readFileSync(destination)).digest("hex")
  });
}

writeFileSync(path.join(manifestDir, "dft_evci.json"), `${JSON.stringify(manifest, null, 2)}\n`);
console.log(
  `\nFetched ${resolved.length} EVCI geography tables, devices as at ${manifest.devicesAsAt} ` +
    `(${manifest.release}, published ${manifest.releaseDate}).`
);
