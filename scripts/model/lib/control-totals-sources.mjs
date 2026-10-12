/**
 * Readers for the published files the v8.1 control totals are built from.
 *
 * Every reader matches headers by their text, never by column position, and
 * throws on a missing header, so a layout change stops the build instead of
 * shifting a column. Ages come back as arrays of 91 values: single years 0 to
 * 89, then 90 meaning 90 and over, which is the forward model's age range.
 * Sexes are "M" and "F".
 */
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import XLSX from "xlsx";
import { parseCsvLine } from "./snpp.mjs";

export const AGES = Array.from({ length: 91 }, (_, i) => i);
const zeros = () => new Array(91).fill(0);

/** Age label to model age index: 0 to 89 as themselves, anything 90 or over to 90. */
export function ageIndex(label) {
  const s = String(label).trim();
  if (/^(age\s*)?\d+$/i.test(s)) return Math.min(90, Number(s.replace(/\D/g, "")));
  const m = s.match(/^(?:age\s*)?(\d+)\s*(?:\+|and over|-\s*\d+)/i);
  if (m) return Math.min(90, Number(m[1]));
  return null;
}

function headerIndex(header, label, where) {
  const i = header.findIndex((h) => String(h ?? "").replace(/\s+/g, " ").trim() === label);
  if (i < 0) throw new Error(`${where}: header "${label}" missing`);
  return i;
}

export function unzipMember(zipPath, member) {
  return execFileSync("unzip", ["-p", zipPath, member], { maxBuffer: 512 * 1024 * 1024 });
}

export function listZip(zipPath) {
  return execFileSync("unzip", ["-Z1", zipPath]).toString().split("\n").filter(Boolean);
}

/** Sheet rows with the header row found by its first cell. */
function sheetRows(wb, sheetName, firstHeader, where) {
  const sheet = wb.Sheets[sheetName];
  if (!sheet) throw new Error(`${where}: sheet "${sheetName}" missing`);
  const rows = XLSX.utils.sheet_to_json(sheet, { header: 1, blankrows: false });
  const h = rows.findIndex((r) => String(r[0] ?? "").trim().startsWith(firstHeader));
  if (h < 0) throw new Error(`${where}: no header row starting "${firstHeader}"`);
  return { header: rows[h].map((x) => String(x ?? "").replace(/\s+/g, " ").trim()), rows: rows.slice(h + 1) };
}

/** First lines of the cover sheet, for the edition and publication date. */
export function coverLines(wb) {
  const name = wb.SheetNames.find((n) => /cover/i.test(n));
  if (!name) return [];
  return XLSX.utils.sheet_to_json(wb.Sheets[name], { header: 1 }).map((r) => String(r[0] ?? "").trim()).filter(Boolean);
}

const LA_GEOGRAPHIES = new Set(["Unitary Authority", "Metropolitan District", "Non-metropolitan District", "London Borough"]);

/**
 * ONS mid-year estimates workbook (mye25tablesew.xlsx), tables "MYE2 - Males"
 * and "MYE2 - Females": local authorities by single year of age for the one
 * reference year the workbook covers.
 */
export function readMye2(file) {
  const wb = XLSX.read(readFileSync(file));
  const out = new Map();
  for (const [sex, sheetName] of [["M", "MYE2 - Males"], ["F", "MYE2 - Females"]]) {
    const { header, rows } = sheetRows(wb, sheetName, "Code", `${file} ${sheetName}`);
    const code = headerIndex(header, "Code", sheetName);
    const name = headerIndex(header, "Name", sheetName);
    const geo = headerIndex(header, "Geography", sheetName);
    const ageCols = [];
    for (let a = 0; a <= 89; a++) ageCols.push(headerIndex(header, String(a), sheetName));
    ageCols.push(headerIndex(header, "90+", sheetName));
    for (const r of rows) {
      if (!r[code] || !LA_GEOGRAPHIES.has(String(r[geo]).trim())) continue;
      if (!out.has(r[code])) out.set(r[code], { name: r[name], M: null, F: null });
      out.get(r[code])[sex] = ageCols.map((c) => Number(r[c]));
    }
  }
  const title = XLSX.utils.sheet_to_json(wb.Sheets["MYE2 - Persons"], { header: 1 })[0]?.[0];
  const year = Number(String(title).match(/mid-(\d{4})/i)?.[1]);
  if (!year) throw new Error(`${file}: cannot read the reference year from the MYE2 title`);
  return { year, cover: coverLines(wb), areas: out };
}

/**
 * ONS detailed time series (myebtablesenglandwales<yyyy><yyyy>.xlsx), table
 * MYEB1: local authority (as of April 2023) by sex and single year of age, one
 * column per year.
 */
export function readMyeb1(file, years) {
  const wb = XLSX.read(readFileSync(file), { sheets: ["Cover sheet", "MYEB1"] });
  const { header, rows } = sheetRows(wb, "MYEB1", "ladcode23", `${file} MYEB1`);
  const code = headerIndex(header, "ladcode23", "MYEB1");
  const name = headerIndex(header, "laname23", "MYEB1");
  const sex = headerIndex(header, "sex", "MYEB1");
  const age = headerIndex(header, "age", "MYEB1");
  const yearCols = years.map((y) => [y, headerIndex(header, `population_${y}`, "MYEB1")]);
  const out = new Map();
  for (const r of rows) {
    if (!r[code]) continue;
    const s = String(r[sex]).toLowerCase() === "m" ? "M" : String(r[sex]).toLowerCase() === "f" ? "F" : null;
    if (!s) throw new Error(`MYEB1: unexpected sex "${r[sex]}"`);
    const ai = ageIndex(r[age]);
    if (ai === null) throw new Error(`MYEB1: unexpected age "${r[age]}"`);
    if (!out.has(r[code])) out.set(r[code], { name: r[name], M: {}, F: {} });
    const rec = out.get(r[code]);
    for (const [y, c] of yearCols) {
      rec[s][y] ??= zeros();
      rec[s][y][ai] += Number(r[c]);
    }
  }
  return { cover: coverLines(wb), areas: out };
}

/**
 * ONS SNPP sex file in the "2022 SNPP Population males.csv" layout: one row per
 * area and age group, one column per year. Returns single-year arrays by year;
 * the "All ages" row is checked against the sum of the single years.
 */
export function readSnppSexCsv(text, where) {
  const lines = text.split(/\r?\n/).filter((l) => l.trim());
  const header = parseCsvLine(lines[0]);
  const code = headerIndex(header, "AREA_CODE", where);
  const age = headerIndex(header, "AGE_GROUP", where);
  const name = headerIndex(header, "AREA_NAME", where);
  const yearCols = header.map((h, i) => [h, i]).filter(([h]) => /^\d{4}$/.test(h)).map(([h, i]) => [Number(h), i]);
  const out = new Map();
  const allAges = new Map();
  for (let i = 1; i < lines.length; i++) {
    const cols = parseCsvLine(lines[i]);
    const c = cols[code];
    if (!c) continue;
    if (cols[age] === "All ages") {
      allAges.set(c, Object.fromEntries(yearCols.map(([y, j]) => [y, Number(cols[j])])));
      continue;
    }
    const ai = ageIndex(cols[age]);
    if (ai === null) throw new Error(`${where}: unexpected age "${cols[age]}"`);
    if (!out.has(c)) out.set(c, { name: cols[name], years: {} });
    const rec = out.get(c);
    for (const [y, j] of yearCols) {
      rec.years[y] ??= zeros();
      rec.years[y][ai] += Number(cols[j]);
    }
  }
  for (const [c, rec] of out) {
    const tot = allAges.get(c);
    if (!tot) throw new Error(`${where}: ${c} has no All ages row`);
    for (const [y] of yearCols) {
      const sum = rec.years[y].reduce((a, b) => a + b, 0);
      if (Math.abs(sum - tot[y]) / Math.max(1, tot[y]) > 0.001) throw new Error(`${where}: ${c} ${y} single years ${sum} against All ages ${tot[y]}`);
    }
  }
  return { years: yearCols.map(([y]) => y), areas: out };
}

/**
 * ONS NPP machine-readable workbook (en_ppp_machine_readable.xlsx), sheet
 * "Population": sex by age (0 to 104, "105 - 109", "110 and over") by year.
 */
export function readNppPopulation(buffer, where) {
  const wb = XLSX.read(buffer);
  const cover = coverLines(wb);
  const { header, rows } = sheetRows(wb, "Population", "Sex", `${where} Population`);
  const sexCol = headerIndex(header, "Sex", where);
  const ageCol = headerIndex(header, "Age", where);
  const yearCols = header.map((h, i) => [h, i]).filter(([h]) => /^\d{4}$/.test(h)).map(([h, i]) => [Number(h), i]);
  const out = { M: {}, F: {} };
  for (const r of rows) {
    const s = /^male/i.test(r[sexCol]) ? "M" : /^female/i.test(r[sexCol]) ? "F" : null;
    if (!s) continue;
    const ai = ageIndex(r[ageCol]);
    if (ai === null) throw new Error(`${where}: unexpected age "${r[ageCol]}"`);
    for (const [y, c] of yearCols) {
      out[s][y] ??= zeros();
      out[s][y][ai] += Number(r[c]);
    }
  }
  return { cover, years: yearCols.map(([y]) => y), population: out };
}

/**
 * Welsh Government 2022-based local authority projections, StatsWales full
 * download with reference codes. Keeps one variant (by its reference code) and
 * the 22 local authorities.
 */
export function readWelshProjections(file, variant = "Principal") {
  const text = readFileSync(file, "utf8").replace(/^﻿/, "");
  const lines = text.split(/\r?\n/);
  const header = parseCsvLine(lines[0]);
  const where = file;
  const val = headerIndex(header, "Data values", where);
  const variantRef = headerIndex(header, "Variant_reference", where);
  const variantLabel = headerIndex(header, "Variant", where);
  const yearRef = headerIndex(header, "Year_reference", where);
  const areaRef = headerIndex(header, "Area_reference", where);
  const areaName = headerIndex(header, "Area", where);
  const sexRef = headerIndex(header, "Sex_reference", where);
  const ageRef = headerIndex(header, "Age_reference", where);
  const out = new Map();
  let label = null;
  for (let i = 1; i < lines.length; i++) {
    if (!lines[i]) continue;
    const cols = parseCsvLine(lines[i]);
    if (cols[variantRef] !== variant) continue;
    label ??= cols[variantLabel];
    const code = cols[areaRef];
    if (!/^W06/.test(code)) continue;
    const sex = cols[sexRef];
    if (sex !== "M" && sex !== "F") continue;
    if (cols[ageRef] === "AllAges") continue;
    const ai = ageIndex(cols[ageRef]);
    if (ai === null) throw new Error(`${where}: unexpected age reference "${cols[ageRef]}"`);
    const y = Number(cols[yearRef]);
    if (!out.has(code)) out.set(code, { name: cols[areaName], M: {}, F: {} });
    const rec = out.get(code);
    rec[sex][y] ??= zeros();
    rec[sex][y][ai] += Number(cols[val]);
  }
  if (out.size === 0) throw new Error(`${where}: no rows for variant "${variant}"`);
  return { variant: label, areas: out };
}

/**
 * ONS user requested data 3596 (rescaledpop2025to2050.xlsx), sheet "Data":
 * English local authorities by age (90 meaning 90 and over), sex and year.
 */
export function read3596(file) {
  const wb = XLSX.read(readFileSync(file));
  const cover = coverLines(wb);
  const { header, rows } = sheetRows(wb, "Data", "LA code", `${file} Data`);
  const code = header.findIndex((h) => h.startsWith("LA code"));
  const name = header.findIndex((h) => h.startsWith("LA name"));
  const age = header.findIndex((h) => h.startsWith("Age"));
  const sex = headerIndex(header, "Sex", file);
  if (code < 0 || name < 0 || age < 0) throw new Error(`${file}: LA code, LA name or Age header missing`);
  const yearCols = header.map((h, i) => [h.match(/^(\d{4})\b/)?.[1], i]).filter(([y]) => y).map(([y, i]) => [Number(y), i]);
  const out = new Map();
  for (const r of rows) {
    if (!r[code]) continue;
    const s = /^male/i.test(r[sex]) ? "M" : /^female/i.test(r[sex]) ? "F" : null;
    if (!s) throw new Error(`${file}: unexpected sex "${r[sex]}"`);
    const ai = ageIndex(r[age]);
    if (ai === null) throw new Error(`${file}: unexpected age "${r[age]}"`);
    if (!out.has(r[code])) out.set(r[code], { name: r[name], M: {}, F: {} });
    const rec = out.get(r[code]);
    for (const [y, c] of yearCols) {
      rec[s][y] ??= zeros();
      rec[s][y][ai] += Number(r[c]);
    }
  }
  return { cover, years: yearCols.map(([y]) => y), areas: out };
}
