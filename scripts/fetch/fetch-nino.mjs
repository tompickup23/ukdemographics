/**
 * Fetch DWP NINo registrations to adult overseas nationals — LA × Nationality
 * × Quarter cube, via Stat-Xplore JSON API.
 *
 * The gov.uk bulk download for this dataset stopped after Dec 2022 and the
 * historical bulk files only ever published LA × world region (7 buckets),
 * never LA × full nationality. The detailed cross-tab lives only on
 * Stat-Xplore and requires a free API key.
 *
 * To use:
 *   1. Register at https://stat-xplore.dwp.gov.uk/webapi/jsf/login.xhtml
 *   2. Confirmation email → Tools → Open Data API → copy key
 *   3. export STATXPLORE_API_KEY=...
 *   4. node scripts/fetch/fetch-nino.mjs
 *
 * Outputs: data/raw/supplementary/nino-statxplore-cube.json
 */
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";

const KEY = process.env.STATXPLORE_API_KEY;
if (!KEY) {
  console.error("ERROR: STATXPLORE_API_KEY env var not set.");
  console.error("Register at https://stat-xplore.dwp.gov.uk/webapi/jsf/login.xhtml then export the key.");
  process.exit(2);
}

const rawDir = path.resolve(process.cwd(), "data/raw/supplementary");
mkdirSync(rawDir, { recursive: true });
const outPath = path.join(rawDir, "nino-statxplore-cube.json");

// Cube specification. Field IDs follow Stat-Xplore's standard schema.
// If a field ID is wrong the API returns a 400 with a helpful message
// naming the valid alternatives — adjust here based on the response.
// Stat-Xplore enforces a 1M-cell hard limit per request. Full series
// (~360 LAs × ~235 nationalities × 96 quarters) is 8.2M cells, so we
// recode time to the last 8 quarters — rolling year plus prior year for
// YoY — which fits comfortably under the limit (~677K cells) and is
// exactly what the transform consumes.
const QTR_FIELD = "str:field:Ninos:F_NINO_QTR:QTR_NAME";
const QTR_VALUE_PREFIX = "str:value:Ninos:F_NINO_QTR:QTR_NAME:C_NINO_QTR:";
const recentQuarters = [
  "202403", "202406", "202409", "202412",
  "202503", "202506", "202509", "202512",
];

const cubeRequest = {
  database: "str:database:Ninos",
  measures: ["str:count:Ninos:V_F_NINOS"],
  dimensions: [
    ["str:valueset:Ninos:V_F_NINOS:UK_COA:V_C_MASTERGEOG11_LA_TO_REGION_NI"],
    ["str:valueset:Ninos:V_F_NINOS:NEWNAT:C_NINO_COUNTRY"],
    [QTR_FIELD],
  ],
  recodes: {
    [QTR_FIELD]: {
      map: recentQuarters.map((q) => [`${QTR_VALUE_PREFIX}${q}`]),
      total: false,
    },
  },
};

const url = "https://stat-xplore.dwp.gov.uk/webapi/rest/v1/table";

console.log("POST", url);
const res = await fetch(url, {
  method: "POST",
  headers: {
    "APIKey": KEY,
    "Content-Type": "application/json",
    "Accept": "application/json",
  },
  body: JSON.stringify(cubeRequest),
});

if (!res.ok) {
  const text = await res.text();
  console.error(`HTTP ${res.status}:`, text.slice(0, 1000));
  if (res.status === 400) {
    console.error("\nField IDs may need adjusting. Hit the schema endpoint to inspect:");
    console.error("  curl -H \"APIKey: $STATXPLORE_API_KEY\" https://stat-xplore.dwp.gov.uk/webapi/rest/v1/schema/str:database:NINO");
  }
  process.exit(1);
}

const cube = await res.json();
writeFileSync(outPath, JSON.stringify(cube));
const sizeKb = (Buffer.byteLength(JSON.stringify(cube)) / 1024).toFixed(0);
console.log(`Written ${outPath} (${sizeKb} KB)`);
