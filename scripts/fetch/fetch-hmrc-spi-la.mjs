/**
 * Discover and bank HMRC local taxpayer and national liability workbooks.
 * Run from the repository root, optionally with --dry-run. The transform reads
 * tax years from the workbook, not from the search title or the file name.
 */
import path from "node:path";
import { pathToFileURL } from "node:url";
import { download, loadManifest, politeGet, writeManifest } from "../lib/retrieval-log.mjs";

export const DATASETS = [
  {
    id: "hmrc_spi", query: '"Personal incomes statistics"',
    title: /^Personal incomes statistics for the tax year (\d{4}) to (\d{4})$/i,
    attachment: /Tables 3\.12 to 3\.15a/i,
  },
  {
    id: "hmrc_income_tax", query: '"Income Tax liabilities statistics"',
    title: /^Income Tax liabilities statistics: tax year (\d{4}) to (\d{4}) to tax year (\d{4}) to (\d{4})$/i,
    attachment: /^Collated Tables 2\.1 to 2\.6$/i,
  },
];

export function newestRelease(results, title) {
  const releases = results.filter(r => title.test(r.title) && /^\/government\/statistics\/[^/]+$/.test(r.link));
  releases.sort((a, b) => Number(b.title.match(title)[1]) - Number(a.title.match(title)[1]));
  if (!releases.length) throw new Error("No matching HMRC release; review the publisher's title convention");
  if (releases[1]?.title.match(title)[1] === releases[0].title.match(title)[1]) {
    throw new Error("Ambiguous newest HMRC release");
  }
  return releases[0];
}

async function fetchDataset(spec, dryRun) {
  const search = new URL("https://www.gov.uk/api/search.json");
  search.search = new URLSearchParams({
    q: spec.query, count: "100", filter_organisations: "hm-revenue-customs",
    filter_content_store_document_type: "national_statistics",
    fields: "title,link,public_timestamp",
  }).toString();
  const results = [];
  for (let start = 0; ; start += 100) {
    search.searchParams.set("start", String(start));
    const page = await politeGet(search.toString(), { as: "json" });
    results.push(...(page.results ?? []));
    if (results.length >= page.total) break;
    if (!page.results?.length) throw new Error("Incomplete GOV.UK search response");
  }
  const release = newestRelease(results, spec.title);
  const landing = `https://www.gov.uk${release.link}`;
  const content = await politeGet(`https://www.gov.uk/api/content${release.link}`, { as: "json" });
  const attachments = (content.details?.attachments ?? []).filter(a => spec.attachment.test(a.title ?? "") && /\.ods$/i.test(a.url ?? ""));
  if (attachments.length !== 1) throw new Error(`${landing}: expected one ODS attachment, got ${attachments.length}`);
  const { url, title } = attachments[0];
  if (!/^https:\/\/assets\.publishing\.service\.gov\.uk\/media\/[A-Za-z0-9]+\/[A-Za-z0-9._-]+\.ods$/.test(url)) {
    throw new Error(`Unexpected HMRC attachment URL: ${url}`);
  }
  console.log(`${spec.id}: ${content.title}, published ${content.first_published_at}`);
  if (dryRun) { console.log(url); return; }
  const manifestPath = path.resolve(`data/raw/manifests/${spec.id}.json`);
  const attempts = loadManifest(manifestPath).attempts ?? [];
  const attempt = await download(url, path.resolve(`data/raw/${spec.id}`), path.basename(url), {
    published_file_name: path.basename(url), attachment_title: title,
    landing_page: landing, edition: content.title,
    edition_first_published_at: content.first_published_at,
    edition_updated_at: content.public_updated_at,
  });
  attempts.push(attempt);
  search.searchParams.delete("start");
  writeManifest(manifestPath, {
    dataset: spec.id, publisher: "HM Revenue & Customs", cadence: "annual",
    discovery: search.toString(),
    note: "Published ODS bytes are tracked for offline replay. Tax years and projection status are read from workbook cells by transform-hmrc-spi-la.mjs.",
  }, attempts);
  console.log(`${attempt.outcome}: ${attempt.file_name}, SHA-256 ${attempt.blob_sha256}`);
  if (!attempt.blob_sha256) throw new Error(`Download failed: ${attempt.outcome}`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  for (const spec of DATASETS) await fetchDataset(spec, process.argv.includes("--dry-run"));
}
