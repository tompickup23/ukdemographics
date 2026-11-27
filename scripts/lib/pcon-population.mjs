/**
 * Reads a table of population by single year of age and sex for Westminster
 * constituencies, as the publisher's query tool gives it.
 *
 * ONS stopped publishing constituency estimates as workbooks on ons.gov.uk on
 * 25 November 2024 and sends users to Nomis. The table comes from one query in the
 * Nomis query tool, made in a browser, and scripts/fetch/adopt-ons-pcon-estimates.mjs
 * records the file. No script requests it. The reader takes two shapes and stops,
 * saying what it found, on anything else:
 *
 *   wide   what the query tool gives as CSV (seen 27 November 2026, mid-2024 table):
 *          a block per sex under a line such as "Gender     :","Male", a row per
 *          constituency (name, code, "All Ages", then a column per age)
 *   long   one row per constituency, sex and age, with a header naming the columns
 *
 * Nothing here estimates or fills a gap. A seat without all 91 ages for both sexes
 * fails the build.
 */

export const AGE_COUNT = 91;
export const OPEN_AGE = 90;
/** 2024 constituencies in England (E14001063 on) and Wales (W07000081 on). */
export const PCON_CODE = /\b(E14\d{6}|W07\d{6})\b/;
export const EXPECTED_SEATS = { England: 543, Wales: 32 };

/** Splits CSV or tab separated text into rows of cells, honouring quoted cells. */
export function parseDelimited(text) {
  const body = text.replace(/^﻿/, "");
  const firstLines = body.split(/\r?\n/).slice(0, 40);
  const tabs = firstLines.filter((l) => l.includes("\t")).length;
  const commas = firstLines.filter((l) => l.includes(",")).length;
  const sep = tabs > commas ? "\t" : ",";
  const rows = [];
  let row = [];
  let cell = "";
  let quoted = false;
  for (let i = 0; i < body.length; i++) {
    const ch = body[i];
    if (quoted) {
      if (ch === '"' && body[i + 1] === '"') { cell += '"'; i++; }
      else if (ch === '"') quoted = false;
      else cell += ch;
    } else if (ch === '"') quoted = true;
    else if (ch === sep) { row.push(cell); cell = ""; }
    else if (ch === "\n" || ch === "\r") {
      if (ch === "\r" && body[i + 1] === "\n") i++;
      row.push(cell);
      rows.push(row);
      row = [];
      cell = "";
    } else cell += ch;
  }
  if (cell !== "" || row.length) { row.push(cell); rows.push(row); }
  return rows.map((r) => r.map((c) => c.trim()));
}

/** "Age 0" is 0, "Aged 90+" is 90. Bands and totals ("Aged 16 to 64", "Age 0 - 4", "All Ages") are null. */
export function ageFromLabel(label) {
  const s = String(label).trim();
  const single = /^Aged?\s+(\d{1,2})$/i.exec(s) ?? /^(\d{1,2})$/.exec(s);
  if (single) {
    const age = Number(single[1]);
    return age < OPEN_AGE ? age : null;
  }
  if (/^Aged?\s+90\s*(\+|and over|or over|plus)$/i.test(s) || /^90\s*(\+|and over)$/i.test(s)) return OPEN_AGE;
  return null;
}

/** "Male" or "Males" is M, "Female" is F, "Total", "Persons" or "All persons" is T. */
export function sexFromLabel(label) {
  const s = String(label).trim().toLowerCase();
  if (/^males?$/.test(s)) return "M";
  if (/^females?$/.test(s)) return "F";
  if (/^(total|persons|all persons|all)$/.test(s)) return "T";
  return null;
}

/** A count as published: digits, with optional thousands commas. Anything else is not a count. */
export function countFrom(cell) {
  const s = String(cell).trim().replace(/,/g, "");
  return /^\d+$/.test(s) ? Number(s) : null;
}

const pick = (header, patterns) => {
  for (const p of patterns) {
    const i = header.findIndex((h) => p.test(h));
    if (i >= 0) return i;
  }
  return -1;
};

function readLong(rows, headerAt) {
  const header = rows[headerAt];
  const col = {
    code: pick(header, [/^geography[_ ]?code$/i, /^mnemonic$/i, /^(area|pcon\d*)[_ ]?(code|cd)$/i]),
    name: pick(header, [/^geography[_ ]?name$/i, /^(area|pcon\d*)[_ ]?(name|nm)$/i, /^geography$/i]),
    sex: pick(header, [/^(gender|sex)[_ ]?name$/i, /^(gender|sex)$/i]),
    age: pick(header, [/^(c_)?age[_ ]?name$/i, /^(c_)?age$/i]),
    value: pick(header, [/^obs[_ ]?value$/i, /^(value|count|population)$/i]),
    date: pick(header, [/^date[_ ]?name$/i, /^date$/i, /^(year|mid[_ -]?year)$/i])
  };
  const missing = Object.entries(col).filter(([k, i]) => i < 0 && k !== "date" && k !== "name").map(([k]) => k);
  if (missing.length) throw new Error(`long table: no column for ${missing.join(", ")} in header [${header.join(" | ")}]`);
  const seats = new Map();
  const dates = new Set();
  const totals = new Map();
  for (const r of rows.slice(headerAt + 1)) {
    const code = PCON_CODE.exec(r[col.code] ?? "")?.[1];
    if (!code) continue;
    const sex = sexFromLabel(r[col.sex] ?? "");
    const age = ageFromLabel(r[col.age] ?? "");
    const value = countFrom(r[col.value] ?? "");
    if (col.date >= 0 && r[col.date]) dates.add(r[col.date]);
    if (sex === "T" && /^all ages$/i.test(r[col.age] ?? "") && value !== null) totals.set(code, value);
    if (!sex || sex === "T" || age === null) continue;
    if (value === null) throw new Error(`${code}: "${r[col.value]}" is not a count (sex ${sex}, age ${age})`);
    const seat = seats.get(code) ?? { name: col.name >= 0 ? r[col.name] : "", M: [], F: [] };
    if (seat[sex][age] !== undefined) throw new Error(`${code}: two values for sex ${sex}, age ${age}`);
    seat[sex][age] = value;
    seats.set(code, seat);
  }
  return { layout: "long", seats, dates: [...dates], totals, sexTotals: new Map() };
}

function readWide(rows) {
  const seats = new Map();
  const dates = new Set();
  const sexTotals = new Map();
  let sex = null;
  let ages = null;
  let allAgesAt = -1;
  for (const r of rows) {
    const cells = r.filter((c) => c !== "");
    if (cells.length === 0) continue;
    // A line such as "gender : Male", "Sex: Female" or a cell pair ["Gender", "Male"].
    const flat = cells.join(" ");
    const sexLine = /^(gender|sex)\s*:?\s*(.+)$/i.exec(flat);
    if (sexLine && cells.length <= 2) { sex = sexFromLabel(sexLine[2]); ages = null; continue; }
    const dateLine = /^(date|year)\s*:?\s*(.+)$/i.exec(flat);
    if (dateLine && cells.length <= 2) { dates.add(dateLine[2].trim()); continue; }
    const ageCols = r.map((c) => ageFromLabel(c));
    if (ageCols.filter((a) => a !== null).length >= AGE_COUNT) {
      ages = ageCols;
      allAgesAt = r.findIndex((c) => /^all ages$/i.test(c));
      continue;
    }
    const codeAt = r.findIndex((c) => PCON_CODE.test(c));
    if (codeAt < 0) continue;
    if (!ages) throw new Error(`wide table: a constituency row before any row of age headings: [${r.slice(0, 4).join(" | ")}]`);
    if (!sex) throw new Error(`wide table: a constituency row before any line naming the sex: [${r.slice(0, 4).join(" | ")}]`);
    if (sex === "T") continue;
    const code = PCON_CODE.exec(r[codeAt])[1];
    // The name shares the code's cell, or sits in the cell before it or after it.
    const beside = [r[codeAt - 1], r[codeAt + 1]].find((c) => c && countFrom(c) === null && ageFromLabel(c) === null);
    const name = r[codeAt].replace(code, "").replace(/^[\s:,-]+|[\s:,-]+$/g, "") || beside || "";
    const seat = seats.get(code) ?? { name, M: [], F: [] };
    if (seat[sex].length) throw new Error(`${code}: two rows for sex ${sex}`);
    ages.forEach((age, i) => {
      if (age === null) return;
      const value = countFrom(r[i] ?? "");
      if (value === null) throw new Error(`${code}: "${r[i]}" is not a count (sex ${sex}, age ${age})`);
      seat[sex][age] = value;
    });
    seats.set(code, seat);
    // The block's own "All Ages" figure for this sex, where it has one.
    const stated = allAgesAt >= 0 ? countFrom(r[allAgesAt] ?? "") : null;
    if (stated !== null) sexTotals.set(`${code} ${sex}`, stated);
  }
  return { layout: "wide", seats, dates: [...dates], totals: new Map(), sexTotals };
}

/** Reads either shape. Throws, naming what it saw, when the text is neither. */
export function readPconTable(text) {
  const rows = parseDelimited(text);
  const headerAt = rows.findIndex(
    (r) => r.some((c) => /^(obs[_ ]?value|value|count|population)$/i.test(c)) && r.some((c) => /^(gender|sex)([_ ]?name)?$/i.test(c))
  );
  const table = headerAt >= 0 ? readLong(rows, headerAt) : readWide(rows);
  if (table.seats.size === 0) {
    const sample = rows.filter((r) => r.some((c) => c !== "")).slice(0, 6).map((r) => r.slice(0, 5).join(" | "));
    throw new Error(`no constituency rows found. First lines:\n  ${sample.join("\n  ")}`);
  }
  return table;
}

const sum = (row) => row.reduce((a, b) => a + b, 0);
const complete = (row) => row.length === AGE_COUNT && Array.from(row, (v) => Number.isInteger(v) && v >= 0).every(Boolean);

/**
 * The checks a table must pass before any figure is written. `countryTotals` are the
 * published mid-year totals for England and for Wales for the same date, from
 * population-estimates.json: constituencies nest in countries, so the seats must add
 * to them exactly.
 */
export function checkPconTable(table, { countryTotals } = {}) {
  const problems = [];
  const codes = [...table.seats.keys()].sort();
  const english = codes.filter((c) => c.startsWith("E14"));
  const welsh = codes.filter((c) => c.startsWith("W07"));
  if (english.length !== EXPECTED_SEATS.England) problems.push(`${english.length} English seats, expected ${EXPECTED_SEATS.England}`);
  if (welsh.length !== EXPECTED_SEATS.Wales) problems.push(`${welsh.length} Welsh seats, expected ${EXPECTED_SEATS.Wales}`);
  for (const code of codes) {
    const seat = table.seats.get(code);
    for (const sex of ["M", "F"]) {
      if (!complete(seat[sex])) problems.push(`${code}: sex ${sex} does not have ${AGE_COUNT} whole, non-negative counts`);
      const stated = table.sexTotals.get(`${code} ${sex}`);
      if (stated !== undefined && complete(seat[sex]) && stated !== sum(seat[sex])) {
        problems.push(`${code}: sex ${sex} ages add to ${sum(seat[sex])}, the table's own figure for all ages is ${stated}`);
      }
    }
    const published = table.totals.get(code);
    if (published !== undefined && complete(seat.M) && complete(seat.F) && published !== sum(seat.M) + sum(seat.F)) {
      problems.push(`${code}: ages add to ${sum(seat.M) + sum(seat.F)}, the table's own total is ${published}`);
    }
  }
  if (table.dates.length > 1) problems.push(`more than one date in the table: ${table.dates.join(", ")}`);
  if (countryTotals && problems.length === 0) {
    const add = (list) => list.reduce((a, c) => a + sum(table.seats.get(c).M) + sum(table.seats.get(c).F), 0);
    if (add(english) !== countryTotals.England) problems.push(`English seats add to ${add(english)}, the mid-year estimate for England is ${countryTotals.England}`);
    if (add(welsh) !== countryTotals.Wales) problems.push(`Welsh seats add to ${add(welsh)}, the mid-year estimate for Wales is ${countryTotals.Wales}`);
  }
  return problems;
}
