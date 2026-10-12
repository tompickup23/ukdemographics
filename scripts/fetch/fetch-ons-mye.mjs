/**
 * Fetch or adopt the ONS mid-year population estimates workbook for England and Wales.
 *
 * New on 12 Oct 2026. The mid-2025 edition (published 29 July 2026) is the first this
 * repo holds. It replaces nothing yet: it feeds src/data/live/population-estimates.json,
 * which no page reads until the listing test (PR 68) has been measured.
 *
 *   node scripts/fetch/fetch-ons-mye.mjs [--dry-run]
 *   node scripts/fetch/fetch-ons-mye.mjs --adopt <path> --retrieved-at <iso> --source-url <url> [--held-at <where>]
 *
 * The first form resolves the newest edition from the ONS dataset page and downloads it.
 * The second records a copy already held elsewhere in the estate (the 22 Aug 2026 Drive
 * copy in "Care Directory Data/03 ONS population"), so the estate keeps one copy with one
 * hash rather than fetching the same bytes again.
 *
 * Nomis is not used: its robots.txt disallows the dataset API for every agent.
 * ONS serves no robots.txt (HTTP 404 on 12 Oct 2026), which is recorded on every attempt.
 *
 * The manifest records each attempt with the field names UKSkynet's retrieval log uses
 * (url, attempted_at, outcome, http_status, robots_status, blob_sha256, bytes, user_agent),
 * so the engine can match these bytes by hash when it reaches its national stage.
 */

import { createHash } from "node:crypto";
import { copyFileSync, existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import path from "node:path";

const DATASET_PAGE =
  "https://www.ons.gov.uk/peoplepopulationandcommunity/populationandmigration/" +
  "populationestimates/datasets/estimatesofthepopulationforenglandandwales";
const USER_AGENT = "ukdemographics-data-fetch";
const FILE_NAME = /mye\d{2}tablesew\.xlsx/i;

const args = process.argv.slice(2);
const argValue = (flag) => {
  const i = args.indexOf(flag);
  return i >= 0 ? args[i + 1] : undefined;
};
const dryRun = args.includes("--dry-run");
const adoptPath = argValue("--adopt");

const rawDir = path.resolve("data/raw/ons_mye");
const manifestPath = path.resolve("data/raw/manifests/ons_mye.json");

const sha256 = (buf) => createHash("sha256").update(buf).digest("hex");

async function robotsStatus(origin) {
  try {
    const res = await fetch(`${origin}/robots.txt`, { headers: { "user-agent": USER_AGENT } });
    if (res.status === 404) return "absent";
    if (!res.ok) return `unreadable_http_${res.status}`;
    const text = await res.text();
    // Only the dataset and file paths matter here; a blanket Disallow: / stops the run.
    const blocked = text
      .split("\n")
      .map((l) => l.trim())
      .some((l) => /^disallow:\s*\/(file|peoplepopulationandcommunity)?\s*$/i.test(l));
    return blocked ? "disallowed" : "allowed";
  } catch (err) {
    return `error_${err.code ?? err.name}`;
  }
}

const previous = existsSync(manifestPath) ? JSON.parse(readFileSync(manifestPath, "utf8")) : { attempts: [] };
const attempts = previous.attempts ?? [];
mkdirSync(rawDir, { recursive: true });

if (adoptPath) {
  const retrievedAt = argValue("--retrieved-at");
  const sourceUrl = argValue("--source-url");
  if (!retrievedAt || !sourceUrl) {
    console.error("--adopt needs --retrieved-at and --source-url from the held copy's own record");
    process.exit(2);
  }
  const bytes = readFileSync(adoptPath);
  const name = path.basename(adoptPath);
  if (!FILE_NAME.test(name)) {
    console.error(`Refusing to adopt ${name}: not an ONS mid-year estimates workbook name`);
    process.exit(2);
  }
  const attempt = {
    url: sourceUrl,
    attempted_at: new Date().toISOString(),
    outcome: "adopted_held_copy",
    held_copy_retrieved_at: retrievedAt,
    held_copy_path: argValue("--held-at") ?? adoptPath,
    http_status: null,
    robots_status: "not_requested",
    blob_sha256: sha256(bytes),
    bytes: bytes.length,
    user_agent: null,
    file_name: name
  };
  if (!dryRun) copyFileSync(adoptPath, path.join(rawDir, name));
  attempts.push(attempt);
  console.log(`adopted ${name} ${attempt.blob_sha256} (${attempt.bytes} bytes)`);
} else {
  const robots = await robotsStatus("https://www.ons.gov.uk");
  if (robots === "disallowed") {
    attempts.push({ url: DATASET_PAGE, attempted_at: new Date().toISOString(), outcome: "robots_disallowed", robots_status: robots, user_agent: USER_AGENT });
    if (!dryRun) writeManifest();
    console.error("ONS robots.txt disallows the dataset path; stopping");
    process.exit(1);
  }
  const page = await fetch(DATASET_PAGE, { headers: { "user-agent": USER_AGENT } });
  const html = await page.text();
  const links = [...html.matchAll(/href="(\/file\?uri=[^"]*mye\d{2}tablesew\.xlsx)"/gi)].map((m) => m[1]);
  if (links.length === 0) {
    console.error("No mye<yy>tablesew.xlsx link on the dataset page; the page layout may have changed");
    process.exit(1);
  }
  // The page lists the current edition first.
  const url = new URL(links[0].replaceAll("&amp;", "&"), "https://www.ons.gov.uk").toString();
  const name = url.match(FILE_NAME)[0];
  if (dryRun) {
    console.log(`would fetch ${url}`);
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
    file_name: name
  };
  if (res.ok) {
    const bytes = Buffer.from(await res.arrayBuffer());
    attempt.blob_sha256 = sha256(bytes);
    attempt.bytes = bytes.length;
    const target = path.join(rawDir, name);
    if (existsSync(target) && sha256(readFileSync(target)) === attempt.blob_sha256) {
      attempt.outcome = "unchanged";
    } else {
      writeFileSync(target, bytes);
    }
  }
  attempts.push(attempt);
  console.log(`${attempt.outcome} ${name} ${attempt.blob_sha256 ?? ""}`);
}

if (!dryRun) writeManifest();

function writeManifest() {
  const latest = [...attempts].reverse().find((a) => a.blob_sha256);
  const manifest = {
    dataset: "ons_mye",
    publisher: "Office for National Statistics",
    cadence: "annual",
    landing: DATASET_PAGE,
    note: "Edition, publication date and reference period are read from the workbook's cover sheet by scripts/build/build-population-estimates.mjs, never from this manifest or the file name.",
    current: latest
      ? { fileName: latest.file_name, fileSha256: latest.blob_sha256, sizeBytes: latest.bytes, sourceUrl: latest.url }
      : null,
    attempts
  };
  mkdirSync(path.dirname(manifestPath), { recursive: true });
  writeFileSync(manifestPath, JSON.stringify(manifest, null, 2) + "\n");
  // Keep the size check honest: a manifest that grows without bound is a smell.
  if (statSync(manifestPath).size > 200_000) console.warn("ons_mye manifest is over 200 KB; prune old attempts");
}
