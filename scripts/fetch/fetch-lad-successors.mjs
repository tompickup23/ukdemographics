/**
 * Fetch the ONS LAD 2022 to LAD 2023 lookup and keep only the entries where
 * the district code changed, which is to say the April 2023 Local Government
 * Reorganisation: Cumbria, North Yorkshire and Somerset.
 *
 * Census 2021 tables are published on 2021/2022 district geography, so the
 * unitary authorities created in April 2023 have no row of their own in any
 * NOMIS Census output. This lookup names the predecessor districts whose
 * counts sum to each successor authority, so a Census figure for one of the
 * new unitaries can be derived rather than left missing.
 *
 * Source: ONS Open Geography Portal, LAD22_LAD23_UK_LU_v1 FeatureServer.
 *
 * Run: node scripts/fetch/fetch-lad-successors.mjs
 * Output: src/data/lookups/lad22-to-lad23.json
 *
 * This file changes only on a Local Government Reorganisation event, so it is
 * a one-shot fetch refreshed after any future reorganisation.
 */
import { mkdirSync, writeFileSync } from "node:fs";

const SERVICE =
  "https://services1.arcgis.com/ESMARspQHYMw9BZ9/arcgis/rest/services/LAD22_LAD23_UK_LU_v1/FeatureServer/0";
const OUT_PATH = "src/data/lookups/lad22-to-lad23.json";

const rows = [];
let offset = 0;
while (true) {
  const url =
    `${SERVICE}/query?where=1%3D1&outFields=LAD22CD,LAD22NM,LAD23CD,LAD23NM` +
    `&f=json&resultRecordCount=1000&resultOffset=${offset}`;
  const r = await fetch(url);
  if (!r.ok) throw new Error(`HTTP ${r.status} at offset ${offset}`);
  const json = await r.json();
  rows.push(...json.features.map((f) => f.attributes));
  if (!json.exceededTransferLimit) break;
  offset += json.features.length;
}

// Keep only the reorganised authorities. Where the 2023 code equals the 2022
// code the district was untouched and needs no predecessor list.
const successors = {};
for (const a of rows) {
  if (!a.LAD22CD || !a.LAD23CD || a.LAD22CD === a.LAD23CD) continue;
  successors[a.LAD23CD] = successors[a.LAD23CD] ?? {
    successorName: a.LAD23NM,
    predecessors: [],
  };
  successors[a.LAD23CD].predecessors.push({
    code: a.LAD22CD,
    name: a.LAD22NM,
  });
}
for (const s of Object.values(successors)) {
  s.predecessors.sort((x, y) => x.code.localeCompare(y.code));
}

mkdirSync("src/data/lookups", { recursive: true });
const out = {
  source: "ONS Open Geography Portal (LAD22_LAD23_UK_LU_v1)",
  sourceUrl: `${SERVICE}/query`,
  lastFetched: new Date().toISOString().slice(0, 10),
  description:
    "Maps each local authority district created by the April 2023 Local Government Reorganisation to the 2022 districts it replaced. Census 2021 outputs are published on the pre-reorganisation geography, so figures for the new unitary authorities are summed from the predecessor districts named here.",
  successors,
};
writeFileSync(OUT_PATH, JSON.stringify(out, null, 2) + "\n");
console.log(
  `Wrote ${Object.keys(successors).length} successor authorities to ${OUT_PATH}.`,
);
for (const [code, s] of Object.entries(successors)) {
  console.log(
    `  ${code} ${s.successorName}: ${s.predecessors.map((p) => `${p.code} ${p.name}`).join(", ")}`,
  );
}
