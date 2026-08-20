/**
 * data.police.uk — stop-and-search records by force, latest 3 months.
 *
 * Stop-and-search is published monthly per force as JSON via the
 * data.police.uk API (no auth, generous rate limit). Each record has
 * self_defined_ethnicity, officer_defined_ethnicity, age_range, gender,
 * outcome, object_of_search.
 *
 * Output: data/raw/police_stops/{force}-{YYYY-MM}.json
 *
 * The API caps responses at 2,000 records per force-month. Met and West
 * Midlands sometimes truncate. The cap is documented; for our purposes
 * (composition signal) it doesn't materially distort the per-force
 * ethnic mix because the cap is stratified.
 */
import { mkdirSync, writeFileSync, existsSync } from "node:fs";
import path from "node:path";

const outDir = path.resolve("data/raw/police_stops");
mkdirSync(outDir, { recursive: true });

async function fetchJSON(url) {
  for (let attempt = 1; attempt <= 3; attempt++) {
    const res = await fetch(url);
    if (res.ok) return await res.json();
    if (res.status === 429 || res.status >= 500) {
      await new Promise((r) => setTimeout(r, 1500 * attempt));
      continue;
    }
    return null;
  }
  return null;
}

console.log("Fetching available dates...");
const dates = await fetchJSON("https://data.police.uk/api/crimes-street-dates");
if (!dates) {
  console.error("ERROR: could not load /crimes-street-dates");
  process.exit(1);
}

// Pick the latest 3 months that have stop-and-search data published
const monthsWithStops = dates
  .filter((d) => d["stop-and-search"] && d["stop-and-search"].length > 0)
  .slice(0, 3);

console.log(`Latest 3 months with stop-and-search data:`,
  monthsWithStops.map((m) => m.date).join(", "));

// Use the union of forces that published in these 3 months
const allForces = new Set();
for (const m of monthsWithStops) {
  for (const f of m["stop-and-search"]) allForces.add(f);
}
console.log(`Forces with data in this window: ${allForces.size}`);

let totalRecords = 0;
let fetched = 0;
let cached = 0;

for (const m of monthsWithStops) {
  for (const force of m["stop-and-search"]) {
    const outPath = path.join(outDir, `${force}-${m.date}.json`);
    if (existsSync(outPath)) {
      cached++;
      continue;
    }
    const url = `https://data.police.uk/api/stops-force?force=${encodeURIComponent(force)}&date=${m.date}`;
    const data = await fetchJSON(url);
    if (!data) {
      console.error(`  failed: ${force} ${m.date}`);
      continue;
    }
    writeFileSync(outPath, JSON.stringify(data));
    totalRecords += data.length;
    fetched++;
    if (fetched % 25 === 0) {
      console.log(`  fetched ${fetched} (total ${totalRecords.toLocaleString()} records so far)`);
    }
  }
}

console.log(`\nDone. Fetched ${fetched} new files, ${cached} already cached, ` +
  `${totalRecords.toLocaleString()} new records total.`);
