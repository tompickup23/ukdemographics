/**
 * data.police.uk: stop-and-search records by force for the newest three months.
 *
 *   node scripts/fetch/fetch-stop-and-search.mjs
 *
 * Stop-and-search is published monthly per force as JSON by the data.police.uk API (no
 * key). Each record has self_defined_ethnicity, officer_defined_ethnicity, age_range,
 * gender, outcome and object_of_search.
 *
 * Output: data/raw/police_stops/{force}-{YYYY-MM}.json
 *         data/raw/police_stops/_window.json (the window this run chose)
 *         data/raw/manifests/police_stops.json (what was requested and what came back)
 *
 * How it fetches, as the other publisher fetches do (scripts/lib/retrieval-log.mjs):
 *   - robots.txt on data.police.uk is read once, and both API paths are checked against
 *     it before any other request; a disallow stops the run
 *   - every request carries the repo's neutral user agent
 *   - each file is requested once; a refusal or an error is recorded, never retried
 *   - requests are spaced PACE_MS apart. data.police.uk answered HTTP 429 to 5 of 92
 *     back-to-back requests on 4 November 2026; the old loop hid that by retrying, which
 *     the one-request-per-file rule does not allow, so this spaces them out instead
 *   - a force-month already on disk is not requested again (a fresh runner holds none)
 *
 * The window file records the three months chosen, the forces data.police.uk listed for
 * each, and when that list was read. The transform reads it to know which month files on
 * disk belong to this window, how many forces were listed, and the date to stamp as
 * lastUpdated.
 *
 * The manifest keeps a one-line summary of every run and the full per-file attempts of
 * the latest run only: the files are refetched in full every week, so keeping every
 * attempt would add about 130 records a week.
 *
 * If any listed force-month cannot be fetched the run exits 1 after writing the
 * manifest, so the workflow keeps the committed stop-and-search.json rather than
 * publishing totals with a force missing.
 *
 * The API caps responses at 2,000 records per force-month. Met and West Midlands
 * sometimes truncate. The cap is documented; for our purposes (composition signal) it
 * does not materially distort the per-force ethnic mix.
 */
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import path from "node:path";
import { USER_AGENT, loadManifest, readRobots, robotsVerdict, safeTarget, sha256 } from "../lib/retrieval-log.mjs";
import { API, DATES_URL, planWindow } from "../lib/police-stops.mjs";

const PUBLISHER = "data.police.uk (Home Office)";
const PACE_MS = 2000;
const pause = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
let lastRequestAt = 0;
const outDir = path.resolve("data/raw/police_stops");
const manifestPath = path.resolve("data/raw/manifests/police_stops.json");
mkdirSync(outDir, { recursive: true });

const runStartedAt = new Date().toISOString();
const manifest = loadManifest(manifestPath);
const runs = manifest.runs ?? [];
const attempts = [];

function finish(summary, exitCode, message) {
  runs.push({ started_at: runStartedAt, user_agent: USER_AGENT, ...summary });
  mkdirSync(path.dirname(manifestPath), { recursive: true });
  writeFileSync(
    manifestPath,
    JSON.stringify(
      {
        dataset: "police_stops",
        publisher: PUBLISHER,
        cadence: "monthly, refetched weekly",
        landing: "https://data.police.uk/docs/method/stops-force/",
        discovery: DATES_URL,
        note:
          "runs holds one summary per run. attempts holds every request of the latest run only, " +
          "because the whole window is refetched each week. Figures are read from the files by " +
          "scripts/transform/transform_stop_and_search.py.",
        window: summary.window ?? manifest.window ?? null,
        runs,
        attempts
      },
      null,
      2
    ) + "\n"
  );
  if (message) console.error(message);
  process.exit(exitCode);
}

async function getOnce(url, fileName) {
  const attempt = {
    url,
    attempted_at: new Date().toISOString(),
    outcome: null,
    http_status: null,
    robots_status: robots.status === "read" ? robotsVerdict(robots.text, new URL(url).pathname) : robots.status,
    blob_sha256: null,
    bytes: null,
    user_agent: USER_AGENT,
    ...(fileName ? { file_name: fileName } : {})
  };
  attempts.push(attempt);
  if (attempt.robots_status !== "allowed" && attempt.robots_status !== "absent") {
    attempt.outcome = "robots_disallowed";
    return null;
  }
  const wait = lastRequestAt + PACE_MS - Date.now();
  if (wait > 0) await pause(wait);
  lastRequestAt = Date.now();
  let res;
  try {
    res = await fetch(url, { headers: { "user-agent": USER_AGENT } });
  } catch (err) {
    attempt.outcome = `network_error_${err.cause?.code ?? err.name}`;
    return null;
  }
  attempt.http_status = res.status;
  if (!res.ok) {
    attempt.outcome = `http_${res.status}`;
    const retryAfter = res.headers.get("retry-after");
    if (retryAfter) attempt.retry_after = retryAfter;
    return null;
  }
  const bytes = Buffer.from(await res.arrayBuffer());
  attempt.blob_sha256 = sha256(bytes);
  attempt.bytes = bytes.length;
  attempt.outcome = "stored";
  return bytes;
}

// 1. robots.txt, read once for the host.
const robots = await readRobots(new URL(API).origin);
const robotsOk = robots.status === "absent" || robots.status === "read";
const blocked = robotsOk
  ? ["/api/crimes-street-dates", "/api/stops-force"].filter((p) => robots.text && robotsVerdict(robots.text, p) === "disallowed")
  : ["(robots.txt unreadable)"];
if (blocked.length) {
  finish(
    { outcome: "robots_disallowed", robots_status: robots.status, blocked },
    1,
    `${PUBLISHER}: robots.txt at ${API.replace("/api", "")}/robots.txt (${robots.status}) does not allow ${blocked.join(", ")}; not requesting it.`
  );
}

// 2. The months on offer.
console.log(`Reading ${DATES_URL}`);
const datesBytes = await getOnce(DATES_URL, null);
const datesReadAt = new Date().toISOString();
if (!datesBytes) {
  const a = attempts.at(-1);
  finish(
    { outcome: "dates_failed", robots_status: robots.status, dates_outcome: a.outcome },
    1,
    `${PUBLISHER}: ${DATES_URL} answered ${a.outcome}. The publisher's API is unavailable or has moved; nothing was fetched and the committed stop-and-search.json stays.`
  );
}
let plan;
try {
  plan = planWindow(JSON.parse(datesBytes.toString("utf8")));
} catch (err) {
  finish({ outcome: "dates_unreadable", robots_status: robots.status, error: err.message }, 1, `${PUBLISHER}: ${err.message}`);
}
console.log(`Window: ${plan.months.map((m) => m.date).join(", ")}; ${plan.forcesListed.length} forces listed`);

// 3. The window file, written to a temporary name and moved into place so a reader never
// sees half a file.
const windowRecord = {
  source: DATES_URL,
  readAt: datesReadAt,
  months: plan.months,
  forcesListed: plan.forcesListed
};
const windowPath = path.join(outDir, "_window.json");
writeFileSync(`${windowPath}.tmp`, JSON.stringify(windowRecord, null, 2));
renameSync(`${windowPath}.tmp`, windowPath);

// 4. One request per force-month not already held.
let stored = 0;
let held = 0;
let records = 0;
const failed = [];
for (const f of plan.files) {
  const target = safeTarget(outDir, f.fileName);
  if (existsSync(target)) {
    held++;
    attempts.push({
      url: f.url,
      attempted_at: new Date().toISOString(),
      outcome: "held_copy_not_requested",
      blob_sha256: sha256(readFileSync(target)),
      file_name: f.fileName
    });
    continue;
  }
  const bytes = await getOnce(f.url, f.fileName);
  let parsed = null;
  if (bytes) {
    try {
      parsed = JSON.parse(bytes.toString("utf8"));
    } catch {
      attempts.at(-1).outcome = "not_json";
    }
    if (parsed !== null && !Array.isArray(parsed)) {
      attempts.at(-1).outcome = "not_a_list";
      parsed = null;
    }
  }
  if (!parsed) {
    failed.push({ file: f.fileName, outcome: attempts.at(-1).outcome });
    continue;
  }
  writeFileSync(target, bytes);
  stored++;
  records += parsed.length;
  if (stored % 25 === 0) console.log(`  stored ${stored} files so far`);
}

const window = { months: plan.months.map((m) => m.date), forcesListed: plan.forcesListed.length, readAt: datesReadAt };
const summary = {
  outcome: failed.length ? "incomplete" : "complete",
  robots_status: robots.status,
  window,
  files_listed: plan.files.length,
  stored,
  held,
  failed,
  records_stored: records
};
console.log(`Stored ${stored} files (${records.toLocaleString()} records), ${held} already held, ${failed.length} failed.`);
if (failed.length) {
  finish(
    summary,
    1,
    `${PUBLISHER}: ${failed.length} of ${plan.files.length} force-month files could not be fetched from ${API}/stops-force, ` +
      `for example ${failed[0].file} (${failed[0].outcome}). Not publishing totals with a force missing; ` +
      `the committed stop-and-search.json stays. See data/raw/manifests/police_stops.json.`
  );
}
finish(summary, 0);
