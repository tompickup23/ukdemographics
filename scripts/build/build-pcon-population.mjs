/**
 * Build src/data/live/pcon-population.json: population by single year of age and sex
 * for each Westminster constituency in England and Wales, from the table recorded by
 * scripts/fetch/adopt-ons-pcon-estimates.mjs.
 *
 *   node scripts/build/build-pcon-population.mjs \
 *     --published 2026-12-01 \
 *     --release-title "<the release's title, copied from its ONS page>" \
 *     --release-url <the ONS release page>
 *
 * The table carries no publication date or release title of its own, so a person
 * copies both from the ONS release page and passes them here. The reference date
 * comes from the manifest. Figures are written exactly as published. The build stops
 * unless every one of the 575 seats has all 91 ages for both sexes and the seats in
 * each country add to that country's mid-year estimate in population-estimates.json
 * for the same date.
 */

import { createHash } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { checkPconTable, readPconTable } from "../lib/pcon-population.mjs";

const args = process.argv.slice(2);
const argValue = (flag) => {
  const i = args.indexOf(flag);
  return i >= 0 ? args[i + 1] : undefined;
};
const published = argValue("--published");
const releaseTitle = argValue("--release-title");
const releaseUrl = argValue("--release-url");
if (!published || !/^\d{4}-\d{2}-\d{2}$/.test(published) || !releaseTitle || !releaseUrl) {
  console.error("Needs --published <yyyy-mm-dd> --release-title <title> --release-url <url>, all copied from the ONS release page");
  process.exit(2);
}
if (!/^https:\/\/www\.ons\.gov\.uk\/releases\//.test(releaseUrl)) {
  console.error(`--release-url must be an ONS release page, got ${releaseUrl}`);
  process.exit(2);
}

const read = (p) => JSON.parse(readFileSync(path.resolve(p), "utf8"));
const manifest = read("data/raw/manifests/ons_pcon_estimates.json");
if (!manifest.current) throw new Error("ons_pcon_estimates manifest has no current file");
const bytes = readFileSync(path.resolve("data/raw/ons_pcon_estimates", manifest.current.fileName));
const fileSha256 = createHash("sha256").update(bytes).digest("hex");
if (fileSha256 !== manifest.current.fileSha256) throw new Error(`${manifest.current.fileName} does not match its manifest hash`);

const referenceDate = manifest.current.referenceDate;
const year = Number(referenceDate.slice(0, 4));
const table = readPconTable(bytes.toString("utf8"));
if (table.dates.length && !table.dates.every((d) => String(d).includes(String(year)))) {
  throw new Error(`the table is dated ${table.dates.join(", ")}, the manifest says ${referenceDate}`);
}

const estimates = read("src/data/live/population-estimates.json");
if (estimates.source.referenceDate !== referenceDate) {
  throw new Error(`population-estimates.json is for ${estimates.source.referenceDate}, the table is for ${referenceDate}: no country total to check against`);
}
const countryTotals = {
  England: estimates.countries.E92000001.population,
  Wales: estimates.countries.W92000004.population
};
const problems = checkPconTable(table, { countryTotals });
if (problems.length) {
  console.error(`Not written. ${problems.length} problem(s):\n  ${problems.slice(0, 25).join("\n  ")}`);
  process.exit(1);
}

const sum = (row) => row.reduce((a, b) => a + b, 0);
const codes = [...table.seats.keys()].sort();
const siteCodes = new Set(Object.keys(read("src/data/live/pcon-dataset.json").pcons));
const total = { M: Array(91).fill(0), F: Array(91).fill(0) };
const seats = {};
for (const code of codes) {
  const seat = table.seats.get(code);
  seats[code] = { name: seat.name, M: seat.M, F: seat.F };
  for (const sex of ["M", "F"]) seat[sex].forEach((v, age) => { total[sex][age] += v; });
}

const out = {
  status: "published",
  source: {
    publisher: "Office for National Statistics",
    title: releaseTitle,
    published,
    releaseUrl,
    datasetName: manifest.datasetName,
    datasetReference: manifest.datasetReference,
    datasetUrl: manifest.landing,
    route: manifest.route,
    geography: "Westminster parliamentary constituencies in England and Wales, on 2024 boundaries",
    fileName: manifest.current.fileName,
    fileSha256,
    retrievedAt: manifest.current.retrievedAt
  },
  referenceDate,
  generatedBy: "scripts/build/build-pcon-population.mjs",
  counts: {
    seatsInTable: codes.length,
    seatsWithAPage: codes.filter((c) => siteCodes.has(c)).length,
    seatsWithNoPage: codes.filter((c) => !siteCodes.has(c)),
    pagesWithNoFigure: [...siteCodes].filter((c) => !table.seats.has(c)).length
  },
  checks: {
    england: { seatsAddTo: countryTotals.England, midYearEstimate: countryTotals.England },
    wales: { seatsAddTo: countryTotals.Wales, midYearEstimate: countryTotals.Wales },
    against: `population-estimates.json (${estimates.source.title})`
  },
  englandAndWales: { name: "England and Wales", population: sum(total.M) + sum(total.F), M: total.M, F: total.F },
  seats
};

const target = path.resolve("src/data/live/pcon-population.json");
writeFileSync(target, JSON.stringify(out) + "\n");
console.log(`Wrote ${codes.length} seats for ${referenceDate} (${table.layout} layout) to ${path.relative(process.cwd(), target)}`);
console.log(`Seats with a page: ${out.counts.seatsWithAPage}. Pages with no figure in this release: ${out.counts.pagesWithNoFigure}.`);
