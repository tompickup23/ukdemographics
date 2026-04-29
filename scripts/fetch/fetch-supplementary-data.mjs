/**
 * Fetch official supplementary data files for crime, SEND, and ASC.
 *
 * Crime: ONS "Recorded crime data at Community Safety Partnership area" (XLSX)
 * SEND: DfE "Special educational needs in England" SEN2 return (XLSX)
 * ASC: NHS Digital "Adult Social Care Activity and Finance Report" (XLSX)
 *
 * These are direct downloads from GOV.UK and ONS — no API parsing needed.
 * The transform scripts will parse the XLSX files.
 */
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";

const rawDir = path.resolve(process.cwd(), "data/raw/supplementary");
mkdirSync(rawDir, { recursive: true });

const downloads = [
  {
    id: "crime",
    fileName: "ons-recorded-crime-csp.xlsx",
    // ONS recorded crime by CSP area, year ending March 2024
    url: "https://www.ons.gov.uk/file?uri=/peoplepopulationandcommunity/crimeandjustice/datasets/recordedcrimedatabycommunitysafetypartnershiparea/yearendingmarch2024/csptablesyemar24correction.xlsx"
  },
  {
    id: "send",
    fileName: "dfe-sen-2024-25.zip",
    // DfE SEN in England 2024/25 release ZIP. Re-resolve via /api/publications/special-educational-needs-in-england/releases/latest if this UUID rotates.
    url: "https://content.explore-education-statistics.service.gov.uk/api/releases/f7330b25-398d-477d-80c7-9b33bc10316f/files?fromPage=ReleaseDownloads"
  },
  {
    id: "asc",
    fileName: "nhs-asc-ascfr-salt-2023-24.xlsx",
    // NHS Digital ASCFR & SALT 2023/24 (CASSR-level, ~153 upper-tier authorities)
    url: "https://files.digital.nhs.uk/21/38468F/ASCFR%20and%20SALT%20Data%20Tables%202023-24.xlsx"
  }
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
