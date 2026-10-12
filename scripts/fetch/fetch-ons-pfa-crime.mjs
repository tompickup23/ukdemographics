/**
 * Fetch the newest ONS "Crime in England and Wales: Police Force Area data tables" workbook.
 *
 * New on 12 Oct 2026. ONS discontinued its "Recorded crime data by Community Safety
 * Partnership area" dataset on 24 Oct 2024 and moved the CSP rows into this workbook
 * (Tables C1 to C5). scripts/transform/transform_crime.py reads it.
 *
 *   node scripts/fetch/fetch-ons-pfa-crime.mjs [--dry-run]
 *
 * The edition is resolved from the ONS dataset page, never typed: the page lists the
 * current edition first, and file names change from edition to edition
 * (pfatablesyemarch2026.xlsx, policeforceareatablesyesep25.xlsx and so on), so the link
 * is matched on the dataset path rather than on a file name pattern.
 *
 * The release date and next release shown on the dataset page are recorded on the
 * attempt for reference only. The transform reads the period from the workbook itself.
 *
 * ONS serves no robots.txt (HTTP 404 on 12 Oct 2026), which is recorded on every attempt.
 * The manifest uses the field names of UKSkynet's retrieval log (url, attempted_at,
 * outcome, http_status, robots_status, blob_sha256, bytes, user_agent).
 */

import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import path from "node:path";

const ORIGIN = "https://www.ons.gov.uk";
const DATASET_PATH = "/peoplepopulationandcommunity/crimeandjustice/datasets/policeforceareadatatables";
const DATASET_PAGE = `${ORIGIN}${DATASET_PATH}`;
const USER_AGENT = "ukdemographics-data-fetch";
const LINK = new RegExp(`href="(/file\\?uri=${DATASET_PATH}/([a-z0-9]+)/([^"/]+\\.xlsx))"`, "gi");

const dryRun = process.argv.includes("--dry-run");
const rawDir = path.resolve("data/raw/crime");
const manifestPath = path.resolve("data/raw/manifests/ons_pfa_crime.json");

const sha256 = (buf) => createHash("sha256").update(buf).digest("hex");

async function robotsStatus(origin) {
  try {
    const res = await fetch(`${origin}/robots.txt`, { headers: { "user-agent": USER_AGENT } });
    if (res.status === 404) return "absent";
    if (!res.ok) return `unreadable_http_${res.status}`;
    const text = await res.text();
    const blocked = text
      .split("\n")
      .map((l) => l.trim())
      .some((l) => /^disallow:\s*\/(file|peoplepopulationandcommunity)?\s*$/i.test(l));
    return blocked ? "disallowed" : "allowed";
  } catch (err) {
    return `error_${err.code ?? err.name}`;
  }
}

function pageText(html) {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&nbsp;/g, " ")
    .replace(/\s+/g, " ");
}

const previous = existsSync(manifestPath) ? JSON.parse(readFileSync(manifestPath, "utf8")) : { attempts: [] };
const attempts = previous.attempts ?? [];
mkdirSync(rawDir, { recursive: true });

const robots = await robotsStatus(ORIGIN);
if (robots === "disallowed") {
  attempts.push({ url: DATASET_PAGE, attempted_at: new Date().toISOString(), outcome: "robots_disallowed", robots_status: robots, user_agent: USER_AGENT });
  if (!dryRun) writeManifest();
  console.error("ONS robots.txt disallows the dataset path; stopping");
  process.exit(1);
}

const page = await fetch(DATASET_PAGE, { headers: { "user-agent": USER_AGENT } });
if (!page.ok) {
  console.error(`Dataset page returned HTTP ${page.status}`);
  process.exit(1);
}
const html = await page.text();
const links = [...html.matchAll(LINK)];
if (links.length === 0) {
  console.error("No edition link on the dataset page; the page layout may have changed");
  process.exit(1);
}
const [, href, editionSlug, fileName] = links[0];
const url = new URL(href.replaceAll("&amp;", "&"), ORIGIN).toString();
const text = pageText(html);
const pageReleaseDate = text.match(/Release date:\s*(\d{1,2} \w+ \d{4})/)?.[1] ?? null;
const pageNextRelease = text.match(/Next release:\s*([^:]+?)\s+About this Dataset/)?.[1] ?? null;

if (dryRun) {
  console.log(`would fetch ${url} (edition ${editionSlug}; page release date ${pageReleaseDate})`);
  process.exit(0);
}

const res = await fetch(url, { headers: { "user-agent": USER_AGENT } });
const attempt = {
  url,
  attempted_at: new Date().toISOString(),
  outcome: res.ok ? "stored" : `http_${res.status}`,
  http_status: res.status,
  robots_status: robots,
  etag: res.headers.get("etag"),
  last_modified: res.headers.get("last-modified"),
  user_agent: USER_AGENT,
  file_name: fileName,
  edition_slug: editionSlug,
  page_release_date: pageReleaseDate,
  page_next_release: pageNextRelease
};
if (res.ok) {
  const bytes = Buffer.from(await res.arrayBuffer());
  attempt.blob_sha256 = sha256(bytes);
  attempt.bytes = bytes.length;
  const target = path.join(rawDir, fileName);
  if (existsSync(target) && sha256(readFileSync(target)) === attempt.blob_sha256) {
    attempt.outcome = "unchanged";
  } else {
    writeFileSync(target, bytes);
  }
}
attempts.push(attempt);
writeManifest();
console.log(`${attempt.outcome} ${fileName} ${attempt.blob_sha256 ?? ""}`);
if (!res.ok) process.exit(1);

function writeManifest() {
  const latest = [...attempts].reverse().find((a) => a.blob_sha256);
  const manifest = {
    dataset: "ons_pfa_crime",
    publisher: "Office for National Statistics",
    title: "Crime in England and Wales: Police Force Area data tables",
    cadence: "quarterly",
    landing: DATASET_PAGE,
    note: "Tables C1, C2 and C5 hold the Community Safety Partnership and local authority rows. The period is read from the workbook's table titles by scripts/transform/transform_crime.py, never from this manifest or the file name. page_release_date is what the dataset page showed when the file was fetched.",
    current: latest
      ? {
          fileName: latest.file_name,
          fileSha256: latest.blob_sha256,
          sizeBytes: latest.bytes,
          sourceUrl: latest.url,
          pageReleaseDate: latest.page_release_date ?? null
        }
      : null,
    attempts
  };
  mkdirSync(path.dirname(manifestPath), { recursive: true });
  writeFileSync(manifestPath, JSON.stringify(manifest, null, 2) + "\n");
  if (statSync(manifestPath).size > 200_000) console.warn("ons_pfa_crime manifest is over 200 KB; prune old attempts");
}
