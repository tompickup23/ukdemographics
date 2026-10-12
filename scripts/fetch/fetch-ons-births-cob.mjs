/**
 * Fetch the newest edition of the ONS "Parents' country of birth" dataset.
 *
 * New on 12 Oct 2026. Until now the workbook was downloaded by hand and both births
 * transforms named `2024birthsbyparentscountry.xlsx` literally, so a new edition would
 * never have been read. The standalone bulletin that used to accompany this dataset was
 * discontinued: from 2025 the figures are published with "Births in England and Wales:
 * 2025" (27 May 2026), but the dataset page and its edition list carry on.
 *
 *   node scripts/fetch/fetch-ons-births-cob.mjs [--dry-run]
 *
 * The edition is resolved from the dataset page: every edition is linked under a
 * `/parentscountryofbirth/<year>/` path, and the highest year wins. File names are not
 * stable between editions (`2024birthsbyparentscountry.xlsx`,
 * `2025birthbyparentscountry.xlsx`), so nothing here depends on one. The transforms
 * resolve the file on disk by its stable stem through scripts/lib/newest_release.py and
 * read the edition, title and release date from the workbook's own cover sheet.
 *
 * ONS serves no robots.txt (HTTP 404 on 12 Oct 2026); that is recorded on every attempt.
 * Each attempt is written to data/raw/manifests/ons_births_cob.json with the field names
 * UKSkynet's retrieval log uses (url, attempted_at, outcome, http_status, robots_status,
 * blob_sha256, bytes, user_agent).
 */

import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import path from "node:path";

const DATASET_PAGE =
  "https://www.ons.gov.uk/peoplepopulationandcommunity/birthsdeathsandmarriages/" +
  "livebirths/datasets/parentscountryofbirth";
const USER_AGENT = "ukdemographics-data-fetch";
const EDITION_LINK = /href="(\/file\?uri=[^"]*\/parentscountryofbirth\/(\d{4})\/([^"/]+\.xlsx))"/gi;

const dryRun = process.argv.includes("--dry-run");
const rawDir = path.resolve("data/raw/ons_births");
const manifestPath = path.resolve("data/raw/manifests/ons_births_cob.json");

const sha256 = (buf) => createHash("sha256").update(buf).digest("hex");
const previous = existsSync(manifestPath) ? JSON.parse(readFileSync(manifestPath, "utf8")) : { attempts: [] };
const attempts = previous.attempts ?? [];

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

function fail(message, attempt) {
  if (attempt) attempts.push(attempt);
  if (!dryRun) writeManifest();
  console.error(message);
  process.exit(1);
}

const robots = await robotsStatus("https://www.ons.gov.uk");
if (robots === "disallowed") {
  fail("ONS robots.txt disallows the dataset path; stopping", {
    url: DATASET_PAGE, attempted_at: new Date().toISOString(), outcome: "robots_disallowed",
    http_status: null, robots_status: robots, user_agent: USER_AGENT
  });
}

const page = await fetch(DATASET_PAGE, { headers: { "user-agent": USER_AGENT } });
if (!page.ok) {
  fail(`${DATASET_PAGE} returned ${page.status}`, {
    url: DATASET_PAGE, attempted_at: new Date().toISOString(), outcome: `http_${page.status}`,
    http_status: page.status, robots_status: robots, user_agent: USER_AGENT
  });
}
const html = await page.text();
const editions = [...html.matchAll(EDITION_LINK)]
  .map((m) => ({ href: m[1].replaceAll("&amp;", "&"), edition: Number(m[2]), fileName: m[3] }))
  .sort((a, b) => b.edition - a.edition);
if (editions.length === 0) {
  fail("No xlsx edition linked under /parentscountryofbirth/<year>/ on the dataset page; the layout has changed", {
    url: DATASET_PAGE, attempted_at: new Date().toISOString(), outcome: "no_edition_link",
    http_status: page.status, robots_status: robots, user_agent: USER_AGENT
  });
}

const newest = editions[0];
const url = new URL(newest.href, "https://www.ons.gov.uk").toString();
console.log(`newest edition on the page: ${newest.edition} (${newest.fileName})`);
if (dryRun) {
  console.log(`would fetch ${url}`);
  process.exit(0);
}

mkdirSync(rawDir, { recursive: true });
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
  file_name: newest.fileName,
  edition_on_page: newest.edition
};
if (res.ok) {
  const bytes = Buffer.from(await res.arrayBuffer());
  if (bytes.subarray(0, 4).toString("hex") !== "504b0304") {
    fail(`${newest.fileName} is not an xlsx (zip) container`, { ...attempt, outcome: "not_xlsx" });
  }
  attempt.blob_sha256 = sha256(bytes);
  attempt.bytes = bytes.length;
  const target = path.join(rawDir, newest.fileName);
  if (existsSync(target) && sha256(readFileSync(target)) === attempt.blob_sha256) {
    attempt.outcome = "unchanged";
  } else {
    writeFileSync(target, bytes);
  }
}
attempts.push(attempt);
writeManifest();
console.log(`${attempt.outcome} ${newest.fileName} ${attempt.blob_sha256 ?? ""}`);
if (!res.ok) process.exit(1);

function writeManifest() {
  const latest = [...attempts].reverse().find((a) => a.blob_sha256);
  const manifest = {
    dataset: "ons_births_cob",
    publisher: "Office for National Statistics",
    cadence: "annual",
    landing: DATASET_PAGE,
    note: "Edition, title and release date are read from the workbook's cover sheet by the births transforms, never from this manifest or the file name.",
    current: latest
      ? { fileName: latest.file_name, fileSha256: latest.blob_sha256, sizeBytes: latest.bytes, sourceUrl: latest.url }
      : null,
    attempts
  };
  mkdirSync(path.dirname(manifestPath), { recursive: true });
  writeFileSync(manifestPath, JSON.stringify(manifest, null, 2) + "\n");
  if (statSync(manifestPath).size > 200_000) console.warn("ons_births_cob manifest is over 200 KB; prune old attempts");
}
