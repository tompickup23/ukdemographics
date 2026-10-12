/**
 * Fetch the newest HMRC "Payrolled employments in the UK by nationality, region and
 * industry" data tables.
 *
 * New on 12 Oct 2026. Until now the workbook was downloaded by hand, renamed to
 * `payrolled-employments-2014-2024.ods`, and both payroll transforms named that file.
 * The December 2025 edition (first published 14 April 2026, revised 22 May 2026) was
 * therefore never read.
 *
 *   node scripts/fetch/fetch-hmrc-payroll.mjs [--dry-run]
 *
 * The edition is resolved from HMRC's GOV.UK document collection, newest reference
 * period first, and the workbook is kept under the name GOV.UK gives it, which carries
 * the period (`..._from_July_2014_to_December_2025.ods`). The transforms resolve it on
 * disk by that stable stem through scripts/lib/newest_release.py and read the period,
 * the release and every column from the workbook itself.
 *
 * Not in the weekly refresh. transform_payroll_by_nationality.py also reads the DWP
 * NINo cube (data/raw/supplementary/nino-statxplore-cube.json), which needs a Stat-Xplore
 * API key that the repository does not hold as a secret, so the pair is run by hand:
 *
 *   node scripts/fetch/fetch-hmrc-payroll.mjs
 *   python3 scripts/transform/transform_payroll_by_nationality.py
 *   python3 scripts/transform/transform_payroll_regional.py
 *
 * Each attempt is written to data/raw/manifests/hmrc_rti_payroll.json with the field
 * names UKSkynet's retrieval log uses (url, attempted_at, outcome, http_status,
 * robots_status, blob_sha256, bytes, user_agent). GOV.UK's robots.txt allows /api/content
 * and the assets host serves none (HTTP 404 on 12 Oct 2026).
 */

import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import path from "node:path";

const COLLECTION =
  "https://www.gov.uk/api/content/government/collections/" +
  "uk-payrolled-employments-by-nationality-region-industry-age-and-sex";
const USER_AGENT = "ukdemographics-data-fetch";
// The edition title ends with its reference period: "... from July 2014 to December 2025".
const PERIOD = /to (january|february|march|april|may|june|july|august|september|october|november|december) (\d{4})\s*$/i;
// The workbook the transforms read (Tables 1 and 5 to 17). Its sibling covers age and sex.
const ATTACHMENT = /^Payrolled employments in the UK by nationality, region and industry, from July 2014 to .+ Data tables$/i;
const MONTHS = ["january", "february", "march", "april", "may", "june", "july", "august",
  "september", "october", "november", "december"];

const dryRun = process.argv.includes("--dry-run");
const rawDir = path.resolve("data/raw/hmrc_rti");
const manifestPath = path.resolve("data/raw/manifests/hmrc_rti_payroll.json");

const sha256 = (buf) => createHash("sha256").update(buf).digest("hex");
const previous = existsSync(manifestPath) ? JSON.parse(readFileSync(manifestPath, "utf8")) : { attempts: [] };
const attempts = previous.attempts ?? [];
let release = null;

async function robotsStatus(origin, pathPrefix) {
  try {
    const res = await fetch(`${origin}/robots.txt`, { headers: { "user-agent": USER_AGENT } });
    if (res.status === 404) return "absent";
    if (!res.ok) return `unreadable_http_${res.status}`;
    // Only the User-agent: * group applies to this agent.
    let applies = false;
    let blocked = false;
    for (const raw of (await res.text()).split("\n")) {
      const line = raw.trim();
      const ua = line.match(/^user-agent:\s*(.+)$/i);
      if (ua) { applies = ua[1].trim() === "*"; continue; }
      const dis = line.match(/^disallow:\s*(\S*)/i);
      if (applies && dis && dis[1] && (dis[1] === "/" || pathPrefix.startsWith(dis[1]))) blocked = true;
    }
    return blocked ? "disallowed" : "allowed";
  } catch (err) {
    return `error_${err.code ?? err.name}`;
  }
}

async function getJson(url, robots) {
  const res = await fetch(url, { headers: { "user-agent": USER_AGENT } });
  if (!res.ok) {
    fail(`${url} returned ${res.status}`, {
      url, attempted_at: new Date().toISOString(), outcome: `http_${res.status}`,
      http_status: res.status, robots_status: robots, user_agent: USER_AGENT
    });
  }
  return res.json();
}

function fail(message, attempt) {
  if (attempt) attempts.push(attempt);
  if (!dryRun) writeManifest();
  console.error(message);
  process.exit(1);
}

const apiRobots = await robotsStatus("https://www.gov.uk", "/api/content/");
if (apiRobots === "disallowed") {
  fail("GOV.UK robots.txt disallows /api/content; stopping", {
    url: COLLECTION, attempted_at: new Date().toISOString(), outcome: "robots_disallowed",
    http_status: null, robots_status: apiRobots, user_agent: USER_AGENT
  });
}

const collection = await getJson(COLLECTION, apiRobots);
const editions = (collection.links?.documents ?? [])
  .map((doc) => {
    const m = (doc.title ?? "").match(PERIOD);
    return m ? { ...doc, key: Number(m[2]) * 100 + MONTHS.indexOf(m[1].toLowerCase()) + 1 } : null;
  })
  .filter(Boolean)
  .sort((a, b) => b.key - a.key);
if (!editions.length) {
  fail(`No edition in ${COLLECTION} has a title ending "to <Month> <year>"; the naming has changed`, {
    url: COLLECTION, attempted_at: new Date().toISOString(), outcome: "no_edition",
    http_status: 200, robots_status: apiRobots, user_agent: USER_AGENT
  });
}

const newest = editions[0];
release = await getJson(`https://www.gov.uk/api/content${newest.base_path}`, apiRobots);
const matches = (release.details?.attachments ?? []).filter(
  (a) => ATTACHMENT.test((a.title ?? "").trim()) && /\.ods$/i.test(a.url ?? "")
);
if (matches.length !== 1) {
  fail(`Expected one region and industry data tables workbook on ${newest.base_path}, found ${matches.length}`, {
    url: `https://www.gov.uk${newest.base_path}`, attempted_at: new Date().toISOString(),
    outcome: "attachment_not_found", http_status: 200, robots_status: apiRobots, user_agent: USER_AGENT
  });
}

const url = matches[0].url;
const fileName = decodeURIComponent(url.split("/").pop());
console.log(`${release.title}`);
console.log(`  first published ${(release.first_published_at ?? "").slice(0, 10)}, updated ${(release.public_updated_at ?? "").slice(0, 10)}`);
console.log(`  ${fileName}`);
if (dryRun) {
  console.log(`would fetch ${url}`);
  process.exit(0);
}

const assetRobots = await robotsStatus("https://assets.publishing.service.gov.uk", "/media/");
mkdirSync(rawDir, { recursive: true });
const res = await fetch(url, { headers: { "user-agent": USER_AGENT } });
const attempt = {
  url,
  attempted_at: new Date().toISOString(),
  outcome: res.ok ? "stored" : `http_${res.status}`,
  http_status: res.status,
  robots_status: assetRobots,
  etag: res.headers.get("etag"),
  last_modified: res.headers.get("last-modified"),
  user_agent: USER_AGENT,
  file_name: fileName,
  release_page: `https://www.gov.uk${newest.base_path}`
};
if (res.ok) {
  const bytes = Buffer.from(await res.arrayBuffer());
  if (bytes.subarray(0, 4).toString("hex") !== "504b0304") {
    fail(`${fileName} is not an ods (zip) container`, { ...attempt, outcome: "not_ods" });
  }
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
    dataset: "hmrc_rti_payroll",
    publisher: "HM Revenue and Customs",
    cadence: "annual",
    landing: COLLECTION.replace("/api/content", ""),
    note: "Reference period and release are read from the workbook's cover sheet by the payroll transforms, never from this manifest or the file name. Not in the weekly refresh: the nationality transform also reads the DWP NINo cube, which needs a Stat-Xplore key.",
    release: release
      ? {
          title: release.title,
          page: `https://www.gov.uk${release.base_path}`,
          firstPublished: (release.first_published_at ?? "").slice(0, 10),
          lastUpdated: (release.public_updated_at ?? "").slice(0, 10)
        }
      : previous.release ?? null,
    current: latest
      ? { fileName: latest.file_name, fileSha256: latest.blob_sha256, sizeBytes: latest.bytes, sourceUrl: latest.url }
      : null,
    attempts
  };
  mkdirSync(path.dirname(manifestPath), { recursive: true });
  writeFileSync(manifestPath, JSON.stringify(manifest, null, 2) + "\n");
  if (statSync(manifestPath).size > 200_000) console.warn("hmrc_rti_payroll manifest is over 200 KB; prune old attempts");
}
