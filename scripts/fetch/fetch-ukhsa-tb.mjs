/**
 * Fetch the newest UKHSA TB surveillance supplementary tables (England) from GOV.UK.
 *
 *   node scripts/fetch/fetch-ukhsa-tb.mjs [--dry-run]
 *
 * UKHSA publishes one official statistics page per year, titled "Reports of cases of TB
 * to UK enhanced tuberculosis surveillance systems, 2000 to <year>" (earlier editions
 * used "Tuberculosis (TB) notifications reported to enhanced TB surveillance systems").
 * Each page carries an England supplementary data tables workbook. The URL of both the
 * page and the file change every year, so nothing here names a year: the GOV.UK search
 * API lists UKHSA's official statistics, the edition with the latest end year wins, and
 * its content record gives the attachment.
 *
 * Every attempt is recorded in data/raw/manifests/ukhsa_tb.json with UKSkynet's
 * retrieval field names. The transform (scripts/transform/transform_tb.py) reads the
 * newest file on disk by stem and takes the period, release status and figures from the
 * workbook itself, never from this script or the file name.
 */
import path from "node:path";
import { download, loadManifest, politeGet, writeManifest } from "../lib/retrieval-log.mjs";

const SEARCH =
  "https://www.gov.uk/api/search.json?filter_organisations=uk-health-security-agency" +
  "&filter_content_store_document_type=official_statistics&q=tuberculosis+surveillance+systems" +
  "&count=100&fields=title,link,public_timestamp";
const EDITION_TITLE = /tuberculosis.*surveillance systems.*2000 to (\d{4})/i;
const FILE_PATTERN = /England-\d{4}-supplementary-data-tables\.(ods|xlsx)$/i;

const dryRun = process.argv.includes("--dry-run");
const rawDir = path.resolve("data/raw/ukhsa_tb");
const manifestPath = path.resolve("data/raw/manifests/ukhsa_tb.json");
const manifest = loadManifest(manifestPath);
const attempts = manifest.attempts ?? [];

const search = await politeGet(SEARCH, { as: "json" });
const editions = (search.results ?? [])
  .map((r) => ({ ...r, endYear: Number(r.title.match(EDITION_TITLE)?.[1]) }))
  .filter((r) => r.endYear && r.link.startsWith("/government/statistics/"))
  .sort((a, b) => b.endYear - a.endYear || b.public_timestamp.localeCompare(a.public_timestamp));
if (!editions.length) {
  console.error("GOV.UK search returned no UKHSA TB surveillance edition; the title convention has probably changed");
  process.exit(1);
}
const edition = editions[0];
const landing = `https://www.gov.uk${edition.link}`;
const content = await politeGet(`https://www.gov.uk/api/content${edition.link}`, { as: "json" });
const files = (content.details?.attachments ?? [])
  .filter((a) => a.url && FILE_PATTERN.test(decodeURIComponent(a.url.split("/").pop())));
if (files.length !== 1) {
  console.error(`${landing} lists ${files.length} England supplementary tables files; expected one`);
  process.exit(1);
}
const url = files[0].url;
const fileName = decodeURIComponent(url.split("/").pop());
console.log(`newest edition: ${content.title} (published ${content.first_published_at})`);
if (dryRun) {
  console.log(`would fetch ${url}`);
  process.exit(0);
}

const attempt = await download(url, rawDir, fileName, {
  landing_page: landing,
  edition: content.title,
  edition_published_at: content.first_published_at
});
attempts.push(attempt);
writeManifest(
  manifestPath,
  {
    dataset: "ukhsa_tb",
    publisher: "UK Health Security Agency",
    cadence: "annual",
    landing: "https://www.gov.uk/government/collections/tuberculosis-and-other-mycobacterial-diseases-diagnosis-screening-management-and-data",
    discovery: SEARCH,
    note: "Period, release status and figures are read from the workbook by scripts/transform/transform_tb.py, never from this manifest or the file name."
  },
  attempts
);
console.log(`${attempt.outcome} ${attempt.file_name} ${attempt.blob_sha256 ?? ""}`);
if (!attempt.blob_sha256) process.exit(1);
