/**
 * Formerly fetched the supplementary crime, SEND and ASC files. All three have moved:
 *
 * Crime moved out on 12 Oct 2026: ONS discontinued "Recorded crime data by Community
 * Safety Partnership area" on 24 Oct 2024, and scripts/fetch/fetch-ons-pfa-crime.mjs
 * now resolves the newest Police Force Area data tables from the ONS dataset page.
 *
 * SEND moved to scripts/fetch/fetch-dfe-sen.mjs (12 Oct 2026), which finds the newest
 * release through the DfE statistics API instead of naming one release id.
 *
 * ASC moved to scripts/fetch/fetch-dhsc-asc.mjs (12 Oct 2026), which finds the newest
 * DHSC edition on GOV.UK itself.
 *
 * The download list is empty; the loop below is kept for any future direct download.
 */
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";

const rawDir = path.resolve(process.cwd(), "data/raw/supplementary");
mkdirSync(rawDir, { recursive: true });

const downloads = [
  // Adult social care moved to DHSC on GOV.UK from 2024-25 and is fetched by
  // scripts/fetch/fetch-dhsc-asc.mjs, which finds the newest edition itself.
];

for (const dl of downloads) {
  const outputPath = path.join(rawDir, dl.fileName);
  console.log(`Fetching ${dl.id}: ${dl.fileName}...`);

  try {
    const response = await fetch(dl.url, {
      headers: { "User-Agent": "asylumstats-data-pipeline/1.0" }
    });

    if (!response.ok) {
      console.log(`  WARNING: HTTP ${response.status} — skipping ${dl.id}`);
      continue;
    }

    const buffer = await response.arrayBuffer();
    writeFileSync(outputPath, Buffer.from(buffer));
    const sizeMb = (buffer.byteLength / 1024 / 1024).toFixed(1);
    console.log(`  Written ${outputPath} (${sizeMb} MB)`);
  } catch (error) {
    console.log(`  ERROR: ${error.message} — skipping ${dl.id}`);
  }
}

console.log("Done.");
