/**
 * Read local authority totals from an ONS subnational population projections
 * file (the "2022 SNPP Population persons.csv" layout: one row per area and age
 * group, one column per year).
 *
 * Each area has one "All ages" row and one row per single year of age. The
 * total is the "All ages" row and nothing else. run_projection_v2.mjs used to
 * add every row for an area, the "All ages" row and the single years, which
 * doubled every target (Burnley 2031: 199,651 against the file's 99,825); its
 * scale guard then either doubled the area or silently skipped the cap.
 *
 * Headers are matched by name, never by position, and a missing header, an
 * area without an "All ages" row or an "All ages" row that disagrees with its
 * own single years stops the read.
 */

export function parseCsvLine(line) {
  const fields = [];
  let current = "";
  let inQuotes = false;
  for (const ch of line) {
    if (ch === '"') inQuotes = !inQuotes;
    else if (ch === "," && !inQuotes) {
      fields.push(current.trim());
      current = "";
    } else current += ch;
  }
  fields.push(current.trim());
  return fields;
}

const ALL_AGES = "All ages";

/**
 * @param {string} text  the CSV text
 * @param {{ codePrefix?: string, tolerance?: number }} [opts]
 *   codePrefix: keep only area codes starting with this (default "E")
 *   tolerance: largest allowed relative gap between "All ages" and the sum of
 *   single years for any area and year (default 0.001, i.e. 0.1%; the file
 *   publishes unrounded values, so the two agree to rounding)
 * @returns {{ years: string[], totals: Map<string, Record<string, number>> }}
 */
export function readSnppTotals(text, { codePrefix = "E", tolerance = 0.001 } = {}) {
  const lines = text.split(/\r?\n/).filter((l) => l.trim());
  const header = parseCsvLine(lines[0]);
  const col = (name) => {
    const i = header.indexOf(name);
    if (i < 0) throw new Error(`SNPP file: header "${name}" missing`);
    return i;
  };
  const codeCol = col("AREA_CODE");
  const ageCol = col("AGE_GROUP");
  const yearCols = header.map((h, i) => [h, i]).filter(([h]) => /^\d{4}$/.test(h));
  if (yearCols.length === 0) throw new Error("SNPP file: no year columns");

  const totals = new Map();
  const singleYearSums = new Map();
  for (let r = 1; r < lines.length; r++) {
    const cols = parseCsvLine(lines[r]);
    const code = cols[codeCol];
    if (!code || !code.startsWith(codePrefix)) continue;
    const age = cols[ageCol];
    const target = age === ALL_AGES ? totals : singleYearSums;
    if (age === ALL_AGES && totals.has(code)) throw new Error(`SNPP file: two "All ages" rows for ${code}`);
    if (!target.has(code)) target.set(code, {});
    const rec = target.get(code);
    for (const [year, i] of yearCols) {
      const v = parseFloat(cols[i]);
      if (Number.isNaN(v)) continue;
      rec[year] = age === ALL_AGES ? v : (rec[year] ?? 0) + v;
    }
  }

  for (const code of singleYearSums.keys()) {
    if (!totals.has(code)) throw new Error(`SNPP file: ${code} has single-year rows but no "All ages" row`);
  }
  for (const [code, rec] of totals) {
    const sums = singleYearSums.get(code);
    if (!sums) continue;
    for (const [year] of yearCols) {
      if (rec[year] === undefined || sums[year] === undefined) continue;
      const gap = Math.abs(rec[year] - sums[year]) / Math.max(1, rec[year]);
      if (gap > tolerance) {
        throw new Error(`SNPP file: ${code} ${year} "All ages" ${rec[year]} disagrees with its single years ${sums[year]}`);
      }
    }
  }

  return { years: yearCols.map(([y]) => y), totals };
}
