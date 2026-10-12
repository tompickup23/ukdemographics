/**
 * Fetch the newest MHCLG Council Taxbase local authority level data from GOV.UK.
 *
 *   node scripts/fetch/fetch-council-taxbase.mjs [--dry-run]
 *
 * MHCLG publishes one official statistics page a year, "Council Taxbase <year> in
 * England", with a local authority level workbook. Both the page URL and the workbook's
 * name change between years (ctb_la_2024.ods, then 2025_Local_Authority_Drop_Down.xlsx),
 * so nothing here names either. The GOV.UK search API lists MHCLG's official statistics,
 * the edition with the latest year wins, and its content record gives the attachment
 * titled as local authority level data.
 *
 * The workbook is stored byte for byte under a stable stem,
 * data/raw/council_taxbase/council-taxbase-la-level_<year>.<ext>, so the transform can
 * resolve the newest by stem; the publisher's own file name and URL are recorded in
 * data/raw/manifests/council_taxbase.json with UKSkynet's retrieval field names. Edition,
 * snapshot date and figures are read from the workbook by
 * scripts/transform/transform_council_tax_spd.py, never from this script.
 */
import path from "node:path";
import { download, loadManifest, politeGet, writeManifest } from "../lib/retrieval-log.mjs";

const SEARCH =
  "https://www.gov.uk/api/search.json?filter_organisations=ministry-of-housing-communities-local-government" +
  "&filter_content_store_document_type=official_statistics&q=council+taxbase&count=50&fields=title,link,public_timestamp";
const EDITION_TITLE = /^Council Taxbase (\d{4}) in England$/i;
const ATTACHMENT_TITLE = /local authority level data/i;
const STEM = "council-taxbase-la-level_";

const dryRun = process.argv.includes("--dry-run");
const rawDir = path.resolve("data/raw/council_taxbase");
const manifestPath = path.resolve("data/raw/manifests/council_taxbase.json");
const manifest = loadManifest(manifestPath);
const attempts = manifest.attempts ?? [];

const search = await politeGet(SEARCH, { as: "json" });
const editions = (search.results ?? [])
  .map((r) => ({ ...r, year: Number(r.title.match(EDITION_TITLE)?.[1]) }))
  .filter((r) => r.year && r.link.startsWith("/government/statistics/"))
  .sort((a, b) => b.year - a.year);
if (!editions.length) {
  console.error("GOV.UK search returned no 'Council Taxbase <year> in England' release; the title convention has probably changed");
  process.exit(1);
}
const edition = editions[0];
const landing = `https://www.gov.uk${edition.link}`;
const content = await politeGet(`https://www.gov.uk/api/content${edition.link}`, { as: "json" });
const files = (content.details?.attachments ?? []).filter(
  (a) => a.url && ATTACHMENT_TITLE.test(a.title ?? "") && /\.(xlsx|ods)$/i.test(a.url)
);
if (files.length !== 1) {
  console.error(`${landing} lists ${files.length} local authority level workbooks; expected one`);
  process.exit(1);
}
const url = files[0].url;
// The URL comes from the publisher's record, so check where it points; the stored name
// is built from the edition year and a checked extension, and download() refuses any
// name that is not a bare file name.
if (!/^https:\/\/assets\.publishing\.service\.gov\.uk\/media\/[A-Za-z0-9]+\/[A-Za-z0-9._-]+\.(xlsx|ods)$/i.test(url)) {
  console.error(`unexpected attachment URL ${url}; refusing it`);
  process.exit(1);
}
const publishedName = decodeURIComponent(url.split("/").pop());
const fileName = `${STEM}${edition.year}${path.extname(publishedName).toLowerCase()}`;
console.log(`newest edition: ${content.title} (first published ${content.first_published_at}, updated ${content.public_updated_at})`);
if (dryRun) {
  console.log(`would fetch ${url} as ${fileName}`);
  process.exit(0);
}

const attempt = await download(url, rawDir, fileName, {
  published_file_name: publishedName,
  attachment_title: files[0].title,
  landing_page: landing,
  edition: content.title,
  edition_first_published_at: content.first_published_at,
  edition_updated_at: content.public_updated_at
});
attempts.push(attempt);
writeManifest(
  manifestPath,
  {
    dataset: "council_taxbase",
    publisher: "Ministry of Housing, Communities and Local Government",
    cadence: "annual",
    landing: "https://www.gov.uk/government/collections/council-taxbase-statistics",
    discovery: SEARCH,
    note: "Stored under a stable stem; the publisher's file name is published_file_name. Edition, snapshot date and figures are read from the workbook by scripts/transform/transform_council_tax_spd.py."
  },
  attempts
);
console.log(`${attempt.outcome} ${attempt.file_name} (${publishedName}) ${attempt.blob_sha256 ?? ""}`);
if (!attempt.blob_sha256) process.exit(1);
