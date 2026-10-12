/**
 * Fetch the newest DfE "Schools, pupils and their characteristics" files this site
 * displays: the pupils by ethnicity and language data set, and the school level
 * underlying data.
 *
 * New on 12 Oct 2026. Until now both files were downloaded by hand (the 2024/25 school
 * level file renamed to `spc_school_level_2024-25.csv`) and the transforms named them
 * literally, so the 2025/26 release (published 4 June 2026) was never read.
 *
 *   node scripts/fetch/fetch-dfe-pupil-characteristics.mjs [--dry-run]
 *
 * The release is resolved from the publication's own page on Explore Education
 * Statistics, which always redirects to the latest release; the files are found by title
 * in that release's data guidance, not by a typed id. The ethnicity and language data
 * set is not in DfE's public API for 2025/26, so it is taken from the release download.
 *
 * Files are stored under names that carry the academic year:
 *   data/raw/dfe_schools/spc_pupils_ethnicity_and_language_<yyyy-yy>.csv
 *   data/raw/dfe_schools_per_school/spc_school_level_underlying_data_<yyyy>.csv
 * This matters. The model's calibration (scripts/model/validate_schools.mjs, feeding
 * school-validation.json and run_hp_single_year.mjs) reads the unsuffixed
 * `spc_pupils_ethnicity_and_language.csv`. Writing over that file would change the next
 * model run's input without anyone deciding to. The display transforms resolve the
 * suffixed files by stem through scripts/lib/newest_release.{py,mjs}.
 *
 * Not in the weekly refresh: the two files are about 80 MB together and change once a
 * year (June), with in-place updates through the summer. Run by hand after a release:
 *
 *   node scripts/fetch/fetch-dfe-pupil-characteristics.mjs
 *   python3 scripts/transform/transform_school_eal.py
 *   python3 scripts/transform/transform_school_eal_district.py
 *   node scripts/model/compute_school_fertility_proxy.mjs
 *
 * Each attempt is written to data/raw/manifests/dfe_pupil_characteristics.json with the
 * field names UKSkynet's retrieval log uses (url, attempted_at, outcome, http_status,
 * robots_status, blob_sha256, bytes, user_agent).
 */

import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import path from "node:path";

const EES = "https://explore-education-statistics.service.gov.uk";
const CONTENT = "https://content.explore-education-statistics.service.gov.uk";
const PUBLICATION = `${EES}/find-statistics/school-pupils-and-their-characteristics`;
const USER_AGENT = "ukdemographics-data-fetch";

const WANTED = [
  {
    key: "pupils_ethnicity_language",
    kind: "dataSets",
    title: /^Pupil characteristics - number of pupils by ethnicity and language$/i,
    dir: "data/raw/dfe_schools",
    // spc_pupils_ethnicity_and_language.csv -> spc_pupils_ethnicity_and_language_2025-26.csv
    name: (year) => `spc_pupils_ethnicity_and_language_${year.replace("/", "-")}.csv`
  },
  {
    key: "school_level",
    kind: "supportingFiles",
    title: /^School level underlying data \d{4}$/i,
    dir: "data/raw/dfe_schools_per_school",
    name: (_year, published) => published
  }
];

const dryRun = process.argv.includes("--dry-run");
const manifestPath = path.resolve("data/raw/manifests/dfe_pupil_characteristics.json");
const sha256 = (buf) => createHash("sha256").update(buf).digest("hex");
const previous = existsSync(manifestPath) ? JSON.parse(readFileSync(manifestPath, "utf8")) : { attempts: [] };
const attempts = previous.attempts ?? [];
let release = previous.release ?? null;

async function robotsStatus(origin, pathPrefix) {
  try {
    const res = await fetch(`${origin}/robots.txt`, { headers: { "user-agent": USER_AGENT } });
    if (res.status === 404) return "absent";
    if (!res.ok) return `unreadable_http_${res.status}`;
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

function fail(message, attempt) {
  if (attempt) attempts.push(attempt);
  if (!dryRun) writeManifest();
  console.error(message);
  process.exit(1);
}

async function nextData(url, robots) {
  const res = await fetch(url, { headers: { "user-agent": USER_AGENT } });
  if (!res.ok) {
    fail(`${url} returned ${res.status}`, {
      url, attempted_at: new Date().toISOString(), outcome: `http_${res.status}`,
      http_status: res.status, robots_status: robots, user_agent: USER_AGENT
    });
  }
  const html = await res.text();
  const m = html.match(/<script id="__NEXT_DATA__" type="application\/json">([\s\S]*?)<\/script>/);
  if (!m) {
    fail(`${url} carries no page data; the Explore Education Statistics page has changed`, {
      url, attempted_at: new Date().toISOString(), outcome: "no_page_data",
      http_status: res.status, robots_status: robots, user_agent: USER_AGENT
    });
  }
  return { finalUrl: res.url, props: JSON.parse(m[1]).props?.pageProps ?? {} };
}

const pageRobots = await robotsStatus(EES, "/find-statistics/");
if (pageRobots === "disallowed") {
  fail("Explore Education Statistics robots.txt disallows /find-statistics; stopping", {
    url: PUBLICATION, attempted_at: new Date().toISOString(), outcome: "robots_disallowed",
    http_status: null, robots_status: pageRobots, user_agent: USER_AGENT
  });
}

const landing = await nextData(PUBLICATION, pageRobots);
const summary = landing.props.releaseVersionSummary;
if (!summary?.id || !summary?.yearTitle || !summary?.slug) {
  fail("No release version on the publication page", {
    url: PUBLICATION, attempted_at: new Date().toISOString(), outcome: "no_release",
    http_status: 200, robots_status: pageRobots, user_agent: USER_AGENT
  });
}
if (!summary.isLatestRelease) console.warn(`warning: ${summary.title} is not flagged as the latest release`);

const guidanceUrl = `${PUBLICATION}/${summary.slug}/data-guidance`;
const guidance = await nextData(guidanceUrl, pageRobots);
const content = guidance.props.dataContent ?? {};
if (content.releaseVersionId !== summary.id) {
  fail(`Data guidance is for release version ${content.releaseVersionId}, the page for ${summary.id}`, {
    url: guidanceUrl, attempted_at: new Date().toISOString(), outcome: "release_mismatch",
    http_status: 200, robots_status: pageRobots, user_agent: USER_AGENT
  });
}

release = {
  publication: summary.publication?.title ?? landing.props.publicationSummary?.title,
  title: summary.title,
  yearTitle: summary.yearTitle,
  releaseVersionId: summary.id,
  published: (summary.published ?? "").slice(0, 10),
  lastUpdated: (summary.lastUpdated ?? "").slice(0, 10),
  updateCount: summary.updateCount ?? null,
  page: landing.finalUrl
};
console.log(`${release.publication}, ${release.title}: published ${release.published}, last updated ${release.lastUpdated}`);

const targets = WANTED.map((w) => {
  const hits = (content[w.kind] ?? []).filter((f) => w.title.test((f.title ?? "").trim()));
  if (hits.length !== 1) {
    fail(`Expected one ${w.kind} entry titled like ${w.title} in ${guidanceUrl}, found ${hits.length}`, {
      url: guidanceUrl, attempted_at: new Date().toISOString(), outcome: "file_not_found",
      http_status: 200, robots_status: pageRobots, user_agent: USER_AGENT
    });
  }
  const hit = hits[0];
  return {
    ...w,
    fileId: hit.fileId,
    title: hit.title,
    // A data set downloads through the catalogue's "download this data using code" URL
    // (the release file endpoint returns an empty body for it); a supporting file through
    // the release's file endpoint, as the data guidance links it.
    url: w.kind === "dataSets"
      ? `${EES}/data-catalogue/data-set/${hit.dataSetFileId}/csv`
      : `${CONTENT}/api/releases/${summary.id}/files/${hit.fileId}`,
    fileName: w.name(summary.yearTitle, hit.filename)
  };
});

for (const t of targets) console.log(`  ${t.title} -> ${t.dir}/${t.fileName}`);
if (dryRun) process.exit(0);

const robotsFor = {
  [EES]: await robotsStatus(EES, "/data-catalogue/"),
  [CONTENT]: await robotsStatus(CONTENT, "/api/releases/")
};
let failed = false;
for (const t of targets) {
  const fileRobots = robotsFor[new URL(t.url).origin];
  if (fileRobots === "disallowed") {
    fail(`robots.txt disallows ${t.url}; stopping`, {
      url: t.url, attempted_at: new Date().toISOString(), outcome: "robots_disallowed",
      http_status: null, robots_status: fileRobots, user_agent: USER_AGENT
    });
  }
  const res = await fetch(t.url, { headers: { "user-agent": USER_AGENT } });
  const attempt = {
    url: t.url,
    attempted_at: new Date().toISOString(),
    outcome: res.ok ? "stored" : `http_${res.status}`,
    http_status: res.status,
    robots_status: fileRobots,
    user_agent: USER_AGENT,
    file_name: t.fileName,
    title: t.title,
    release_version_id: summary.id
  };
  if (res.ok) {
    const bytes = Buffer.from(await res.arrayBuffer());
    const head = bytes.subarray(0, 200).toString("utf8");
    if (!/^﻿?"?time_period"?,/.test(head)) {
      fail(`${t.fileName} does not start with a time_period column; got ${JSON.stringify(head.slice(0, 60))}`, { ...attempt, outcome: "not_expected_csv" });
    }
    attempt.blob_sha256 = sha256(bytes);
    attempt.bytes = bytes.length;
    const dir = path.resolve(t.dir);
    mkdirSync(dir, { recursive: true });
    const target = path.join(dir, t.fileName);
    if (existsSync(target) && sha256(readFileSync(target)) === attempt.blob_sha256) {
      attempt.outcome = "unchanged";
    } else {
      writeFileSync(target, bytes);
    }
  } else {
    failed = true;
  }
  attempts.push(attempt);
  console.log(`${attempt.outcome} ${t.fileName} ${attempt.blob_sha256 ?? ""}`);
}
writeManifest();
if (failed) process.exit(1);

function writeManifest() {
  const current = {};
  for (const w of WANTED) {
    const latest = [...attempts].reverse().find((a) => a.blob_sha256 && a.title && w.title.test(a.title));
    if (latest) current[w.key] = { fileName: latest.file_name, fileSha256: latest.blob_sha256, sizeBytes: latest.bytes, sourceUrl: latest.url };
  }
  const manifest = {
    dataset: "dfe_pupil_characteristics",
    publisher: "Department for Education",
    cadence: "annual (June), with in-place updates",
    landing: PUBLICATION,
    note: "The academic year and census date are read from the files' time_period column by the transforms, not from this manifest. The ethnicity and language file is stored with the academic year in its name so that the model's calibration input (the unsuffixed file read by validate_schools.mjs) is never overwritten.",
    release,
    current,
    attempts
  };
  mkdirSync(path.dirname(manifestPath), { recursive: true });
  writeFileSync(manifestPath, JSON.stringify(manifest, null, 2) + "\n");
  if (statSync(manifestPath).size > 200_000) console.warn("dfe_pupil_characteristics manifest is over 200 KB; prune old attempts");
}
