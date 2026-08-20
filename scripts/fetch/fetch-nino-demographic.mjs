/**
 * DWP Stat-Xplore NINo cube — LA × Age band × Sex, rolling year ending
 * Q4 2025 (4 quarters summed).
 *
 * Cells: 363 LAs × 11 age bands × 2 sex × 4 quarters = 31,944 cells.
 * Comfortably under the 1M-cell Stat-Xplore limit.
 */
import { mkdirSync, writeFileSync, existsSync, statSync } from "node:fs";
import path from "node:path";

const KEY = process.env.STATXPLORE_API_KEY;
if (!KEY) {
  console.error("ERROR: STATXPLORE_API_KEY env var not set.");
  process.exit(2);
}

const outDir = path.resolve(process.cwd(), "data/raw/supplementary");
mkdirSync(outDir, { recursive: true });
const outPath = path.join(outDir, "nino-demographic-cube.json");

const QTR_FIELD = "str:field:Ninos:F_NINO_QTR:QTR_NAME";
const QTR_VALUE_PREFIX = "str:value:Ninos:F_NINO_QTR:QTR_NAME:C_NINO_QTR:";

const cubeRequest = {
  database: "str:database:Ninos",
  measures: ["str:count:Ninos:V_F_NINOS"],
  dimensions: [
    ["str:valueset:Ninos:V_F_NINOS:UK_COA:V_C_MASTERGEOG11_LA_TO_REGION_NI"],
    ["str:valueset:Ninos:V_F_NINOS:AGE_CODE:C_NINO_AGE_BAND"],
    ["str:valueset:Ninos:V_F_NINOS:CCSEX_CODE:C_NINO_CCSEX"],
    [QTR_FIELD],
  ],
  recodes: {
    [QTR_FIELD]: {
      map: ["202503", "202506", "202509", "202512"].map((q) => [`${QTR_VALUE_PREFIX}${q}`]),
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
  console.error(`HTTP ${res.status}: ${text.slice(0, 500)}`);
  process.exit(1);
}

const cube = await res.json();
writeFileSync(outPath, JSON.stringify(cube));
console.log(`Written ${outPath} (${(statSync(outPath).size / 1024).toFixed(0)} KB)`);
