/**
 * Build src/data/live/age-pyramids.json from the ONS detailed time series.
 *
 * New on 9 Nov 2026 (docs/product/age-pyramid-spec-2026-11-09.md). Input is table
 * MYEB1 of the workbook recorded in data/raw/manifests/ons_mye_timeseries.json and in
 * data/model/INPUTS.json (id ons_mye_timeseries): local authorities as of April 2023
 * by sex and single year of age, one column per year from mid-2011.
 *
 *   node scripts/build/build-age-pyramids.mjs
 *
 * The raw workbook is 48.8 MB and is not in git, so this runs where the file is held
 * and the output is committed. The file is found in its store through INPUTS.json and
 * checked against its sha256 before it is read. The sheet is read by readMyeb1, the
 * same reader the v8.1 control totals use: headers are matched by text, never by
 * column position, and a missing header stops the build.
 *
 * Output: for each council with a place page, and for England and Wales as a whole,
 * two lists (males, females) of one row per year, each row 91 whole numbers: single
 * years of age 0 to 89, then 90 and over. Nothing is rounded, smoothed or estimated.
 */

import { createHash } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { heldPath, loadManifest } from "../model/lib/inputs.mjs";
import { readMyeb1 } from "../model/lib/control-totals-sources.mjs";

const INPUT_ID = "ons_mye_timeseries";
const OUTPUT = "src/data/live/age-pyramids.json";

const dataset = JSON.parse(readFileSync(path.resolve("data/raw/manifests/ons_mye_timeseries.json"), "utf8"));
if (!dataset.current) throw new Error("ons_mye_timeseries manifest has no current file");

const inputs = loadManifest();
const input = inputs.inputs.find((i) => i.id === INPUT_ID);
if (!input) throw new Error(`INPUTS.json has no input ${INPUT_ID}`);
if (input.sha256 !== dataset.current.fileSha256) {
  throw new Error("INPUTS.json and the ons_mye_timeseries manifest name different files");
}

const rawPath = heldPath(inputs, input);
const fileSha256 = createHash("sha256").update(readFileSync(rawPath)).digest("hex");
if (fileSha256 !== dataset.current.fileSha256) {
  throw new Error(`${dataset.current.fileName} does not match its manifest hash`);
}

// The years are the ones the file's own name states; readMyeb1 then requires a
// population_<year> column for each and stops if one is missing.
const span = /(\d{4})(\d{4})\.xlsx$/.exec(dataset.current.fileName);
if (!span) throw new Error(`cannot read the year range from ${dataset.current.fileName}`);
const years = [];
for (let y = Number(span[1]); y <= Number(span[2]); y++) years.push(y);

const { cover, areas } = readMyeb1(rawPath, years);

const coverLine = (pattern, what) => {
  const line = cover.find((l) => pattern.test(l));
  if (!line) throw new Error(`cover sheet: no line stating ${what}`);
  return line.replace(/\s+/g, " ").trim();
};
const published = coverLine(/originally published/i, "the publication date");
const nextPublication = coverLine(/next publication/i, "the next publication");
const title = cover[0].split(/\r?\n/).map((l) => l.trim()).filter(Boolean);

const siteAreas = JSON.parse(readFileSync(path.resolve("src/data/live/ethnic-projections.json"), "utf8")).areas;
const siteCodes = Object.keys(siteAreas).sort();
const missing = siteCodes.filter((c) => !areas.has(c));
if (missing.length) throw new Error(`MYEB1 has no rows for: ${missing.join(", ")}`);

const whole = (v, where) => {
  if (!Number.isInteger(v) || v < 0) throw new Error(`${where}: ${v} is not a whole number of zero or more`);
  return v;
};
const rowsFor = (rec, sex, where) =>
  years.map((y) => {
    const row = rec[sex][y];
    if (!row || row.length !== 91) throw new Error(`${where} ${sex} ${y}: expected 91 ages`);
    return row.map((v) => whole(v, `${where} ${sex} ${y}`));
  });

// England and Wales is the sum of every local authority in the table, which is the
// same set as the site's councils when the two geographies agree; the test checks it
// against ONS's own England and Wales row in the mid-year estimates workbook.
const total = { M: years.map(() => new Array(91).fill(0)), F: years.map(() => new Array(91).fill(0)) };
for (const [code, rec] of areas) {
  for (const sex of ["M", "F"]) {
    rowsFor(rec, sex, code).forEach((row, yi) => row.forEach((v, a) => { total[sex][yi][a] += v; }));
  }
}

const out = {
  source: {
    publisher: "Office for National Statistics",
    title: title.join(" "),
    table: "MYEB1",
    published,
    nextPublication,
    geography: "Local authorities in England and Wales as of April 2023",
    landing: dataset.landing,
    sourceUrl: dataset.current.sourceUrl,
    fileName: dataset.current.fileName,
    fileSha256
  },
  usage:
    "Estimated usual resident population at 30 June of each year, by sex and single year of age. Each row holds 91 whole numbers: ages 0 to 89, then 90 and over. Rows follow the order of `years`. Values are exactly as published.",
  generatedBy: "scripts/build/build-age-pyramids.mjs",
  years,
  counts: { areasInSource: areas.size, areasEmitted: siteCodes.length },
  englandAndWales: { name: "England and Wales", M: total.M, F: total.F },
  areas: Object.fromEntries(
    siteCodes.map((code) => {
      const rec = areas.get(code);
      return [code, { name: siteAreas[code].areaName, sourceName: rec.name, M: rowsFor(rec, "M", code), F: rowsFor(rec, "F", code) }];
    })
  )
};

// One line per council keeps the diff of a new edition readable.
const head = JSON.stringify({ ...out, englandAndWales: undefined, areas: undefined }, null, 2).replace(/\n\}$/, "");
const lines = Object.entries(out.areas).map(([code, rec]) => `    ${JSON.stringify(code)}: ${JSON.stringify(rec)}`);
const text = `${head},\n  "englandAndWales": ${JSON.stringify(out.englandAndWales)},\n  "areas": {\n${lines.join(",\n")}\n  }\n}\n`;
JSON.parse(text);
writeFileSync(path.resolve(OUTPUT), text);

console.log(`${OUTPUT}: ${siteCodes.length} councils of ${areas.size} in MYEB1, mid-${years[0]} to mid-${years.at(-1)}, ${(text.length / 1e6).toFixed(2)} MB`);
console.log(published);
