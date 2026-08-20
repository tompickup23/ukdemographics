/**
 * Fetch ONS LAD24 → CTY24 lookup and write the subset that powers the
 * ASC/SEND district-to-utla fallback on place pages.
 *
 * ASC (Adult Social Care) and SEND are delivered by upper-tier authorities
 * (unitaries E06, metropolitan districts E08, London boroughs E09, and
 * non-metropolitan counties E10). Non-metropolitan districts (E07) do NOT
 * deliver these services — their county does. So a place page for a district
 * needs to fall back to the parent county's ASC/SEND figures, clearly
 * flagged so the reader sees the data is at county scope not district scope.
 *
 * Only E07 → E10 entries are kept. E08/E09 already deliver these services.
 *
 * Source: ONS Open Geography Portal — LAD24_CTY24_EN_LU FeatureServer.
 *
 * Run: node scripts/fetch/fetch-la-hierarchy.mjs
 * Output: src/data/lookups/district-to-utla.json
 *
 * This file changes only on Local Government Reorganisation events
 * (Cumbria/N.Yorks/Somerset 2023; Buckinghamshire 2020). Refresh annually
 * or after any future LGR announcement.
 */
import { mkdirSync, writeFileSync } from "node:fs";

const BASE =
  "https://services1.arcgis.com/ESMARspQHYMw9BZ9/arcgis/rest/services/LAD24_CTY24_EN_LU/FeatureServer/0/query";
const PARAMS =
  "where=1%3D1&outFields=LAD24CD,LAD24NM,CTY24CD,CTY24NM&f=json&resultRecordCount=1000";

const entries = {};
let offset = 0;
while (true) {
  const url = `${BASE}?${PARAMS}&resultOffset=${offset}`;
  const r = await fetch(url);
  if (!r.ok) throw new Error(`HTTP ${r.status} at offset ${offset}`);
  const json = await r.json();
  for (const f of json.features) {
    const { LAD24CD, LAD24NM, CTY24CD, CTY24NM } = f.attributes;
    // Only E07 → E10 (non-met district → non-met county). E08/E09 deliver
    // ASC/SEND themselves and don't need a fallback.
    if (LAD24CD?.startsWith("E07") && CTY24CD?.startsWith("E10")) {
      entries[LAD24CD] = { districtName: LAD24NM, countyCode: CTY24CD, countyName: CTY24NM };
    }
  }
  if (!json.exceededTransferLimit) break;
  offset += json.features.length;
}

mkdirSync("src/data/lookups", { recursive: true });
const out = {
  source: "ONS Open Geography Portal — LAD24_CTY24_EN_LU",
  sourceUrl:
    "https://geoportal.statistics.gov.uk/datasets/ons::lad24-cty24-en-lu/about",
  lastFetched: new Date().toISOString().slice(0, 10),
  description:
    "Maps each English non-metropolitan district (E07*) to its parent non-metropolitan county (E10*). Used to fall back ASC/SEND data on district place pages, since those services are delivered by the upper-tier authority not the district.",
  districts: entries,
};
writeFileSync(
  "src/data/lookups/district-to-utla.json",
  JSON.stringify(out, null, 2) + "\n",
);
console.log(`Wrote ${Object.keys(entries).length} district → county entries.`);
