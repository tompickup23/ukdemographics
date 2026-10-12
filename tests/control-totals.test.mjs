import { describe, expect, it } from "vitest";
import { existsSync, readFileSync } from "node:fs";
import XLSX from "xlsx";
import {
  aggregateSuccessors,
  applyRatios,
  extendRatios,
  growthRatios,
  rescaleToNational,
} from "../scripts/model/lib/control-totals-method.mjs";
import {
  ageIndex,
  listZip,
  readMye2,
  readMyeb1,
  readNppPopulation,
  readWelshProjections,
  read3596,
  unzipMember,
} from "../scripts/model/lib/control-totals-sources.mjs";

const row = (...v) => [...v, ...new Array(91 - v.length).fill(0)];
const sum = (a) => a.reduce((x, y) => x + y, 0);

describe("control-totals arithmetic", () => {
  it("anchors an area to its base year and moves it by the source's growth", () => {
    const series = { 2025: row(100, 200), 2026: row(110, 180) };
    const { ratios } = growthRatios(series, 2025, [2026]);
    const p = applyRatios(row(50, 50), ratios, [2026]);
    expect(p[2026][0]).toBeCloseTo(55);
    expect(p[2026][1]).toBeCloseTo(45);
  });

  it("gives an empty base cell the area's all-age ratio instead of dividing by zero", () => {
    const { ratios, fallbacks } = growthRatios({ 2025: row(100, 0), 2026: row(120, 30) }, 2025, [2026]);
    expect(fallbacks).toBeGreaterThan(0);
    expect(ratios[2026][1]).toBeCloseTo(150 / 100);
  });

  it("extends ratios in a straight line and holds a line that turns negative", () => {
    const ratios = { 2043: row(1.0, 0.5), 2047: row(1.2, 0.1) };
    const held = extendRatios(ratios, 2047, 2061);
    expect(ratios[2051][0]).toBeCloseTo(1.4);
    expect(ratios[2061][1]).toBeCloseTo(0.1); // 0.1 - 0.1 * 14 < 0, so held at the 2047 value
    expect(held).toBeGreaterThan(0);
  });

  it("rescales areas so they sum to the national target in every cell", () => {
    const areas = { A: { M: { 2030: row(10, 30) }, F: { 2030: row(5) } }, B: { M: { 2030: row(30, 10) }, F: { 2030: row(15) } } };
    const targets = { M: { 2030: row(80, 20) }, F: { 2030: row(40) } };
    rescaleToNational(areas, targets, [2030]);
    expect(areas.A.M[2030][0] + areas.B.M[2030][0]).toBeCloseTo(80);
    expect(areas.A.M[2030][0] / areas.B.M[2030][0]).toBeCloseTo(10 / 30); // shares kept
    expect(areas.A.F[2030][0] + areas.B.F[2030][0]).toBeCloseTo(40);
  });

  it("sums predecessors into a successor and refuses a partial set", () => {
    const m = new Map([
      ["E07000163", { years: { 2025: row(1) } }],
      ["E07000164", { years: { 2025: row(2) } }],
    ]);
    const out = aggregateSuccessors(m, { E06000065: ["E07000163", "E07000164"] });
    expect(out.get("E06000065").years[2025][0]).toBe(3);
    expect(out.has("E07000163")).toBe(false);
    expect(() => aggregateSuccessors(m, { E06000065: ["E07000163", "E07000999"] })).toThrow(/predecessors/);
  });

  it("maps age labels to the model's 0 to 90 range", () => {
    expect(ageIndex(0)).toBe(0);
    expect(ageIndex("89")).toBe(89);
    expect(ageIndex("90 and over")).toBe(90);
    expect(ageIndex("90+")).toBe(90);
    expect(ageIndex("Age 90+")).toBe(90);
    expect(ageIndex("105 - 109")).toBe(90);
    expect(ageIndex("110 and over")).toBe(90);
    expect(ageIndex("All ages")).toBeNull();
  });
});

/**
 * Checks on the built file against the published sources, read independently of
 * the build. They need the linked inputs and a built file
 * (node scripts/model/link_inputs.mjs --model v8.1 && node scripts/model/build_control_totals.mjs),
 * so they are skipped without them, which includes CI.
 */
const BUILT = "data/model/control_totals_v81.json";
const BUILT_3596 = "data/model/control_totals_3596.json";
const SRC = {
  mye: "data/raw/ons_mye/mye25tablesew.xlsx",
  myeb: "data/raw/ons_mye_timeseries/myebtablesenglandwales20112025.xlsx",
  npp: "data/raw/ons_npp_england/en1.zip",
  wales: "data/raw/wg_lapp/wg_lapp_2022based_036507d7_raw_extended.csv",
  ons3596: "data/raw/ons_3596/rescaledpop2025to2050.xlsx",
};
const ready = existsSync(BUILT) && Object.values(SRC).every((p) => existsSync(p));

describe.skipIf(!ready)("built v8.1 control totals against their sources", () => {
  const doc = ready ? JSON.parse(readFileSync(BUILT, "utf8")) : null;
  const english = ready ? Object.keys(doc.areas).filter((c) => c.startsWith("E")) : [];
  const welsh = ready ? Object.keys(doc.areas).filter((c) => c.startsWith("W")) : [];
  const projYears = ready ? doc.years.filter((y) => y >= 2026) : [];

  it("covers every authority in England and Wales on April 2023 boundaries, 2022 to 2061", () => {
    expect(english.length + welsh.length).toBe(318);
    expect(welsh.length).toBe(22);
    expect(doc.years[0]).toBe(2022);
    expect(doc.years.at(-1)).toBe(2061);
    expect(doc.meta.assumptions.join(" ")).toMatch(/UKD's assumption/);
  });

  it("equals the revised mid-year estimates for 2022 to 2025", () => {
    const mye2 = readMye2(SRC.mye);
    const myeb = readMyeb1(SRC.myeb, [2022, 2023, 2024]);
    let worst = 0;
    for (const code of [...english, ...welsh]) {
      for (const s of ["M", "F"]) {
        for (const y of [2022, 2023, 2024]) myeb.areas.get(code)[s][y].forEach((v, i) => (worst = Math.max(worst, Math.abs(v - doc.areas[code][s][y][i]))));
        mye2.areas.get(code)[s].forEach((v, i) => (worst = Math.max(worst, Math.abs(v - doc.areas[code][s][2025][i]))));
      }
    }
    expect(worst).toBeLessThan(0.001);
  }, 120_000);

  it("adds up to the published England figure for mid-2025", () => {
    const wb = XLSX.read(readFileSync(SRC.mye));
    const rows = XLSX.utils.sheet_to_json(wb.Sheets["MYE2 - Persons"], { header: 1 });
    const h = rows.findIndex((r) => r[0] === "Code");
    const allAges = rows[h].indexOf("All ages");
    const england = rows.find((r) => r[0] === "E92000001")[allAges];
    const built = english.reduce((a, c) => a + sum(doc.areas[c].M[2025]) + sum(doc.areas[c].F[2025]), 0);
    expect(Math.abs(built - england)).toBeLessThan(1);
  }, 60_000);

  it("sums to the 2024-based NPP for England by age and sex from 2026", () => {
    expect(doc.meta.englandControl).toBe("npp-level");
    const member = listZip(SRC.npp).find((m) => /^en_ppp_machine_readable\.xlsx$/i.test(m));
    const npp = readNppPopulation(unzipMember(SRC.npp, member), member).population;
    let worst = 0;
    for (const s of ["M", "F"]) {
      for (const y of projYears) {
        for (let x = 0; x <= 90; x++) {
          let got = 0;
          for (const c of english) got += doc.areas[c][s][y][x];
          worst = Math.max(worst, Math.abs(got - npp[s][y][x]) / Math.max(1, npp[s][y][x]));
        }
      }
    }
    expect(worst).toBeLessThan(1e-6);
  }, 120_000);

  it("moves each Welsh authority as the Welsh Government principal projection does, anchored to mid-2025", () => {
    const wg = readWelshProjections(SRC.wales, "Principal");
    let worst = 0;
    for (const code of welsh) {
      for (const s of ["M", "F"]) {
        const w = wg.areas.get(code)[s];
        for (let y = 2026; y <= 2047; y++) {
          for (let x = 0; x <= 90; x++) {
            if (w[2025][x] <= 0) continue;
            const expected = doc.areas[code][s][2025][x] * (w[y][x] / w[2025][x]);
            worst = Math.max(worst, Math.abs(doc.areas[code][s][y][x] - expected));
          }
        }
      }
    }
    // Values are stored to three decimal places.
    expect(worst).toBeLessThan(0.01);
  }, 180_000);

  it.skipIf(!existsSync(BUILT_3596))("writes the 3596 sensitivity series as published for England, 2025 to 2050", () => {
    const s = JSON.parse(readFileSync(BUILT_3596, "utf8"));
    const r = read3596(SRC.ons3596);
    let worst = 0;
    for (const code of english) {
      for (const sex of ["M", "F"]) {
        for (let y = 2025; y <= 2050; y++) r.areas.get(code)[sex][y].forEach((v, i) => (worst = Math.max(worst, Math.abs(v - s.areas[code][sex][y][i]))));
      }
    }
    expect(worst).toBeLessThan(0.01);
    expect(s.meta.role).toMatch(/Sensitivity/);
  }, 120_000);
});
