/**
 * DWP Stat-Xplore PIP_Monthly_new — claimant count per Westminster
 * Parliamentary Constituency for the latest published month.
 *
 * Output: data/raw/supplementary/pip-pcon-latest.json
 */
import { mkdirSync, writeFileSync, statSync } from "node:fs";
import path from "node:path";

const KEY = process.env.STATXPLORE_API_KEY;
if (!KEY) {
  console.error("ERROR: STATXPLORE_API_KEY env var not set.");
  process.exit(2);
}

const outDir = path.resolve(process.cwd(), "data/raw/supplementary");
mkdirSync(outDir, { recursive: true });
const outPath = path.join(outDir, "pip-pcon-latest.json");

// Default DATE2 dimension (no recode) returns the latest month.
const cubeRequest = {
  database: "str:database:PIP_Monthly_new",
  measures: ["str:count:PIP_Monthly_new:V_F_PIP_MONTHLY"],
  dimensions: [
    ["str:valueset:PIP_Monthly_new:V_F_PIP_MONTHLY:PCON24:V_C_MASTERGEOG21_PARLC24_TO_REGION"],
  ],
};

const url = "https://stat-xplore.dwp.gov.uk/webapi/rest/v1/table";
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
  console.error(`HTTP ${res.status}: ${(await res.text()).slice(0, 400)}`);
  process.exit(1);
}
const cube = await res.json();
writeFileSync(outPath, JSON.stringify(cube));
console.log(`Wrote ${outPath} (${(statSync(outPath).size / 1024).toFixed(0)} KB)`);
