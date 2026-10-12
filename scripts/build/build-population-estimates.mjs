/**
 * Build src/data/live/population-estimates.json from the ONS mid-year estimates workbook.
 *
 * New on 12 Oct 2026. Input is the workbook recorded in data/raw/manifests/ons_mye.json
 * (fetched or adopted by scripts/fetch/fetch-ons-mye.mjs). Output is a separate file on
 * purpose: `current.total_population` in ethnic-projections.json and `population` in
 * health-demand.json stay the Census 2021 counts that the composition weights, the
 * majority counts and other repos (aidoge-directorate ukd.py) rely on.
 *
 *   node scripts/build/build-population-estimates.mjs
 *
 * Everything that describes the edition (title, publication sentence, reference years)
 * is read from the workbook itself. Headers are matched by text, never by column
 * position, and a missing header stops the build.
 */

import { createHash } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import XLSX from "xlsx";

const manifest = JSON.parse(readFileSync(path.resolve("data/raw/manifests/ons_mye.json"), "utf8"));
if (!manifest.current) throw new Error("ons_mye manifest has no current file");
const rawPath = path.resolve("data/raw/ons_mye", manifest.current.fileName);
const bytes = readFileSync(rawPath);
const fileSha256 = createHash("sha256").update(bytes).digest("hex");
if (fileSha256 !== manifest.current.fileSha256) {
  throw new Error(`${manifest.current.fileName} does not match its manifest hash`);
}

const siteCodes = Object.keys(
  JSON.parse(readFileSync(path.resolve("src/data/live/ethnic-projections.json"), "utf8")).areas
);

const wb = XLSX.read(bytes);
const counts = { rowsRead: 0, areasEmitted: 0 };

function table(sheetName) {
  const sheet = wb.Sheets[sheetName];
  if (!sheet) throw new Error(`sheet ${sheetName} missing`);
  const rows = XLSX.utils.sheet_to_json(sheet, { header: 1, blankrows: true });
  const headerIndex = rows.findIndex((r) => r[0] === "Code");
  if (headerIndex < 0) throw new Error(`${sheetName}: no header row starting "Code"`);
  const header = rows[headerIndex].map((h) => String(h ?? "").replace(/\s+/g, " ").trim());
  const byCode = new Map();
  rows.slice(headerIndex + 1).forEach((r, i) => {
    if (!r[0]) return;
    counts.rowsRead += 1;
    // Spreadsheet rows are 1-based; the locator names the row a reader would see.
    byCode.set(r[0], { row: r, sheetRow: headerIndex + 2 + i });
  });
  const col = (label) => {
    const i = header.indexOf(label);
    if (i < 0) throw new Error(`${sheetName}: header "${label}" missing`);
    return i;
  };
  return { header, byCode, col };
}

const cover = XLSX.utils.sheet_to_json(wb.Sheets["Cover sheet"], { header: 1 }).map((r) => String(r[0] ?? ""));
const title = cover[0].trim();
const published = cover.find((l) => /originally published/i.test(l))?.trim();
const nextPublication = cover.find((l) => /next publication/i.test(l))?.trim();
if (!title || !published) throw new Error("cover sheet lacks a title or publication sentence");

const mye0 = table("MYE0");
const mye2 = table("MYE2 - Persons");
const mye3 = table("MYE3");
const mye4 = table("MYE4");
const mye6 = table("MYE6");
const mye7 = table("MYE7");

const years = mye4.header.filter((h) => /^Mid-\d{4}$/.test(h)).map((h) => Number(h.slice(4)));
const latestYear = Math.max(...years);

const ageCols = (from, to) => {
  const cols = [];
  for (let a = from; a <= to; a += 1) cols.push(mye2.col(String(a)));
  return cols;
};
const BANDS = {
  "0-17": ageCols(0, 17),
  "18-64": ageCols(18, 64),
  "65+": [...ageCols(65, 89), mye2.col("90+")]
};

function record(code) {
  const t4 = mye4.byCode.get(code);
  if (!t4) return null;
  const r4 = t4.row;
  const series = Object.fromEntries(years.map((y) => [y, r4[mye4.col(`Mid-${y}`)]]).sort((a, b) => a[0] - b[0]));

  const t0 = mye0.byCode.get(code);
  const ci = t0
    ? {
        lower: t0.row[mye0.col(`Mid-${latestYear} 95% research-based confidence interval - lower bound`)],
        upper: t0.row[mye0.col(`Mid-${latestYear} 95% research-based confidence interval - upper bound`)]
      }
    : null;

  const t2 = mye2.byCode.get(code);
  const ageBands = t2
    ? Object.fromEntries(Object.entries(BANDS).map(([k, cols]) => [k, cols.reduce((s, c) => s + t2.row[c], 0)]))
    : null;
  const allAges = t2 ? t2.row[mye2.col("All ages")] : null;

  const t3 = mye3.byCode.get(code);
  const components = t3
    ? {
        births: t3.row[mye3.col("Births")],
        deaths: t3.row[mye3.col("Deaths")],
        internalMigrationNet: t3.row[mye3.col("Internal Migration Net")],
        internationalMigrationNet: t3.row[mye3.col("International Migration Net")],
        other: t3.row[mye3.col("Other")]
      }
    : null;

  const t6 = mye6.byCode.get(code);
  const t7 = mye7.byCode.get(code);
  const revisions = t7
    ? Object.fromEntries(
        [2022, 2023, 2024].map((y) => [
          y,
          {
            publishedJuly2025: t7.row[mye7.col(`Population mid-${y} (published July 2025)`)],
            revisedJuly2026: t7.row[mye7.col(`Population mid-${y} (revised July 2026)`)]
          }
        ])
      )
    : null;

  return {
    name: r4[mye4.col("Name")],
    geography: r4[mye4.col("Geography")],
    population: series[latestYear],
    ci95: ci,
    allAgesCheck: allAges,
    ageBands,
    medianAge: t6 ? t6.row[mye6.col(`Mid-${latestYear}`)] : null,
    components,
    revisions,
    series,
    locators: {
      population: `v1:xlsx:sheet=MYE4;row=${t4.sheetRow}`,
      ci95: t0 ? `v1:xlsx:sheet=MYE0;row=${t0.sheetRow}` : null,
      ageBands: t2 ? `v1:xlsx:sheet=MYE2 - Persons;row=${t2.sheetRow}` : null,
      components: t3 ? `v1:xlsx:sheet=MYE3;row=${t3.sheetRow}` : null
    }
  };
}

const areas = {};
const missing = [];
for (const code of siteCodes) {
  const rec = record(code);
  if (!rec) {
    missing.push(code);
    continue;
  }
  areas[code] = rec;
  counts.areasEmitted += 1;
}
if (missing.length) throw new Error(`site areas missing from MYE4: ${missing.join(", ")}`);

const countries = Object.fromEntries(
  ["K04000001", "E92000001", "W92000004"].map((c) => [c, record(c)]).filter(([, r]) => r)
);

const out = {
  source: {
    publisher: "Office for National Statistics",
    title,
    published,
    nextPublication: nextPublication ?? null,
    tables: "MYE0, MYE2 (persons), MYE3, MYE4, MYE6, MYE7",
    referenceDate: `${latestYear}-06-30`,
    sourceUrl: manifest.current.sourceUrl,
    fileName: manifest.current.fileName,
    fileSha256,
    geographyNote: "Local authority boundaries as at April 2024, as stated in the workbook's notes."
  },
  usage:
    "Resident population estimates for rates and context. Not a replacement for the Census 2021 counts that weight ethnic composition in ethnic-projections.json.",
  counts,
  latestYear,
  countries,
  areas
};

writeFileSync(path.resolve("src/data/live/population-estimates.json"), JSON.stringify(out, null, 1) + "\n");
console.log(`rows read ${counts.rowsRead}; areas emitted ${counts.areasEmitted}; latest year ${latestYear}`);
