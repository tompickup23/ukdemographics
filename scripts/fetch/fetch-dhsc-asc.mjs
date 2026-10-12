/**
 * Fetch the newest DHSC adult social care finance and activity data tables from GOV.UK.
 *
 *   node scripts/fetch/fetch-dhsc-asc.mjs [--dry-run]
 *
 * Until 2023-24 these figures came from NHS England (formerly NHS Digital) as one
 * workbook, "Adult Social Care Activity and Finance Report" (ASCFR and SALT). From the
 * 2024-25 edition DHSC publishes them on GOV.UK as two separate official statistics:
 *
 *   "Adult social care finance report, England: <yyyy> to <yyyy>" (from the ASC-FR return)
 *   "Adult social care activity report, England: <yyyy> to <yyyy>" (from client level data)
 *
 * The two do not always come out together (the 2025-26 activity report slipped from
 * 22 October 2026 to November or December 2026), so each series is resolved on its own:
 * the GOV.UK search API lists DHSC's published official statistics (announcements are a
 * different document type and never match), the edition with the latest end year wins,
 * and its content record gives the "data tables" attachment, which carries the local
 * authority (CASSR) rows. Nothing here names a year or a media hash.
 *
 * Every attempt is recorded in data/raw/manifests/dhsc_asc_finance.json and
 * dhsc_asc_activity.json with UKSkynet's retrieval field names. The page's change notes
 * are recorded with the attempt, because a correction notice (such as the one added to
 * the 2024-25 activity report on 7 October 2026) is on the page, not in the file. The
 * transform (scripts/transform/transform_asc.py) reads the edition, period and figures
 * from the workbooks themselves.
 */
import path from "node:path";
import { download, loadManifest, politeGet, writeManifest } from "../lib/retrieval-log.mjs";

const SEARCH_BASE =
  "https://www.gov.uk/api/search.json?filter_organisations=department-of-health-and-social-care" +
  "&filter_content_store_document_type=official_statistics&count=100&fields=title,link,public_timestamp";

export const SERIES = [
  {
    dataset: "dhsc_asc_finance",
    name: "Adult social care finance report, England",
    query: "adult social care finance report england",
    editionTitle: /^Adult social care finance report, England: (\d{4}) to (\d{4})$/i,
    // "...: 2024 to 2025 - data tables", not the "net current expenditure data tables".
    attachmentTitle: /data tables$/i,
    excludeTitle: /net current expenditure/i,
    note:
      "Finance data tables from the adult social care finance return (ASC-FR). Edition, period and " +
      "figures are read from the workbook by scripts/transform/transform_asc.py, never from this manifest " +
      "or the file name."
  },
  {
    dataset: "dhsc_asc_activity",
    name: "Adult social care activity report, England",
    query: "adult social care activity report england",
    editionTitle: /^Adult social care activity report, England: (\d{4}) to (\d{4})$/i,
    attachmentTitle: /data tables$/i,
    excludeTitle: null,
    note:
      "Activity data tables built from client level data (CLD), which replaced the SALT return. Edition, " +
      "period and figures are read from the workbook by scripts/transform/transform_asc.py, never from this " +
      "manifest or the file name."
  }
];

const ASSET_URL = /^https:\/\/assets\.publishing\.service\.gov\.uk\/media\/[A-Za-z0-9]+\/[A-Za-z0-9._-]+\.(ods|xlsx)$/;

/** The newest published edition among GOV.UK search results, by the end year in its title. */
export function newestEdition(results, editionTitle) {
  return (results ?? [])
    .map((r) => {
      const m = String(r.title ?? "").trim().match(editionTitle);
      return m ? { ...r, startYear: Number(m[1]), endYear: Number(m[2]) } : null;
    })
    .filter((r) => r && r.endYear === r.startYear + 1 && String(r.link).startsWith("/government/statistics/"))
    .filter((r) => !String(r.link).startsWith("/government/statistics/announcements/"))
    .sort((a, b) => b.endYear - a.endYear || String(b.public_timestamp).localeCompare(String(a.public_timestamp)))[0] ?? null;
}

/**
 * The single data-tables spreadsheet among a content record's attachments.
 * @param {Array<{ title?: string, url?: string }>} attachments
 * @param {RegExp} attachmentTitle
 * @param {RegExp | null} [excludeTitle]
 */
export function dataTablesAttachment(attachments, attachmentTitle, excludeTitle = null) {
  const hits = (attachments ?? []).filter((a) => {
    const title = String(a.title ?? "").trim();
    return a.url && attachmentTitle.test(title) && !(excludeTitle && excludeTitle.test(title)) && /\.(ods|xlsx)$/i.test(a.url);
  });
  if (hits.length !== 1) {
    throw new Error(`expected one data tables spreadsheet, found ${hits.length}: ${hits.map((h) => h.title).join("; ")}`);
  }
  return hits[0];
}

async function fetchSeries(series, { dryRun }) {
  const search = `${SEARCH_BASE}&q=${encodeURIComponent(series.query).replace(/%20/g, "+")}`;
  const results = (await politeGet(search, { as: "json" })).results;
  const edition = newestEdition(results, series.editionTitle);
  if (!edition) throw new Error(`GOV.UK search lists no published "${series.name}" edition; the title convention has probably changed`);
  const landing = `https://www.gov.uk${edition.link}`;
  const content = await politeGet(`https://www.gov.uk/api/content${edition.link}`, { as: "json" });
  const attachment = dataTablesAttachment(content.details?.attachments, series.attachmentTitle, series.excludeTitle);
  // The file name comes from the publisher's URL, so check where it points before it
  // becomes a path; download() also refuses any name that is not a bare file name.
  if (!ASSET_URL.test(attachment.url)) throw new Error(`unexpected attachment URL ${attachment.url}; refusing it`);
  const fileName = decodeURIComponent(attachment.url.split("/").pop());
  console.log(`${series.dataset}: newest edition ${content.title} (first published ${content.first_published_at})`);
  if (dryRun) {
    console.log(`  would fetch ${attachment.url}`);
    return true;
  }

  const rawDir = path.resolve("data/raw/dhsc_asc");
  const manifestPath = path.resolve(`data/raw/manifests/${series.dataset}.json`);
  const attempts = loadManifest(manifestPath).attempts ?? [];
  const attempt = await download(attachment.url, rawDir, fileName, {
    landing_page: landing,
    edition: content.title,
    edition_published_at: content.first_published_at,
    edition_updated_at: content.public_updated_at,
    attachment_title: attachment.title,
    change_notes: (content.details?.change_history ?? []).map((c) => ({ note: c.note, public_timestamp: c.public_timestamp }))
  });
  attempts.push(attempt);
  writeManifest(
    manifestPath,
    {
      dataset: series.dataset,
      publisher: "Department of Health and Social Care",
      cadence: "annual",
      series: series.name,
      discovery: search,
      note: series.note
    },
    attempts
  );
  console.log(`  ${attempt.outcome} ${attempt.file_name} ${attempt.blob_sha256 ?? ""}`);
  return Boolean(attempt.blob_sha256);
}

const isMain = import.meta.url === `file://${process.argv[1]}`;
if (isMain) {
  const dryRun = process.argv.includes("--dry-run");
  let ok = true;
  for (const series of SERIES) {
    try {
      ok = (await fetchSeries(series, { dryRun })) && ok;
    } catch (err) {
      console.error(`${series.dataset}: ${err.message}`);
      ok = false;
    }
  }
  if (!ok) process.exit(1);
}
