/** Transform the banked HMRC ODS files without network requests. */
import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import * as XLSX from "xlsx";
import { safeTarget, sha256 } from "../lib/retrieval-log.mjs";

export const LA_CODE = /^(E0[6789]|W06|S12|N09)\d{6}$/;
export const AREA_SHEET = "Table_3_14";
export const CI_SHEET = "Table_3_14a_No_of_individuals";
export const NATIONAL_SHEET = "2_1_IT_payers_by_demographic";

function requireValue(condition, message) {
  if (!condition) throw new Error(message);
}

function rows(book, sheet) {
  requireValue(book.Sheets[sheet], `Missing worksheet ${sheet}`);
  return XLSX.utils.sheet_to_json(book.Sheets[sheet], { header: 1, defval: null, blankrows: true });
}

function year(text) {
  const match = String(text).match(/tax year (\d{4} to \d{4})/i);
  requireValue(match, `Cannot read tax year from ${text}`);
  requireValue(Number(match[1].slice(8)) === Number(match[1].slice(0, 4)) + 1, "Invalid tax year");
  return match[1];
}

function header(data, label) {
  const row = data.findIndex(r => r.includes(label));
  requireValue(row >= 0, `Missing header ${label}`);
  return { row, column(name) {
    const indices = data[row].flatMap((v, i) => v === name ? [i] : []);
    requireValue(indices.length === 1, `Expected one header ${name}`);
    return indices[0];
  } };
}

export function numeric(value, locator, multiplier = 1) {
  if (/^\[not available\]$/i.test(String(value))) return null;
  requireValue(typeof value === "number" && Number.isFinite(value) && value >= 0, `Unexpected value at ${locator}: ${value}`);
  return value * multiplier;
}

function cell(column, row) { return `${XLSX.utils.encode_col(column)}${row}`; }

export function loadBank(root, id) {
  const manifestPath = `data/raw/manifests/${id}.json`;
  const manifest = JSON.parse(readFileSync(path.join(root, manifestPath), "utf8"));
  const current = manifest.current;
  requireValue(current, `No banked file for ${id}`);
  const file = `data/raw/${id}/${current.fileName}`;
  const bytes = readFileSync(safeTarget(path.join(root, `data/raw/${id}`), current.fileName));
  requireValue(sha256(bytes) === current.fileSha256, `SHA-256 mismatch for ${file}`);
  const attempt = manifest.attempts.findLast(a => a.blob_sha256 === current.fileSha256 && a.file_name === current.fileName);
  requireValue(attempt?.edition_first_published_at, `Missing publication date for ${id}`);
  return {
    book: XLSX.read(bytes),
    source: {
      publisher: "HM Revenue & Customs", title: attempt.edition,
      publishedAt: attempt.edition_first_published_at.slice(0, 10),
      updatedAt: attempt.edition_updated_at, retrievedAt: attempt.attempted_at,
      landingPage: attempt.landing_page, url: attempt.url, file, manifest: manifestPath,
      sha256: current.fileSha256,
    },
  };
}

export function transformAreas(book, source) {
  const main = rows(book, AREA_SHEET);
  const ci = rows(book, CI_SHEET);
  const edition = year(main[0][0]);
  requireValue(year(ci[0][0]) === edition && year(rows(book, "Contents")[1][0]) === edition, "SPI editions disagree");
  for (const data of [main, ci]) requireValue(data.some(r => /Numbers of taxpayers are measured in thousands/.test(r[0])), "Unrecognised SPI count units");
  const h = header(main, "Area Code"), ch = header(ci, "Area Code");
  const columns = {
    taxpayers: h.column("Total income: Number of individuals"),
    meanIncome: h.column("Total income: Mean"), medianIncome: h.column("Total income: Median"),
  };
  const ciColumns = {
    lower: ch.column("Total income (Lower 95% CI)"),
    central: ch.column("Total income (Central Estimate)"),
    upper: ch.column("Total income (Upper 95% CI)"),
  };
  const ciRows = new Map();
  ci.forEach((r, i) => {
    const code = r[ch.column("Area Code")];
    if (!LA_CODE.test(code)) return;
    requireValue(!ciRows.has(code), `Duplicate confidence row ${code}`);
    ciRows.set(code, { values: r, row: i + 1 });
  });
  const areas = {};
  main.forEach((r, i) => {
    const code = r[h.column("Area Code")];
    if (!LA_CODE.test(code)) return;
    requireValue(!areas[code], `Duplicate authority ${code}`);
    const row = i + 1, name = r[h.column("Area Name")];
    const interval = ciRows.get(code);
    requireValue(interval && interval.values[ch.column("Area Name")] === name, `Missing or mismatched confidence row ${code}`);
    const values = Object.fromEntries(Object.entries(columns).map(([key, col]) => [key, numeric(r[col], `${AREA_SHEET}!${cell(col, row)}`, key === "taxpayers" ? 1000 : 1)]));
    const bounds = Object.fromEntries(Object.entries(ciColumns).map(([key, col]) => [key, numeric(interval.values[col], `${CI_SHEET}!${cell(col, interval.row)}`, 1000)]));
    requireValue(bounds.central === values.taxpayers, `Central estimates disagree for ${code}`);
    requireValue(values.taxpayers === null ? bounds.lower === null && bounds.upper === null :
      bounds.lower !== null && bounds.upper !== null && bounds.lower <= values.taxpayers && values.taxpayers <= bounds.upper, `Invalid confidence interval ${code}`);
    const missing = [...Object.entries(values), ...Object.entries({ taxpayersLower95: bounds.lower, taxpayersUpper95: bounds.upper })].filter(([, v]) => v === null).map(([k]) => k);
    areas[code] = {
      code, name, ...values, taxpayersLower95: bounds.lower, taxpayersUpper95: bounds.upper,
      edition, publishedAt: source.publishedAt,
      source: { dataset: "hmrc_spi", table: "3.14", sheet: AREA_SHEET, row,
        cells: Object.fromEntries(Object.entries(columns).map(([k, c]) => [k, cell(c, row)])),
        confidenceInterval: { table: "3.14a", sheet: CI_SHEET, row: interval.row,
          cells: Object.fromEntries(Object.entries(ciColumns).map(([k, c]) => [k, cell(c, interval.row)])) },
      },
      notes: missing.length ? [`HMRC marks ${missing.join(", ")} as [Not available]. These values remain null, not zero. No estimate or alternative area is substituted.`] : [],
    };
  });
  requireValue(Object.keys(areas).length === ciRows.size, "Area and confidence coverage disagree");
  const notes = rows(book, "Notes_3_14_and_3_14a");
  const sourceNotes = notes.flatMap((r, i) => [1, 4, 5].includes(r[0]) ? [{
    note: r[0], text: r[1], sheet: "Notes_3_14_and_3_14a", row: i + 1,
  }] : []);
  requireValue(sourceNotes.length === 3, "Missing SPI coverage notes");
  return { edition, areas, sourceNotes };
}

export function transformNational(book, source) {
  const contents = rows(book, "Contents");
  const statusRow = contents.findIndex(r => /All years to the .* tax year are outturn data/.test(r[0]));
  requireValue(statusRow >= 0, "Missing national outturn boundary");
  const boundary = contents[statusRow][0].match(/All years to the (\d{4} to \d{4}) tax year are outturn data, tax years (\d{4} to \d{4}) through to (\d{4} to \d{4}) are projected estimates/);
  requireValue(boundary, "Unrecognised national outturn and projection description");
  const [, lastOutturn, firstProjection, lastProjection] = boundary;
  const data = rows(book, NATIONAL_SHEET), h = header(data, "Tax year");
  const countColumn = h.column("All Income Tax payers"), yearColumn = h.column("Tax year");
  requireValue(data.some(r => r.includes("Numbers are in thousands.")), "Unrecognised national count units");
  const footnotes = rows(book, "2_1_Footnotes");
  const projectionRow = footnotes.findIndex(r => /^Projected estimates based upon/.test(r[1]));
  requireValue(projectionRow >= 0, "Missing national projection footnote");
  const projectionNote = footnotes[projectionRow];
  const years = {};
  data.forEach((r, i) => {
    const match = String(r[yearColumn]).match(/^(\d{4} to \d{4})(.*)$/);
    if (!match) return;
    const edition = match[1], row = i + 1, projected = edition > lastOutturn;
    requireValue(!years[edition], `Duplicate national year ${edition}`);
    requireValue(!projected || edition >= firstProjection && edition <= lastProjection && match[2].includes(`[note ${projectionNote[0]}]`), `Unrecognised projection status ${edition}`);
    const taxpayers = numeric(r[countColumn], `${NATIONAL_SHEET}!${cell(countColumn, row)}`, 1000);
    years[edition] = {
      edition, taxpayers, status: taxpayers === null ? "unavailable" : projected ? "projected" : "outturn",
      publishedAt: source.publishedAt,
      source: { dataset: "hmrc_income_tax", table: "2.1", sheet: NATIONAL_SHEET, row, cell: cell(countColumn, row) },
      notes: taxpayers === null ? ["HMRC marks the count [not available]. No estimate is substituted."] : [],
    };
  });
  requireValue(years[lastOutturn]?.status === "outturn" && years[firstProjection]?.status === "projected" && years[lastProjection]?.status === "projected", "Incomplete national series");
  return {
    lastOutturn, firstProjection, lastProjection,
    statusSource: { sheet: "Contents", cell: `A${statusRow + 1}` },
    projectionAssumptions: { text: projectionNote[1], sheet: "2_1_Footnotes", row: projectionRow + 1, note: projectionNote[0] },
    years,
  };
}

export function buildDataset(root = process.cwd()) {
  const spi = loadBank(root, "hmrc_spi"), incomeTax = loadBank(root, "hmrc_income_tax");
  const local = transformAreas(spi.book, spi.source), national = transformNational(incomeTax.book, incomeTax.source);
  const records = Object.values(local.areas), published = records.filter(a => a.taxpayers !== null);
  const localAuthorityTaxpayers = published.reduce((sum, a) => sum + a.taxpayers, 0);
  const comparable = national.years[local.edition];
  requireValue(comparable?.status === "outturn" && comparable.taxpayers > 0, "No matching national outturn for the SPI edition");
  const differenceFraction = Math.abs(localAuthorityTaxpayers / comparable.taxpayers - 1);
  requireValue(records.length === 361, `Expected 361 authority rows; found ${records.length}. Review any geography change.`);
  requireValue(differenceFraction < 0.02, "Local taxpayer sum differs from matching national outturn by 2% or more");
  return {
    schemaVersion: 1, edition: local.edition, basis: "published sample estimates",
    units: { taxpayers: "individuals", income: "GBP per year", confidenceLevel: 0.95 },
    sources: { hmrc_spi: spi.source, hmrc_income_tax: incomeTax.source },
    coverage: { localAuthorityRows: records.length, rowsWithTaxpayers: published.length,
      missingTaxpayerCodes: records.filter(a => a.taxpayers === null).map(a => a.code),
      localAuthorityTaxpayers, sameYearNationalTaxpayers: comparable.taxpayers, differenceFraction,
      note: "The local total sums only published counts. Null counts are excluded, not treated as zero. Use this local sum for area share calculations; Table 2.1 is a separate national series with different coverage.",
    },
    notes: [
      "Counts and confidence bounds are converted from thousands to individuals. Income remains in pounds. Published rounding is retained.",
      "All source authority codes are retained, including Sheffield E08000019 and Barnsley E08000016. Home Office asylum tables use E08000039 and E08000038 respectively; consumers must apply their existing code resolver, not duplicate these rows.",
      "Torbay E06000027 and Isles of Scilly E06000053 have source rows in both tables. Missing values are marked [Not available] by HMRC, not caused by a failed code join. Row notes identify the unavailable fields. No reason for individual cell suppression is inferred.",
      "These are income taxpayers, not all residents or workers. Subnational estimates require caution; see the source notes. No local confidence bounds are summed to invent a national confidence interval.",
    ],
    sourceNotes: local.sourceNotes, national, areas: local.areas,
  };
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  const data = buildDataset();
  writeFileSync("src/data/live/income-taxpayers-la.json", JSON.stringify(data, null, 2) + "\n");
  console.log(JSON.stringify(data.coverage, null, 2));
}
