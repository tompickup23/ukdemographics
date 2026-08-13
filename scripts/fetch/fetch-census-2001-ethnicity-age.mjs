/**
 * Fetch Census 2001 ST101: Sex and age by ethnic group, at 2011 LA boundaries.
 *
 * This exists to make a genuinely out-of-sample validation possible.
 *
 * The model's own backcast builds cohort change ratios from the 2011 and 2021
 * Censuses and then tests them against 2021. That is circular: with the internal
 * guardrails removed it reproduces the target to 0.14pp by construction, because
 * the ratios are the 2021 population over the 2011 population applied back to
 * 2011. It cannot referee a choice between guardrail settings, and neither can
 * the DfE school data, which the forward model already consumes as a calibration
 * input.
 *
 * Census 2001 breaks the circle. Ratios built on 2001 to 2011 and projected
 * forward to 2021 are a real forecast: the fitting window never touches the
 * target. It is also the exact analogue of what the published model does, which
 * is fit on 2011 to 2021 and project to 2031 and beyond, so whatever error it
 * shows is the error the published projections carry.
 *
 * NOMIS dataset: NM_1869_1 (ST101). ONS publishes it on TYPE464, the 2011 local
 * authority geography, which is the same geography as DC2101EW, so the two
 * censuses line up without a boundary crosswalk.
 *
 * 2001 used 16 detailed ethnic groups against 18 in 2011 and 20 in 2021. The
 * validation therefore scores the six broad groups the site publishes, which are
 * stable across all three censuses. Chinese sits under "Chinese/Other" in 2001
 * and under "Asian" from 2011; it is mapped to asian throughout so the series is
 * consistent.
 *
 * Output: data/raw/census_2001_ethnicity_age/st101_ethnicity_sex_age_la.csv
 */
import { mkdirSync, writeFileSync, existsSync } from "node:fs";
import path from "node:path";

const rawDir = path.resolve("data/raw/census_2001_ethnicity_age");
mkdirSync(rawDir, { recursive: true });
const OUT = path.join(rawDir, "st101_ethnicity_sex_age_la.csv");

const BASE = "https://www.nomisweb.co.uk/api/v01/dataset/NM_1869_1.data.csv";
const SELECT = "GEOGRAPHY_CODE,GEOGRAPHY_NAME,C_ETHPUK11,C_ETHPUK11_NAME,C_SEX,C_SEX_NAME,C_AGE,C_AGE_NAME,OBS_VALUE";

// The 16 detailed 2001 groups. The aggregate codes (100, 200, ...) and the
// all-categories code (0) are skipped so nothing is double counted.
const ETH_CODES = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16];

// 348 LAs x 22 age bands x 2 sexes = 15,312 rows per ethnic group, inside the
// NOMIS 25,000 row cap, so one request per group.
const AGE = "1...22";
const SEX = "1,2";

async function fetchGroup(eth) {
  const url =
    `${BASE}?geography=TYPE464&c_ethpuk11=${eth}&c_age=${AGE}&c_sex=${SEX}` +
    `&measures=20100&select=${SELECT}`;
  for (let attempt = 1; attempt <= 4; attempt++) {
    try {
      const res = await fetch(url);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const text = await res.text();
      const lines = text.trim().split("\n");
      if (lines.length < 2) throw new Error("empty response");
      return lines;
    } catch (err) {
      if (attempt === 4) throw err;
      console.log(`    retry ${attempt} for group ${eth}: ${err.message}`);
      await new Promise((r) => setTimeout(r, 1500 * attempt));
    }
  }
}

if (existsSync(OUT) && !process.argv.includes("--force")) {
  console.log(`${OUT} already present. Pass --force to refetch.`);
  process.exit(0);
}

console.log("Fetching Census 2001 ST101 from NOMIS (16 ethnic groups)...");
let header = null;
const rows = [];
for (const eth of ETH_CODES) {
  const lines = await fetchGroup(eth);
  if (!header) header = lines[0];
  rows.push(...lines.slice(1));
  console.log(`  group ${String(eth).padStart(2)}: ${lines.length - 1} rows`);
}

writeFileSync(OUT, [header, ...rows].join("\n"), "utf8");
console.log(`\nWrote ${rows.length} rows to ${OUT}`);
