/**
 * Fetch DWP NINo registrations historical series — calendar years 2002
 * through 2025, one calendar year per request to stay under the 1M-cell
 * Stat-Xplore limit.
 *
 * Per-year cube: 363 LAs × 235 nationalities × 4 quarters ≈ 341K cells.
 * Comfortably below the 1M cap.
 *
 * Caches each year to data/raw/supplementary/nino-by-year/{year}.json so
 * subsequent runs only fetch missing years.
 *
 * Requires STATXPLORE_API_KEY in env.
 */
import { mkdirSync, writeFileSync, existsSync, statSync } from "node:fs";
import path from "node:path";

const KEY = process.env.STATXPLORE_API_KEY;
if (!KEY) {
  console.error("ERROR: STATXPLORE_API_KEY env var not set.");
  console.error("Register at https://stat-xplore.dwp.gov.uk/webapi/jsf/login.xhtml then export the key.");
  process.exit(2);
}

const yearArg = process.argv[2];
const startYear = yearArg ? parseInt(yearArg, 10) : 2002;
const endYear = 2025;

const QTR_FIELD = "str:field:Ninos:F_NINO_QTR:QTR_NAME";
const QTR_VALUE_PREFIX = "str:value:Ninos:F_NINO_QTR:QTR_NAME:C_NINO_QTR:";

const outDir = path.resolve(process.cwd(), "data/raw/supplementary/nino-by-year");
mkdirSync(outDir, { recursive: true });

const url = "https://stat-xplore.dwp.gov.uk/webapi/rest/v1/table";

function quartersForYear(year) {
  // QTR codes are YYYYMM where MM is the last month of the quarter
  return [`${year}03`, `${year}06`, `${year}09`, `${year}12`];
}

function buildRequest(year) {
  return {
    database: "str:database:Ninos",
    measures: ["str:count:Ninos:V_F_NINOS"],
    dimensions: [
      ["str:valueset:Ninos:V_F_NINOS:UK_COA:V_C_MASTERGEOG11_LA_TO_REGION_NI"],
      ["str:valueset:Ninos:V_F_NINOS:NEWNAT:C_NINO_COUNTRY"],
      [QTR_FIELD],
    ],
    recodes: {
      [QTR_FIELD]: {
        map: quartersForYear(year).map((q) => [`${QTR_VALUE_PREFIX}${q}`]),
        total: false,
      },
    },
  };
}

async function fetchYear(year) {
  const outPath = path.join(outDir, `${year}.json`);
  if (existsSync(outPath) && statSync(outPath).size > 100_000) {
    return { year, status: "cached", bytes: statSync(outPath).size };
  }
  const body = buildRequest(year);
  const res = await fetch(url, {
    method: "POST",
    headers: {
      "APIKey": KEY,
      "Content-Type": "application/json",
      "Accept": "application/json",
    },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const text = await res.text();
    return { year, status: "error", code: res.status, message: text.slice(0, 300) };
  }
  const json = await res.json();
  writeFileSync(outPath, JSON.stringify(json));
  const bytes = statSync(outPath).size;
  return { year, status: "fetched", bytes };
}

const years = [];
for (let y = startYear; y <= endYear; y++) years.push(y);

console.log(`Fetching NINo cube for ${years.length} year(s): ${years[0]}..${years[years.length-1]}`);
let totalBytes = 0;
let fetched = 0;
let cached = 0;
for (const y of years) {
  const r = await fetchYear(y);
  if (r.status === "fetched") {
    fetched++;
    totalBytes += r.bytes;
    console.log(`  ${y}: fetched (${(r.bytes / 1024).toFixed(0)} KB)`);
  } else if (r.status === "cached") {
    cached++;
    console.log(`  ${y}: cached (${(r.bytes / 1024).toFixed(0)} KB)`);
  } else {
    console.log(`  ${y}: ERROR ${r.code}: ${r.message}`);
    if (r.code === 429) {
      console.log(`  rate-limited; sleeping 30s and retrying once`);
      await new Promise((r) => setTimeout(r, 30000));
      const retry = await fetchYear(y);
      if (retry.status === "fetched") fetched++;
    }
  }
  // Be polite — Stat-Xplore typically tolerates 1-2 req/s
  await new Promise((r) => setTimeout(r, 800));
}
console.log(`\nDone. Fetched ${fetched}, cached ${cached}, total ${(totalBytes / (1024*1024)).toFixed(1)} MB new.`);
