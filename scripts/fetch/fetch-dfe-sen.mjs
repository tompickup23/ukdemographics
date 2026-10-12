/**
 * Fetch DfE "Special educational needs in England" figures from the statistics API.
 *
 *   node scripts/fetch/fetch-dfe-sen.mjs [--dry-run]
 *
 * Replaces the SEND entry in fetch-supplementary-data.mjs, which named one release id
 * and so kept downloading the 2024/25 ZIP after 2025/26 was out. Nothing here names a
 * year or an id that changes between releases:
 *
 *   1. the publication is found by its slug in the API's publication list;
 *   2. its data sets are found by title, and each one's latest version gives the edition
 *      (the last academic year it covers);
 *   3. filter and indicator ids are read from each data set's metadata by label text;
 *   4. two queries ask for exactly the rows the transform needs, at local authority and
 *      national level: pupils by SEN provision (headcount and DfE's percentage of
 *      pupils) for the latest year and five years before, and pupils with an EHC plan by
 *      primary type of need for the latest year.
 *
 * The API needs no key. Every response is kept verbatim under data/raw/dfe_sen/ and every
 * request is recorded in data/raw/manifests/dfe_sen.json with UKSkynet's retrieval field
 * names, including the query body, so a run can be repeated exactly.
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import { download, loadManifest, politeGet, writeManifest } from "../lib/retrieval-log.mjs";

const API = "https://api.education.gov.uk/statistics/v1";
const SLUG = "special-educational-needs-in-england";
const DATA_SETS = {
  provision: /^Pupils in all schools, by type of SEN provision\b/i,
  need: /^Ethnicity by type of SEN provision and type of need\b/i
};

const dryRun = process.argv.includes("--dry-run");
const rawDir = path.resolve("data/raw/dfe_sen");
const manifestPath = path.resolve("data/raw/manifests/dfe_sen.json");
const manifest = loadManifest(manifestPath);
const attempts = manifest.attempts ?? [];

function die(message) {
  console.error(`fetch-dfe-sen: ${message}`);
  if (!dryRun) save();
  process.exit(1);
}

function save() {
  writeManifest(
    manifestPath,
    {
      dataset: "dfe_sen",
      publisher: "Department for Education",
      cadence: "annual",
      landing: `https://explore-education-statistics.service.gov.uk/find-statistics/${SLUG}`,
      api: API,
      note: "Edition, publication date and every figure are read from the stored API responses by scripts/transform/transform_send.py. The current entry is the provision query; every response of a run is listed in attempts."
    },
    attempts
  );
}

// 1. Publication by slug.
const pubs = await politeGet(`${API}/publications?search=${encodeURIComponent("special educational needs")}&pageSize=40`, { as: "json" });
const publication = (pubs.results ?? []).find((p) => p.slug === SLUG);
if (!publication) die(`no publication with slug ${SLUG} in the API list`);

// 2. Data sets by title.
const listUrl = `${API}/publications/${publication.id}/data-sets?pageSize=20`;
const list = await politeGet(listUrl, { as: "json" });
if (list.paging?.totalPages !== 1) die(`the data set list spans ${list.paging?.totalPages} pages; page through it`);
const chosen = {};
for (const [key, pattern] of Object.entries(DATA_SETS)) {
  const hits = (list.results ?? []).filter((d) => pattern.test(d.title));
  if (hits.length !== 1) die(`expected one data set titled ${pattern}, found ${hits.length}`);
  chosen[key] = hits[0];
}
const ends = new Set(Object.values(chosen).map((d) => d.latestVersion.timePeriods.end));
if (ends.size !== 1) die(`data sets end in different years: ${[...ends].join(", ")}`);
const end = [...ends][0]; // "2025/26"
const edition = end.replace("/", "-");
console.log(`${publication.title}: edition ${end}, data sets ${Object.values(chosen).map((d) => `${d.title} v${d.latestVersion.version}`).join("; ")}`);
if (dryRun) process.exit(0);

async function keep(url, fileName, extra, request) {
  const attempt = await download(url, rawDir, fileName, { edition: end, landing_page: listUrl, ...extra }, request);
  attempts.push(attempt);
  console.log(`  ${attempt.outcome} ${attempt.file_name} ${attempt.blob_sha256 ?? ""}`);
  if (!attempt.blob_sha256) die(`${url} failed: ${attempt.outcome}`);
  return JSON.parse(readFileSync(path.join(rawDir, attempt.file_name), "utf8"));
}

// The data set list itself: it carries the titles, versions and publication dates.
await keep(listUrl, `sen-api-datasets_${edition}.json`, { role: "data_set_list" });

// 3. Metadata, then ids by label.
const meta = {};
for (const [key, ds] of Object.entries(chosen)) {
  const url = `${API}/data-sets/${ds.id}/meta?dataSetVersion=${ds.latestVersion.version}`;
  meta[key] = await keep(url, `sen-api-${key}-meta_${edition}.json`, { role: "metadata", data_set_id: ds.id, data_set_version: ds.latestVersion.version });
}
const filterOption = (m, filterLabel, optionLabel) => {
  const f = m.filters.find((x) => x.label === filterLabel);
  if (!f) die(`no filter "${filterLabel}"`);
  const o = f.options.find((x) => x.label === optionLabel);
  if (!o) die(`no option "${optionLabel}" in filter "${filterLabel}"`);
  return o.id;
};
const indicator = (m, label) => {
  const i = m.indicators.find((x) => x.label === label);
  if (!i) die(`no indicator "${label}"`);
  return i.id;
};
const period = (m, label) => {
  const t = m.timePeriods.find((x) => x.label === label);
  if (!t) die(`no time period ${label}`);
  return { period: t.period, code: t.code };
};
const startYear = Number(end.slice(0, 4));
const prior = `${startYear - 5}/${String(startYear - 4).slice(2)}`;

// 4. Queries.
const p = meta.provision;
const provisionBody = {
  criteria: {
    and: [
      { filters: { eq: filterOption(p, "Hospital school flag", "Total") } },
      { filters: { eq: filterOption(p, "Phase type of school", "Total") } },
      { filters: { eq: filterOption(p, "School type (detailed)", "Total") } },
      { geographicLevels: { in: ["LA", "NAT"] } },
      { timePeriods: { in: [period(p, end), period(p, prior)] } }
    ]
  },
  indicators: [indicator(p, "Headcount of pupils"), indicator(p, "Percentage of pupils")],
  page: 1,
  pageSize: 10000
};
const n = meta.need;
const needBody = {
  criteria: {
    and: [
      { filters: { eq: filterOption(n, "Phase type of school", "Total") } },
      { filters: { eq: filterOption(n, "Pupil major ethnicity breakdown", "Total") } },
      { filters: { eq: filterOption(n, "Pupil minor ethnicity breakdown", "Total") } },
      { filters: { eq: filterOption(n, "SEN provision", "Education, health and care plan") } },
      { geographicLevels: { in: ["LA", "NAT"] } },
      { timePeriods: { in: [period(n, end)] } }
    ]
  },
  indicators: [indicator(n, "Count of pupils")],
  page: 1,
  pageSize: 10000
};
for (const [key, body] of [["need", needBody], ["provision", provisionBody]]) {
  const ds = chosen[key];
  const url = `${API}/data-sets/${ds.id}/query?dataSetVersion=${ds.latestVersion.version}`;
  const res = await keep(url, `sen-api-${key}_${edition}.json`, { role: "query", data_set_id: ds.id, data_set_version: ds.latestVersion.version }, { body });
  if (res.paging?.totalPages !== 1) die(`${key} query spans ${res.paging?.totalPages} pages; raise pageSize or page through`);
}

save();
