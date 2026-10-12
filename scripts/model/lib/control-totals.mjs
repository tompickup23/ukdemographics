/**
 * Population control totals for the forward model, from either of two files.
 *
 * 1. The ONS SNPP persons CSV ("2022 SNPP Population persons.csv"), which v8.0
 *    used: area totals only, mid-2022 to mid-2047. Beyond 2047 the model extends
 *    each area linearly from its 2043 to 2047 change, exactly as v8.0 did.
 * 2. A control-totals JSON written by scripts/model/build_control_totals.mjs:
 *    area by sex by single year of age (0 to 89, and 90 for 90 and over) by
 *    year, with every projection year present. Its own metadata says which
 *    years come from which source and which are UKD's extrapolation.
 *
 * Both give `total(code, year)`. Only the JSON gives `cell(code, sex, age, year)`,
 * which the age-sex cap needs.
 */
import { readFileSync } from "node:fs";
import { readSnppTotals } from "./snpp.mjs";

export function loadControlTotals(file) {
  const text = readFileSync(file, "utf8");
  if (/\.json$/i.test(file)) return fromJson(JSON.parse(text), file);
  return fromSnppCsv(text, file);
}

function fromSnppCsv(text, file) {
  const { years, totals } = readSnppTotals(text);
  const lastYear = Math.max(...years.map(Number));
  return {
    kind: "snpp-csv",
    file,
    label: "ONS SNPP 2022-based persons (area totals), linear beyond " + lastYear,
    areas: new Set(totals.keys()),
    hasCells: false,
    // v8.0's rule, kept to the letter: up to the last year read the year; beyond
    // it extend from the 2043 to 2047 change, falling back to 2047 if that is
    // missing or the line goes negative.
    total(code, year) {
      const rec = totals.get(code);
      if (!rec) return undefined;
      if (year <= lastYear) return rec[String(year)];
      const s43 = rec["2043"];
      const s47 = rec["2047"];
      if (s43 && s47 && s43 > 0) {
        const annualGrowth = (s47 - s43) / 4;
        let target = s47 + annualGrowth * (year - 2047);
        if (target < 0) target = s47;
        return target;
      }
      return rec["2047"];
    },
    cell() {
      throw new Error("the SNPP persons CSV holds area totals only; the age-sex cap needs a control-totals JSON");
    },
  };
}

function fromJson(doc, file) {
  if (!doc.areas || !Array.isArray(doc.years) || !Array.isArray(doc.ages)) {
    throw new Error(`${file}: not a control-totals file (needs areas, years and ages)`);
  }
  const ageIndex = new Map(doc.ages.map((a, i) => [Number(a), i]));
  const totalsCache = new Map();
  return {
    kind: "control-totals-json",
    file,
    label: doc.label ?? "control totals",
    meta: doc.meta,
    areas: new Set(Object.keys(doc.areas)),
    hasCells: true,
    total(code, year) {
      const key = `${code}|${year}`;
      if (totalsCache.has(key)) return totalsCache.get(key);
      const area = doc.areas[code];
      if (!area) return undefined;
      let sum = 0;
      for (const sex of ["M", "F"]) {
        const row = area[sex]?.[String(year)];
        if (!row) return undefined;
        for (const v of row) sum += v;
      }
      totalsCache.set(key, sum);
      return sum;
    },
    cell(code, sex, age, year) {
      const row = doc.areas[code]?.[sex]?.[String(year)];
      if (!row) return undefined;
      const i = ageIndex.get(Number(age));
      return i === undefined ? undefined : row[i];
    },
  };
}
