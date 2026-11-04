/**
 * Build src/data/live/ons-mye5-density.json from the ONS mid-year estimates workbook.
 *
 * New on 4 Nov 2026. Input is the workbook recorded in data/raw/manifests/ons_mye5_density.json
 * (fetched by scripts/fetch/fetch-ons-mye.mjs on 4 Nov 2026). It is the same file, by hash,
 * as data/raw/manifests/ons_mye.json and population-estimates.json; the build stops if the
 * two manifests disagree. Two of its tables are read here:
 *
 *   MYE5  population density: land area in square kilometres and people per square kilometre
 *   MYE6  median age of the population
 *
 *   node scripts/build/build-mye5-density.mjs
 *
 * MYE5 already publishes area in square kilometres ("Area (sq km)"), so nothing is
 * converted. Values are copied as published: ONS rounds density to the nearest whole
 * person per square kilometre and gives area to four decimal places. Headers are matched
 * by text, never by column position, and a missing header stops the build. A site area
 * with no row is left out and listed; nothing is borrowed from a neighbour or a parent.
 */

import { createHash } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import XLSX from "xlsx";

const manifest = JSON.parse(readFileSync(path.resolve("data/raw/manifests/ons_mye5_density.json"), "utf8"));
if (!manifest.current) throw new Error("ons_mye5_density manifest has no current file");
const myeManifest = JSON.parse(readFileSync(path.resolve("data/raw/manifests/ons_mye.json"), "utf8"));
if (myeManifest.current?.fileSha256 !== manifest.current.fileSha256) {
  throw new Error("ons_mye5_density and ons_mye manifests name different workbooks; refresh both together");
}
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
const rowsOf = (name) => {
  const sheet = wb.Sheets[name];
  if (!sheet) throw new Error(`sheet ${name} missing`);
  return XLSX.utils.sheet_to_json(sheet, { header: 1, blankrows: true });
};

function table(sheetName) {
  const rows = rowsOf(sheetName);
  const headerIndex = rows.findIndex((r) => r[0] === "Code");
  if (headerIndex < 0) throw new Error(`${sheetName}: no header row starting "Code"`);
  const header = rows[headerIndex].map((h) => String(h ?? "").replace(/\s+/g, " ").trim());
  const byCode = new Map();
  let rowsRead = 0;
  rows.slice(headerIndex + 1).forEach((r, i) => {
    if (!r[0]) return;
    rowsRead += 1;
    byCode.set(r[0], { row: r, sheetRow: headerIndex + 2 + i });
  });
  const col = (label) => {
    const i = header.indexOf(label);
    if (i < 0) throw new Error(`${sheetName}: header "${label}" missing`);
    return i;
  };
  return { byCode, col, rowsRead, title: String(rows[0][0] ?? "").trim() };
}

const cover = rowsOf("Cover sheet").map((r) => String(r[0] ?? "").trim());
const title = cover[0];
const published = cover.find((l) => /^Date published:/i.test(l))?.replace(/^Date published:\s*/i, "");
const release = cover.find((l) => /^Release number:/i.test(l))?.replace(/^Release number:\s*/i, "");
if (!title || !published) throw new Error("cover sheet lacks a title or publication date");

const notes = rowsOf("Notes");
const note = (n) => {
  const r = notes.find((row) => row[0] === n);
  if (!r) throw new Error(`Notes: note ${n} missing`);
  return String(r[1]).trim();
};

const mye5 = table("MYE5");
const mye6 = table("MYE6");
const mye4 = table("MYE4");
const latestYear = Math.max(
  ...rowsOf("MYE6").find((r) => r[0] === "Code").filter((h) => /^Mid-\d{4}$/.test(String(h))).map((h) => Number(String(h).slice(4)))
);

const cAreaSqKm = mye5.col("Area (sq km)");
const cPop = mye5.col(`Estimated Population mid-${latestYear}`);
const cDensity = mye5.col(`${latestYear} people per sq. km`);
const cMedian = mye6.col(`Mid-${latestYear}`);
const cMye4 = mye4.col(`Mid-${latestYear}`);

function record(code) {
  const t5 = mye5.byCode.get(code);
  const t6 = mye6.byCode.get(code);
  if (!t5 || !t6) return null;
  const pop = t5.row[cPop];
  const mye4Pop = mye4.byCode.get(code)?.row[cMye4];
  if (pop !== mye4Pop) throw new Error(`${code}: MYE5 population ${pop} differs from MYE4 ${mye4Pop}`);
  const areaSqKm = t5.row[cAreaSqKm];
  const densityPerSqKm = t5.row[cDensity];
  const medianAge = t6.row[cMedian];
  for (const [k, v] of Object.entries({ areaSqKm, densityPerSqKm, medianAge, pop })) {
    if (typeof v !== "number" || !Number.isFinite(v)) throw new Error(`${code}: ${k} is not a number (${v})`);
  }
  return {
    name: t5.row[mye5.col("Name")],
    areaSqKm,
    densityPerSqKm,
    medianAge,
    population: pop,
    locators: {
      density: `v1:xlsx:sheet=MYE5;row=${t5.sheetRow}`,
      medianAge: `v1:xlsx:sheet=MYE6;row=${t6.sheetRow}`
    }
  };
}

const areas = {};
const missing = [];
for (const code of siteCodes) {
  const rec = record(code);
  if (rec) areas[code] = rec;
  else missing.push(code);
}
const countries = Object.fromEntries(
  ["K04000001", "E92000001", "W92000004"].map((c) => [c, record(c)]).filter(([, r]) => r)
);

const out = {
  source: {
    publisher: "Office for National Statistics",
    title,
    published,
    release: release ?? null,
    referenceDate: `${latestYear}-06-30`,
    tables: {
      MYE5: mye5.title,
      MYE6: mye6.title
    },
    sourceUrl: manifest.current.sourceUrl,
    fileName: manifest.current.fileName,
    fileSha256
  },
  units: {
    areaSqKm: "Land area in square kilometres, as published in MYE5 (column \"Area (sq km)\"). The sheet is in square kilometres, so no conversion from hectares or any other unit is made.",
    densityPerSqKm: `Usual residents per square kilometre of land at mid-${latestYear}, as published in MYE5 (column "${latestYear} people per sq. km"), rounded by ONS to a whole number.`,
    medianAge: `Median age in years at mid-${latestYear}, as published in MYE6, to one decimal place.`,
    population: `Estimated population mid-${latestYear} from MYE5, checked equal to MYE4 for every row.`
  },
  sourceNotes: { rounding: note(19), definitions: note(20), changes: note(21) },
  usage: "Area, density and median age for each local authority, as ONS publishes them. Nothing is estimated, interpolated or borrowed from another area.",
  counts: { siteAreas: siteCodes.length, areasEmitted: Object.keys(areas).length, missing: missing.length },
  missing,
  latestYear,
  countries,
  areas
};

writeFileSync(path.resolve("src/data/live/ons-mye5-density.json"), JSON.stringify(out, null, 1) + "\n");
console.log(
  `MYE5 rows ${mye5.rowsRead}; MYE6 rows ${mye6.rowsRead}; site areas ${siteCodes.length}; emitted ${out.counts.areasEmitted}; missing ${missing.length}${missing.length ? ` (${missing.join(", ")})` : ""}`
);
