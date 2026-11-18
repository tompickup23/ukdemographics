/**
 * Build src/data/live/population-change.json from the ONS detailed time series.
 *
 * New on 11 Nov 2026 (register row R628; docs/product/population-change-spec-2026-11-11.md).
 * Input is table MYEB3 of the workbook recorded in data/raw/manifests/ons_mye_timeseries.json
 * and in data/model/INPUTS.json (id ons_mye_timeseries): the components of population
 * change for each local authority (as of April 2023), every year from mid-2011.
 *
 *   node scripts/build/build-population-change.mjs
 *
 * The raw workbook is 48.8 MB and is not in git, so this runs where the file is held and
 * the output is committed. The file is found through INPUTS.json and checked against its
 * sha256 before it is read. Headers are matched by text, never by column position.
 *
 * The build refuses to write unless, for every council and every year:
 *   population at the start + births - deaths + internal net + international net + other
 *     = population at the end, exactly;
 *   births - deaths equals ONS's natchange column; in - out equals each net column.
 * Nothing is rounded, smoothed or estimated.
 */

import { createHash } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { heldPath, loadManifest } from "../model/lib/inputs.mjs";
import { readMyeb3 } from "../model/lib/control-totals-sources.mjs";

const INPUT_ID = "ons_mye_timeseries";
const OUTPUT = "src/data/live/population-change.json";

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

const span = /(\d{4})(\d{4})\.xlsx$/.exec(dataset.current.fileName);
if (!span) throw new Error(`cannot read the year range from ${dataset.current.fileName}`);
const years = [];
for (let y = Number(span[1]); y <= Number(span[2]); y++) years.push(y);

const { cover, definitions, areas } = readMyeb3(rawPath, years);

const coverLine = (pattern, what) => {
  const line = cover.find((l) => pattern.test(l));
  if (!line) throw new Error(`cover sheet: no line stating ${what}`);
  return line.replace(/\s+/g, " ").trim();
};
const published = coverLine(/originally published/i, "the publication date");
const nextPublication = coverLine(/next publication/i, "the next publication");
const title = cover[0].split(/\r?\n/).map((l) => l.trim()).filter(Boolean);

// ONS's own definition of each flow, quoted from the Notes sheet, for the page's notes.
const defs = Object.fromEntries(
  definitions
    .split(/\r?\n/)
    .map((l) => /^([a-z_]+)_20xx:\s*(.+)$/.exec(l.trim()))
    .filter(Boolean)
    .map((m) => [m[1], m[2].trim()])
);
for (const k of ["births", "deaths", "internal_in", "internal_out", "international_in", "international_out", "other_change"]) {
  if (!defs[k]) throw new Error(`MYEB3 notes: no definition for ${k}`);
}

const siteAreas = JSON.parse(readFileSync(path.resolve("src/data/live/ethnic-projections.json"), "utf8")).areas;
const siteCodes = Object.keys(siteAreas).sort();
const missing = siteCodes.filter((c) => !areas.has(c));
if (missing.length) throw new Error(`MYEB3 has no rows for: ${missing.join(", ")}`);

const FLOWS = [
  ["births", "births"],
  ["deaths", "deaths"],
  ["internalIn", "internal_in"],
  ["internalOut", "internal_out"],
  ["internationalIn", "international_in"],
  ["internationalOut", "international_out"],
  ["other", "other_change"]
];

function checked(code, rec) {
  for (let i = 0; i < years.length - 1; i++) {
    const y = years[i + 1];
    const at = (k) => rec[k][i];
    const where = `${code} mid-${years[i]} to mid-${y}`;
    if (at("births") - at("deaths") !== at("natchange")) throw new Error(`${where}: births minus deaths is not ONS's natchange`);
    if (at("internal_in") - at("internal_out") !== at("internal_net")) throw new Error(`${where}: internal in minus out is not ONS's net`);
    if (at("international_in") - at("international_out") !== at("international_net")) throw new Error(`${where}: international in minus out is not ONS's net`);
    const end = rec.population[i] + at("natchange") + at("internal_net") + at("international_net") + at("other_change");
    if (end !== rec.population[i + 1]) throw new Error(`${where}: the parts give ${end}, ONS gives ${rec.population[i + 1]}`);
    for (const k of ["births", "deaths", "internal_in", "internal_out", "international_in", "international_out"]) {
      if (at(k) < 0) throw new Error(`${where}: ${k} is negative`);
    }
  }
  return {
    population: rec.population,
    ...Object.fromEntries(FLOWS.map(([key, col]) => [key, rec[col]]))
  };
}

// England and Wales is the sum of every local authority; the test checks it against
// ONS's own England and Wales row in the separate mid-year estimates workbook.
const total = { population: years.map(() => 0), ...Object.fromEntries(FLOWS.map(([k]) => [k, years.slice(1).map(() => 0)])) };
const built = new Map();
for (const [code, rec] of areas) {
  const c = checked(code, rec);
  built.set(code, c);
  c.population.forEach((v, i) => { total.population[i] += v; });
  for (const [k] of FLOWS) c[k].forEach((v, i) => { total[k][i] += v; });
}

const out = {
  source: {
    publisher: "Office for National Statistics",
    title: title.join(" "),
    table: "MYEB3",
    published,
    nextPublication,
    geography: "Local authorities in England and Wales as of April 2023",
    landing: dataset.landing,
    sourceUrl: dataset.current.sourceUrl,
    fileName: dataset.current.fileName,
    fileSha256,
    definitions: {
      births: defs.births,
      deaths: defs.deaths,
      internalIn: defs.internal_in,
      internalOut: defs.internal_out,
      internationalIn: defs.international_in,
      internationalOut: defs.international_out,
      other: defs.other_change
    }
  },
  usage:
    "Components of change in the usual resident population, each for the twelve months to 30 June. `population` has one value per year in `years`; each flow has one value per year after the first, so flow index i is the change from years[i] to years[i + 1]. Values are exactly as published. For every area and year, population[i] + births - deaths + (internalIn - internalOut) + (internationalIn - internationalOut) + other = population[i + 1]. `englandAndWales` is the sum of every council: its internalIn and internalOut therefore include moves between two councils, and only their difference is a flow across the England and Wales boundary.",
  generatedBy: "scripts/build/build-population-change.mjs",
  years,
  counts: { areasInSource: areas.size, areasEmitted: siteCodes.length },
  englandAndWales: { name: "England and Wales", ...total },
  areas: Object.fromEntries(
    siteCodes.map((code) => [code, { name: siteAreas[code].areaName, sourceName: areas.get(code).name, ...built.get(code) }])
  )
};

// One line per council keeps the diff of a new edition readable.
const head = JSON.stringify({ ...out, englandAndWales: undefined, areas: undefined }, null, 2).replace(/\n\}$/, "");
const lines = Object.entries(out.areas).map(([code, rec]) => `    ${JSON.stringify(code)}: ${JSON.stringify(rec)}`);
const text = `${head},\n  "englandAndWales": ${JSON.stringify(out.englandAndWales)},\n  "areas": {\n${lines.join(",\n")}\n  }\n}\n`;
JSON.parse(text);
writeFileSync(path.resolve(OUTPUT), text);

console.log(`${OUTPUT}: ${siteCodes.length} councils of ${areas.size} in MYEB3, mid-${years[0]} to mid-${years.at(-1)}, ${(text.length / 1e3).toFixed(0)} kB`);
console.log(published);
