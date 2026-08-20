/**
 * Fetch three Census 2021 tables from NOMIS at LA level (TYPE154 — 2022
 * local authority districts) and pivot to per-LA JSON ready for the
 * UK Demographics place pages.
 *
 *   TS029  NM_2048_1   Proficiency in English
 *   RM043  NM_2143_1   General health by ethnic group by age
 *   RM134  NM_2234_1   Tenure by ethnic group (Household Reference Persons)
 *
 * No auth. The CSV endpoint takes filter dimensions inline. Each table
 * fits comfortably in one request because TYPE154 + selected dimensions
 * keeps the cell count under ~20k.
 *
 * Output:
 *   src/data/live/census-english-proficiency.json
 *   src/data/live/census-tenure-ethnic.json
 *   src/data/live/census-health-ethnic.json
 *
 * Refresh cadence: Census data is fixed at the 2021 reference date until
 * the next census, so this is a one-shot fetch. We pin a `lastFetched`
 * timestamp for traceability and re-run only if NOMIS retracts/reissues
 * a table (rare).
 */
import { mkdirSync, writeFileSync } from "node:fs";

const BASE = "https://www.nomisweb.co.uk/api/v01/dataset";
const OUT_DIR = "src/data/live";
mkdirSync(OUT_DIR, { recursive: true });

// CSV record parser — handles quoted strings with commas inside.
function parseCsv(csv) {
  const lines = csv.trim().split("\n");
  const headers = parseCsvLine(lines[0]);
  return lines.slice(1).map((line) => {
    const cells = parseCsvLine(line);
    const row = {};
    headers.forEach((h, i) => (row[h] = cells[i]));
    return row;
  });
}

function parseCsvLine(line) {
  const out = [];
  let cur = "";
  let inQ = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      inQ = !inQ;
    } else if (ch === "," && !inQ) {
      out.push(cur);
      cur = "";
    } else {
      cur += ch;
    }
  }
  out.push(cur);
  return out;
}

async function fetchCsv(url) {
  const r = await fetch(url);
  if (!r.ok) throw new Error(`HTTP ${r.status}: ${url}`);
  return r.text();
}

// ---------- TS029 — Proficiency in English ----------
async function buildEnglishProficiency() {
  // C2021_ENGPRF_6 codes:
  //   0    Total: all usual residents aged 3+
  //   1    Main language is English
  //   1001 Main language is not English (subtotal)
  //   2    Not English, can speak English very well
  //   3    Not English, can speak English well
  //   4    Not English, cannot speak English well
  //   5    Not English, cannot speak English
  const url = `${BASE}/NM_2048_1.data.csv?geography=TYPE154&c2021_engprf_6=0,1,2,3,4,5&measures=20100`;
  const rows = parseCsv(await fetchCsv(url));

  // NOMIS returns the sub-level codes with a leading underscore.
  const labelOf = {
    "0": "total",
    "_1": "mainEnglish",
    "_2": "mainNotEnglishVeryWell",
    "_3": "mainNotEnglishWell",
    "_4": "mainNotEnglishNotWell",
    "_5": "mainNotEnglishCannot",
  };

  const areas = {};
  for (const r of rows) {
    const code = r["GEOGRAPHY_CODE"];
    const lvl = r["C2021_ENGPRF_6_CODE"];
    const v = Number(r["OBS_VALUE"]);
    if (!code || !(lvl in labelOf) || Number.isNaN(v)) continue;
    areas[code] = areas[code] ?? { areaName: r["GEOGRAPHY_NAME"] };
    areas[code][labelOf[lvl]] = v;
  }

  // Derive percentages of "cannot speak well or at all" — the metric that
  // most directly translates to interpreter / ESOL service demand.
  for (const a of Object.values(areas)) {
    if (a.total > 0) {
      a.cannotSpeakWellPct =
        +(((a.mainNotEnglishNotWell ?? 0) + (a.mainNotEnglishCannot ?? 0)) /
          a.total *
          100).toFixed(2);
      a.nonEnglishPct =
        +(((a.total - (a.mainEnglish ?? 0)) / a.total) * 100).toFixed(2);
    }
  }

  return {
    source: "ONS Census 2021 via NOMIS (TS029 - Proficiency in English)",
    sourceUrl: "https://www.nomisweb.co.uk/datasets/c2021ts029",
    nomisDatasetId: "NM_2048_1",
    referenceDate: "2021-03-21",
    lastFetched: new Date().toISOString().slice(0, 10),
    description:
      "Proficiency in English among usual residents aged 3+, per local authority. Derived field cannotSpeakWellPct = (cannot speak well + cannot speak) / total. Census 2021 reference date is 21 March 2021.",
    areas,
  };
}

// ---------- RM134 — Tenure by ethnic group ----------
async function buildTenureByEthnic() {
  // Dimensions: C2021_ETH_8 × C2021_HHTENURE_5 × GEOGRAPHY.
  // We pull the full matrix; total cells per LA = 8 × 5 = 40. With 331
  // LAs that's ~13k rows in one request.
  const url = `${BASE}/NM_2234_1.data.csv?geography=TYPE154&measures=20100`;
  const rows = parseCsv(await fetchCsv(url));

  // Tenure codes (typical HHTENURE_5):
  //   0  Total
  //   1  Owned
  //   2  Shared ownership
  //   3  Social rented
  //   4  Private rented
  //   5  Rent free
  // Ethnic codes (ETH_8):
  //   0  Total
  //   1  Asian, Asian British or Asian Welsh
  //   2  Black, Black British, Black Welsh, Caribbean or African
  //   3  Mixed or multiple ethnic groups
  //   4  White
  //   5  Other ethnic group
  //   6  ... (varies — we capture by name)
  const areas = {};
  for (const r of rows) {
    const code = r["GEOGRAPHY_CODE"];
    if (!code) continue;
    const ethId = r["C2021_ETH_8_CODE"];
    const ethName = r["C2021_ETH_8_NAME"];
    const tenId = r["C2021_HHTENURE_5_CODE"];
    const tenName = r["C2021_HHTENURE_5_NAME"];
    const v = Number(r["OBS_VALUE"]);
    if (Number.isNaN(v)) continue;
    areas[code] = areas[code] ?? { areaName: r["GEOGRAPHY_NAME"], byEthnic: {} };
    const eth = (areas[code].byEthnic[ethName] = areas[code].byEthnic[ethName] ?? {});
    eth[tenName] = v;
  }

  // For each (LA, ethnic group), compute the % owned / social / private.
  // NOMIS tenure labels include a "Rented: " prefix on the sub-levels.
  for (const a of Object.values(areas)) {
    for (const [, byTenure] of Object.entries(a.byEthnic)) {
      const total = byTenure["Total"] ?? 0;
      if (total > 0) {
        byTenure.ownershipPct = +((byTenure["Owned"] ?? 0) / total * 100).toFixed(1);
        byTenure.socialRentPct =
          +((byTenure["Rented: Social rented"] ?? 0) / total * 100).toFixed(1);
        byTenure.privateRentPct =
          +((byTenure["Rented: Private rented or lives rent free"] ?? 0) /
            total *
            100).toFixed(1);
      }
    }
  }

  return {
    source:
      "ONS Census 2021 via NOMIS (RM134 - Tenure by ethnic group, Household Reference Persons)",
    sourceUrl: "https://www.nomisweb.co.uk/datasets/c2021rm134",
    nomisDatasetId: "NM_2234_1",
    referenceDate: "2021-03-21",
    lastFetched: new Date().toISOString().slice(0, 10),
    description:
      "Household tenure (owned / social rent / private rent / other) cross-tabulated with ethnic group of the Household Reference Person, per local authority. Census 2021.",
    areas,
  };
}

// ---------- RM043 — General health by ethnic group by age ----------
async function buildHealthByEthnic() {
  // Dimensions: C2021_ETH_8 × C2021_HEALTH_3 × C2021_AGE_5 × GEOGRAPHY.
  // 8 × 3 × 5 = 120 cells per LA × 331 LAs ≈ 40k rows — still one request.
  // RM043 C2021_HEALTH_3 actually returns 2 sub-categories (probed):
  //   0   Total
  //   _1  Good health
  //   _2  Not good health
  // RM043 is subject to disclosure control, so smaller / less diverse LAs
  // are suppressed. Coverage is ~56% of 331 LAs — the larger, more diverse
  // ones come through, which is the right target for ethnic-group analysis.
  const url = `${BASE}/NM_2143_1.data.csv?geography=TYPE154&c2021_age_5=0&measures=20100`;
  const rows = parseCsv(await fetchCsv(url));

  const areas = {};
  for (const r of rows) {
    const code = r["GEOGRAPHY_CODE"];
    if (!code) continue;
    const ethName = r["C2021_ETH_8_NAME"];
    const healthName = r["C2021_HEALTH_3_NAME"];
    const v = Number(r["OBS_VALUE"]);
    if (Number.isNaN(v)) continue;
    areas[code] = areas[code] ?? { areaName: r["GEOGRAPHY_NAME"], byEthnic: {} };
    const eth = (areas[code].byEthnic[ethName] = areas[code].byEthnic[ethName] ?? {});
    eth[healthName] = v;
  }

  // Derive "not good health" rate per (LA, ethnic group). "Not good health"
  // is the canonical Census 2021 negative-health measure when only the
  // 2-category breakdown is published.
  for (const a of Object.values(areas)) {
    for (const [, h] of Object.entries(a.byEthnic)) {
      const total = h["Total"] ?? 0;
      const bad = h["Not good health"] ?? 0;
      if (total > 0) {
        h.notGoodHealthPct = +(bad / total * 100).toFixed(2);
      }
    }
  }

  return {
    source: "ONS Census 2021 via NOMIS (RM043 - General health by ethnic group by age)",
    sourceUrl: "https://www.nomisweb.co.uk/datasets/c2021rm043",
    nomisDatasetId: "NM_2143_1",
    referenceDate: "2021-03-21",
    lastFetched: new Date().toISOString().slice(0, 10),
    description:
      "Self-reported general health (very good/good / fair / bad/very bad) cross-tabulated with ethnic group, per local authority, all ages. Census 2021. Derived field byEthnic.<group>.badHealthPct.",
    areas,
  };
}

// ---------- Run ----------
const targets = [
  { name: "census-english-proficiency", fn: buildEnglishProficiency },
  { name: "census-tenure-ethnic", fn: buildTenureByEthnic },
  { name: "census-health-ethnic", fn: buildHealthByEthnic },
];

for (const t of targets) {
  console.log(`Fetching ${t.name}...`);
  const out = await t.fn();
  const path = `${OUT_DIR}/${t.name}.json`;
  writeFileSync(path, JSON.stringify(out, null, 2) + "\n");
  console.log(`  Wrote ${Object.keys(out.areas).length} areas → ${path}`);
}
