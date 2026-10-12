import { describe, expect, it } from "vitest";
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { ipfCell, readRm032, readTs009, RM032_BANDS } from "../scripts/model/lib/rm032-fallback.mjs";

describe("IPF fallback on a fixture", () => {
  // Two groups, one sex, ages 0 to 90. RM032-style margins by band, TS009-style by age.
  const groups = ["A", "B"];
  const flat = new Array(91).fill(1);
  const seed = { A: { F: flat.slice() }, B: { F: flat.map((v, i) => (i < 30 ? 3 : 1)) } };
  const margins = { A: { F: [100, 40, 60, 50, 80] }, B: { F: [200, 20, 30, 20, 10] } };
  const bandTotals = margins.A.F.map((v, i) => v + margins.B.F[i]);
  const ages = { F: new Array(91).fill(0) };
  RM032_BANDS.forEach((b, i) => {
    const n = b.to - b.from + 1;
    for (let a = b.from; a <= b.to; a++) ages.F[a] = bandTotals[i] / n;
  });

  it("meets the group-by-band margins exactly and the single-year margins closely", () => {
    const fit = ipfCell(seed, margins, ages, groups, ["F"]);
    for (const g of groups) {
      RM032_BANDS.forEach((b, i) => {
        let s = 0;
        for (let a = b.from; a <= b.to; a++) s += fit.cells[g].F[a];
        expect(s).toBeCloseTo(margins[g].F[i], 6);
      });
    }
    expect(fit.maxAgeGap).toBeLessThan(1e-6);
  });
});

/**
 * The base builder against the held v8.0 base, and the v8.1 options against
 * their margins. Needs the linked inputs (node scripts/model/link_inputs.mjs),
 * so it is skipped without them, which includes CI.
 */
const CUSTOM = "data/raw/census_single_year/census2021_ethnic_age_sex_la_singleyear.csv";
const RM032 = "data/raw/census_base/rm032_ethnic_age_sex.csv";
const TS009 = "data/raw/census_base/ts009_single_year_age_sex.csv";
const ready = [CUSTOM, RM032, TS009].every((p) => existsSync(p));
const sha = (p) => createHash("sha256").update(readFileSync(p)).digest("hex");

function build(extra) {
  const dir = mkdtempSync(path.join(os.tmpdir(), "ukd-base-"));
  const out = path.join(dir, "base.json");
  execFileSync(process.execPath, ["scripts/model/build_single_year_base.mjs", "--out", out, ...extra], { stdio: "ignore" });
  return { out, out12: path.join(dir, "base_single_year_2021_12group.json") };
}

describe.skipIf(!ready)("single-year base builder", () => {
  const manifest = JSON.parse(readFileSync("data/model/INPUTS.json", "utf8"));
  const held = manifest.inputs.find((i) => i.id === "model_base_single_year_2021");

  it("rebuilds the held v8.0 base byte for byte with default options", () => {
    const { out } = build([]);
    expect(sha(out)).toBe(held.sha256);
  }, 120_000);

  it("builds all 318 authorities with Wales, April 2023 geography and the RM032 fallback", () => {
    const { out } = build(["--include-wales", "--geography", "2023", "--fallback", "rm032"]);
    const base = JSON.parse(readFileSync(out, "utf8"));
    const codes = Object.keys(base.areas);
    expect(codes.length).toBe(318);
    expect(codes.filter((c) => c.startsWith("W")).length).toBe(22);
    expect(base.notBuilt).toEqual([]);
    // The 2022 districts the 2023 unitaries replaced are gone.
    expect(codes).not.toContain("E07000028");
    expect(codes).toContain("E06000063");

    // Every estimated authority meets RM032 exactly and TS009 closely.
    const rm = readRm032(RM032);
    const ts = readTs009(TS009);
    const estimated = Object.keys(base.estimatedAreas);
    expect(estimated).toContain("E07000124"); // Ribble Valley
    expect(estimated).toContain("W06000001"); // Isle of Anglesey
    for (const code of estimated) {
      const area = base.areas[code];
      for (const [eth, bySex] of Object.entries(rm.get(code))) {
        for (const sex of ["M", "F"]) {
          RM032_BANDS.forEach((b, i) => {
            let s = 0;
            for (let a = b.from; a <= b.to; a++) s += area[eth][sex][a];
            expect(Math.abs(s - bySex[sex][i]), `${code} ${eth} ${sex} ${b.label}`).toBeLessThan(0.01);
          });
        }
      }
      for (const sex of ["M", "F"]) {
        for (let a = 0; a <= 90; a++) {
          let s = 0;
          for (const eth of base.ethnicGroups) s += area[eth][sex][a];
          expect(Math.abs(s - ts.get(code)[sex][a]), `${code} ${sex} ${a}`).toBeLessThan(5);
        }
      }
    }
  }, 180_000);
});
