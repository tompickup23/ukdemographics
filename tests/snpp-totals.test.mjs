import { describe, expect, it } from "vitest";
import { existsSync, readFileSync } from "node:fs";
import { readSnppTotals } from "../scripts/model/lib/snpp.mjs";

/**
 * The SNPP envelope run_projection_v2.mjs scales each area to. The file holds
 * an "All ages" row and one row per single year for every area, so the area
 * total is the "All ages" row alone. Summing every row doubles it.
 */

// A two-area fixture in the ONS layout. Ages 0, 1 and "90 and over" stand in
// for the full single-year run; their sum equals the "All ages" row, as in the
// real file. One area name carries a comma, as "Bristol, City of" does.
const FIXTURE = [
  '"AREA_CODE","AREA_NAME","COMPONENT","SEX","AGE_GROUP","2022","2031"',
  "E07000117,Burnley,Population,persons,All ages,300.000,330.000",
  "E07000117,Burnley,Population,persons,0,100.000,110.000",
  "E07000117,Burnley,Population,persons,1,120.000,130.000",
  "E07000117,Burnley,Population,persons,90 and over,80.000,90.000",
  'E06000023,"Bristol, City of",Population,persons,All ages,50.000,60.000',
  'E06000023,"Bristol, City of",Population,persons,0,20.000,25.000',
  'E06000023,"Bristol, City of",Population,persons,1,30.000,35.000',
  "W06000015,Cardiff,Population,persons,All ages,999.000,999.000",
].join("\n");

describe("SNPP area totals", () => {
  it("takes the All ages row, not All ages plus every single year", () => {
    const { totals } = readSnppTotals(FIXTURE);
    expect(totals.get("E07000117")["2031"]).toBe(330);
    expect(totals.get("E06000023")["2022"]).toBe(50);
  });

  it("keeps English areas only by default", () => {
    const { totals } = readSnppTotals(FIXTURE);
    expect(totals.has("W06000015")).toBe(false);
  });

  it("stops on an area whose All ages row disagrees with its single years", () => {
    const planted = FIXTURE.replace("All ages,300.000", "All ages,600.000");
    expect(() => readSnppTotals(planted)).toThrow(/disagrees/);
  });

  it("stops when the age column is missing", () => {
    const planted = FIXTURE.replace('"AGE_GROUP"', '"AGE"');
    expect(() => readSnppTotals(planted)).toThrow(/AGE_GROUP/);
  });

  const real = "data/raw/snpp/2022 SNPP Population persons.csv";
  it.skipIf(!existsSync(real))("matches the All ages row and the single-year sum in the held file (Burnley)", () => {
    const text = readFileSync(real, "utf8");
    const { totals, years } = readSnppTotals(text);
    // Recompute both sides from the raw rows, independently of the reader.
    const rows = text.split("\n").filter((l) => l.startsWith("E07000117,"));
    const cells = (row) => row.split(",").slice(5).map(Number);
    const allAges = cells(rows.find((r) => r.split(",")[4] === "All ages"));
    const singles = rows.filter((r) => r.split(",")[4] !== "All ages").map(cells);
    years.forEach((y, j) => {
      const sum = singles.reduce((s, c) => s + c[j], 0);
      expect(totals.get("E07000117")[y]).toBeCloseTo(allAges[j], 3);
      expect(Math.abs(totals.get("E07000117")[y] - sum) / sum).toBeLessThan(0.001);
    });
  });
});
