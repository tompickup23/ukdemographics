/**
 * Fetch the ONS Local Authority Districts (May 2026) Boundaries UK BSC and record where they
 * came from, for the map module in src/lib/map/.
 *
 * Every council in the UK is kept, not only the 318 in England and Wales that have a place
 * page: Scottish and Northern Irish councils are drawn as unlabelled context where a frame
 * reaches the border, and are never given a value. The query matches the one behind
 * ~/ukcouncils/data/geography/lad26-england.geojson (same service, generalisation and
 * precision) without its England filter.
 *
 * Run: node scripts/fetch/fetch-lad-boundaries.mjs
 * Output: data/geography/lad26-uk-bsc.geojson and data/geography/lad26-uk-bsc.source.json
 *
 * Boundaries change only on a reorganisation (the next is Lancashire, April 2028), so this
 * is a one-shot fetch refreshed after one.
 */
import { createHash } from "node:crypto";
import { mkdirSync, writeFileSync } from "node:fs";

const SERVICE =
  "https://services1.arcgis.com/ESMARspQHYMw9BZ9/arcgis/rest/services/" +
  "Local_Authority_Districts_May_2026_Boundaries_UK_BSC/FeatureServer/0";
const PARAMS =
  "where=1%3D1&outFields=LAD26CD%2CLAD26NM&returnGeometry=true&outSR=4326" +
  "&geometryPrecision=5&maxAllowableOffset=0.001&orderByFields=LAD26CD&f=geojson";
const PAGE = 100;
const OUT = "data/geography/lad26-uk-bsc.geojson";
const SOURCE = "data/geography/lad26-uk-bsc.source.json";

const features = [];
for (let offset = 0; ; offset += PAGE) {
  const url = `${SERVICE}/query?${PARAMS}&resultRecordCount=${PAGE}&resultOffset=${offset}`;
  const res = await fetch(url, { headers: { "user-agent": "ukdemographics-data-fetch" } });
  if (!res.ok) throw new Error(`HTTP ${res.status} at offset ${offset}`);
  const json = await res.json();
  if (json.error) throw new Error(`ArcGIS error at offset ${offset}: ${JSON.stringify(json.error)}`);
  features.push(...json.features);
  if (json.features.length < PAGE) break;
}

const seen = new Set();
for (const f of features) {
  const code = f.properties?.LAD26CD;
  if (!code || seen.has(code)) throw new Error(`missing or repeated LAD26CD: ${code}`);
  if (!f.geometry || !/Polygon$/.test(f.geometry.type)) throw new Error(`${code} has no polygon geometry`);
  seen.add(code);
}
const byCountry = {};
for (const code of seen) byCountry[code[0]] = (byCountry[code[0]] ?? 0) + 1;

const body = JSON.stringify({ type: "FeatureCollection", features });
mkdirSync("data/geography", { recursive: true });
writeFileSync(OUT, body);
const record = {
  publisher: "Office for National Statistics",
  title: "Local Authority Districts (May 2026) Boundaries UK BSC",
  date: "May 2026",
  url: "https://www.data.gov.uk/dataset/811be825-44a9-427d-bf7f-c34c75f616ef/local-authority-districts-may-2026-boundaries-uk-bsc",
  service: SERVICE,
  query: `${SERVICE}/query?${PARAMS}`,
  retrieved: new Date().toISOString(),
  sha256: createHash("sha256").update(body).digest("hex"),
  count: features.length,
  countByCountry: byCountry,
  licence: "Open Government Licence v3.0",
  licenceUrl: "https://www.nationalarchives.gov.uk/doc/open-government-licence/version/3/",
  attribution:
    "Contains OS data © Crown copyright and database right 2026. Contains National Statistics data © Crown copyright and database right 2026.",
  method:
    "All UK features, paged 100 at a time. ArcGIS generalisation tolerance 0.001 degrees, five decimal places. " +
    "Illustrative boundaries, not property or billing boundaries. Rings are wound as served; src/lib/map/geo.ts rewinds them for d3-geo. Joined by exact LAD26CD only."
};
writeFileSync(SOURCE, JSON.stringify(record, null, 2) + "\n");
console.log(`${features.length} features (${JSON.stringify(byCountry)}), sha256 ${record.sha256}`);
