/**
 * Census 2021 RM021 — Economic activity status by passports held, per LA.
 *
 * Per-LA answer to "of {nationality group} residents in {LA}, what fraction
 * are in employment / unemployed / economically inactive?" Passports-held is
 * the closest LA-level Census 2021 proxy for "non-UK origin"; country-of-
 * birth × economic activity is national/regional only.
 *
 * NOMIS dataset: NM_2121_1 (RM021)
 * Geography: TYPE424 (LA district / unitary, April 2023)
 *
 * Output: data/raw/census_econ_passport/rm021_econ_passport_la.csv
 */
import { mkdirSync, writeFileSync, statSync } from "node:fs";
import path from "node:path";

const rawDir = path.resolve(process.cwd(), "data/raw/census_econ_passport");
mkdirSync(rawDir, { recursive: true });
const outPath = path.join(rawDir, "rm021_econ_passport_la.csv");

// All economic activity codes (0=Total + 9 leaf + 3 aggregates) and
// all passport codes (0=Total + 11 categories)
const ECON_CODES = "0,1,2,3,4,5,6,7,8,9,1001,1002,1003";
const PASS_CODES = "0,1,2,3,4,5,6,7,8,9,10,1001,1002";

const URL =
  "https://www.nomisweb.co.uk/api/v01/dataset/NM_2121_1.data.csv?" +
  "date=latest&geography=TYPE424&" +
  `c2021_eastat_10=${ECON_CODES}&` +
  `c2021_pass_11=${PASS_CODES}&` +
  "measures=20100&select=GEOGRAPHY_CODE,GEOGRAPHY_NAME,C2021_EASTAT_10,C2021_EASTAT_10_NAME,C2021_PASS_11,C2021_PASS_11_NAME,OBS_VALUE";

console.log("Fetching NOMIS RM021 (Economic activity by passports held)...");
const res = await fetch(URL);
if (!res.ok) {
  console.error(`HTTP ${res.status}: ${(await res.text()).slice(0, 400)}`);
  process.exit(1);
}
const text = await res.text();
writeFileSync(outPath, text, "utf8");
const lines = text.split("\n").filter((l) => l.trim()).length;
console.log(`Written ${outPath} (${lines} rows, ${(statSync(outPath).size / 1024).toFixed(0)} KB)`);
