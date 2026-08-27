/**
 * Fetch the HMRC Child Benefit annual release, main and small area tables.
 *
 * New to this repo on 28 Aug 2026. The small area tables are the point: children and
 * families receiving Child Benefit on local authority, ward and parliamentary
 * constituency geography, which is the shape this site is organised around and which
 * nothing here currently holds.
 *
 * Read the period carefully before publishing anything from it. The current edition is
 * titled "August 2025" because it counts families as at 31 August 2025; it was first
 * published on 23 April 2026 and revised on 25 August 2026 to correct a table title. So
 * "the latest Child Benefit statistics" and "Child Benefit in 2026" are two different
 * things, and the manifest records both the reference date and the publication date so a
 * consumer cannot confuse them.
 *
 *   node scripts/fetch/fetch-child-benefit.mjs [--dry-run]
 *
 * The newest edition is resolved from HMRC's own document collection rather than pinned,
 * because a pinned release page keeps returning last year's numbers, forever, without
 * failing.
 */

import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { mkdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import path from "node:path";

const COLLECTION =
  "https://www.gov.uk/api/content/government/collections/child-benefit-geographical-statistics";

const MONTHS = {
  january: 1, february: 2, march: 3, april: 4, may: 5, june: 6,
  july: 7, august: 8, september: 9, october: 10, november: 11, december: 12
};

const dryRun = process.argv.includes("--dry-run");
const rawDir = path.resolve("data/raw/hmrc_child_benefit");
const manifestDir = path.resolve("data/raw/manifests");

const collectionResponse = await fetch(COLLECTION, {
  headers: { "user-agent": "ukdemographics-data-fetch" }
});
if (!collectionResponse.ok) {
  throw new Error(`${COLLECTION} returned ${collectionResponse.status}`);
}
const documents = (await collectionResponse.json()).links?.documents ?? [];

/**
 * The reference period from a release slug, e.g. ...-annual-release-august-2025.
 *
 * Older editions in the same collection use other shapes (`-annual-release-2019`,
 * `-geographical-analysis-august-2018`). Anything unparseable is skipped rather than
 * sorted as old, so a new naming convention surfaces as "no editions found" instead of
 * quietly picking a seven-year-old file.
 */
function referencePeriod(basePath) {
  const match = basePath.match(/-(january|february|march|april|may|june|july|august|september|october|november|december)-(\d{4})$/);
  if (!match) return null;
  return { key: Number(match[2]) * 100 + MONTHS[match[1]], month: match[1], year: Number(match[2]) };
}

const editions = documents
  .map((doc) => ({ basePath: doc.base_path, period: referencePeriod(doc.base_path) }))
  .filter((entry) => entry.period)
  .sort((a, b) => b.period.key - a.period.key);

if (!editions.length) {
  throw new Error(
    `No parseable editions in ${COLLECTION}. HMRC has changed its release slug ` +
      "convention; teach referencePeriod() the new shape rather than pinning a release."
  );
}

const newest = editions[0];
const releaseUrl = `https://www.gov.uk/api/content${newest.basePath}`;
const releaseResponse = await fetch(releaseUrl, {
  headers: { "user-agent": "ukdemographics-data-fetch" }
});
if (!releaseResponse.ok) throw new Error(`${releaseUrl} returned ${releaseResponse.status}`);
const release = await releaseResponse.json();

const attachments = (release.details?.attachments ?? [])
  .filter((attachment) => /\.(ods|xlsx)$/i.test(attachment.url ?? ""))
  .map((attachment) => ({
    url: attachment.url,
    title: attachment.title,
    fileName: decodeURIComponent(attachment.url.split("/").pop())
  }));

if (!attachments.length) {
  throw new Error(`No spreadsheet attachments on ${newest.basePath}.`);
}

const referenceLabel = `${newest.period.month[0].toUpperCase()}${newest.period.month.slice(1)} ${newest.period.year}`;
console.log(`  ${release.title}`);
console.log(`  counts as at ${referenceLabel}, first published ${(release.first_published_at ?? "").slice(0, 10)}`);
for (const attachment of attachments) console.log(`    ${attachment.fileName}`);

if (dryRun) {
  console.log(`\nDry run: ${attachments.length} files resolved, nothing downloaded.`);
  process.exit(0);
}

const manifest = {
  generatedAt: new Date().toISOString(),
  dataset: "hmrc_child_benefit",
  publisher: "HM Revenue and Customs",
  cadence: "annual",
  release: release.title,
  // Two different dates, deliberately both recorded. referenceDate is what the numbers
  // count; releaseDate is when they were published. The current edition counts August
  // 2025 and was published in April 2026, so citing one as the other is wrong by eight
  // months.
  referenceDate: `${newest.period.year}-${String(MONTHS[newest.period.month]).padStart(2, "0")}`,
  releaseDate: (release.first_published_at ?? "").slice(0, 10),
  lastRevised: (release.public_updated_at ?? "").slice(0, 10),
  releasePage: `https://www.gov.uk${newest.basePath}`,
  fetchedFileCount: attachments.length,
  files: []
};

mkdirSync(rawDir, { recursive: true });
mkdirSync(manifestDir, { recursive: true });

for (const attachment of attachments) {
  const destination = path.join(rawDir, attachment.fileName);
  execFileSync("curl", ["-sS", "-L", "--fail", attachment.url, "-o", destination], {
    stdio: "inherit"
  });

  const head = readFileSync(destination).subarray(0, 4).toString("hex");
  if (head !== "504b0304") {
    throw new Error(`${attachment.fileName} is not a zip container (first bytes ${head}).`);
  }

  manifest.files.push({
    title: attachment.title,
    fileName: attachment.fileName,
    sourceUrl: attachment.url,
    sizeBytes: statSync(destination).size,
    fileSha256: createHash("sha256").update(readFileSync(destination)).digest("hex")
  });
}

writeFileSync(
  path.join(manifestDir, "hmrc_child_benefit.json"),
  `${JSON.stringify(manifest, null, 2)}\n`
);
console.log(
  `\nFetched ${attachments.length} Child Benefit files counting ${referenceLabel} ` +
    `(published ${manifest.releaseDate}, last revised ${manifest.lastRevised}).`
);
