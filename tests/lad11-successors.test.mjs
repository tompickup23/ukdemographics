import { describe, expect, it } from "vitest";
import { existsSync, readFileSync } from "node:fs";
import XLSX from "xlsx";
import { successors2011, successors2023 } from "../scripts/model/lib/geography.mjs";
import { parseCsvLine } from "../scripts/model/lib/snpp.mjs";

describe("successor lookups", () => {
  it("expands a 2022 district created after 2011 into its 2011 parts", () => {
    const s = successors2011();
    // Somerset (April 2023) includes Somerset West and Taunton (2019), which was
    // Taunton Deane and West Somerset in 2011.
    expect(s.E06000066).toEqual(expect.arrayContaining(["E07000187", "E07000188", "E07000189", "E07000190", "E07000191"]));
    expect(s.E06000066).not.toContain("E07000246");
    expect(successors2023().E06000066).toContain("E07000246");
  });
});

/**
 * Each successor's summed Census 2011 counts must be within 1% of ONS's own
 * mid-2011 estimate for the successor on April 2023 boundaries (MYEB1). A wrong
 * or missing predecessor moves that by far more than 1%. Needs the linked
 * inputs, so it is skipped without them.
 */
const DC = "data/raw/census_2011_ethnicity_age/dc2101ew_ethnicity_sex_age_la.csv";
const MYEB = "data/raw/ons_mye_timeseries/myebtablesenglandwales20112025.xlsx";
const ready = existsSync(DC) && existsSync(MYEB);

describe.skipIf(!ready)("successor lookups against ONS data", () => {
  it("matches each successor's 2011 population to within 1%", () => {
    const detailed = new Set(["2", "3", "4", "5", "7", "8", "9", "10", "12", "13", "14", "15", "16", "18", "19", "20", "22", "23"]);
    const dc = new Map();
    const lines = readFileSync(DC, "utf8").split("\n");
    for (const l of lines.slice(1)) {
      if (!l) continue;
      const c = parseCsvLine(l);
      if (!detailed.has(c[2]) || !["1", "2"].includes(c[4])) continue;
      dc.set(c[0], (dc.get(c[0]) ?? 0) + Number(c[8]));
    }
    const wb = XLSX.read(readFileSync(MYEB), { sheets: ["MYEB1"] });
    const rows = XLSX.utils.sheet_to_json(wb.Sheets.MYEB1, { header: 1 });
    const h = rows.findIndex((r) => r[0] === "ladcode23");
    const col = rows[h].indexOf("population_2011");
    const mye = new Map();
    for (const r of rows.slice(h + 1)) if (r[0]) mye.set(r[0], (mye.get(r[0]) ?? 0) + Number(r[col]));

    for (const [succ, preds] of Object.entries(successors2011())) {
      if (succ === "E07000246") continue; // abolished in 2023; checked inside Somerset
      expect(mye.has(succ), `${succ} is a current authority`).toBe(true);
      const census = dc.has(succ) ? dc.get(succ) : preds.reduce((a, p) => a + (dc.get(p) ?? Number.NaN), 0);
      expect(Math.abs(census / mye.get(succ) - 1), succ).toBeLessThan(0.01);
    }
  }, 120_000);
});
