/**
 * Fetch ONS Census 2021 TS012 — Country of birth (detailed) at LA level.
 *
 * Pairs with NINo registration flow data: TS012 is the STOCK of who already
 * lives in each LA by country of birth (Census Day 21 March 2021), while
 * NINo is the FLOW of who is registering for an NI number now. Together
 * they distinguish "established community" from "current arrivals".
 *
 * NOMIS dataset: NM_2032_1 (TS012)
 * Geography: TYPE424 (local authorities district/unitary, April 2023)
 * Dimension: c2021_cob_58 (84 codes; leaf countries are values 0-83;
 *   aggregate codes 1001-1018 are collapsed parents and excluded.)
 *
 * Output: data/raw/census_country_of_birth/ts012_cob_la.csv
 */
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";

const rawDir = path.resolve("data/raw/census_country_of_birth");
mkdirSync(rawDir, { recursive: true });

const codes = Array.from({ length: 84 }, (_, i) => i).join(",");

const URL =
  "https://www.nomisweb.co.uk/api/v01/dataset/NM_2032_1.data.csv?" +
  "date=latest&" +
  "geography=TYPE424&" +
  `c2021_cob_58=${codes}&` +
  "measures=20100&" +
  "select=GEOGRAPHY_CODE,GEOGRAPHY_NAME,C2021_COB_58,C2021_COB_58_NAME,OBS_VALUE";

const outPath = path.join(rawDir, "ts012_cob_la.csv");

console.log("Fetching NOMIS TS012 country-of-birth at LA level...");
const res = await fetch(URL);
if (!res.ok) {
  console.error(`HTTP ${res.status}: ${(await res.text()).slice(0, 400)}`);
  process.exit(1);
}
const text = await res.text();
writeFileSync(outPath, text, "utf8");
const lines = text.split("\n").filter((l) => l.trim()).length;
console.log(`Written ${outPath} (${lines} rows)`);
