/**
 * The Census 2011 and 2021 group fields in ethnic-projections.json must agree
 * with themselves and with the Census.
 *
 * Until October 2026 the transform counted the two Mixed White and Black
 * categories as Black, so the counts disagreed with the shares beside them
 * (Birmingham 2021: Black 10.98% in groups, 13.59% implied by the counts) and
 * every 2011 baseline total was 0. Nothing here pins a figure from one
 * release: each check compares one field with another, or the file with a
 * second Census table.
 */
import { describe, expect, it } from "vitest";
import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import rawProjections from "../src/data/live/ethnic-projections.json";
import rawHealth from "../src/data/live/census-health-ethnic.json";
import rawCob from "../src/data/live/country-of-birth-change-2011-2021.json";
import {
  GROUP_KEYS,
  classifyCensusEthnicLabel,
  mapEthnicGroup
} from "../scripts/lib/census-ethnic-groups.mjs";

type Groups = Record<string, number>;
interface CensusPoint {
  year: number;
  total_population: number;
  groups: Groups;
  groups_absolute?: Groups;
}
interface Area {
  areaName: string;
  baseline: CensusPoint;
  current: CensusPoint;
  projections_detail?: unknown;
}

const areas = (rawProjections as unknown as { areas: Record<string, Area> }).areas;
const health = rawHealth as unknown as {
  areas: Record<string, { byEthnic: Record<string, { Total: number }> }>;
};
const cob = rawCob as unknown as { areas: Record<string, { population2011?: number }> };

/** Share agreement allowed between counts and the rounded shares beside them, in points. */
const SHARE_TOLERANCE_PP = 0.05;

/**
 * Modelled areas carry 2021 shares written by the forward model from its own
 * base, the ONS custom dataset, whose cell perturbation differs slightly from
 * TS021, while their counts are TS021. One area sits just past 0.05pp: Gedling
 * White British, 85.54% in the model base against 85.59% in TS021 (0.051pp).
 * The defect this guards against moved shares by 0.26pp or more.
 */
const MODEL_BASE_TOLERANCE_PP = 0.06;

const MANIFEST_PATH = path.resolve("data/raw/manifests/census_ethnic_groups.json");

function points(): Array<[string, string, CensusPoint]> {
  const out: Array<[string, string, CensusPoint]> = [];
  for (const [code, area] of Object.entries(areas)) {
    out.push([code, "baseline", area.baseline]);
    out.push([code, "current", area.current]);
  }
  return out;
}

function nationalShares(field: "baseline" | "current", year: number) {
  const sums: Record<string, number> = { total: 0 };
  for (const g of GROUP_KEYS) sums[g] = 0;
  for (const area of Object.values(areas)) {
    const p = area[field];
    if (p.year !== year || !p.groups_absolute) continue;
    sums.total += p.total_population;
    for (const g of GROUP_KEYS) sums[g] += p.groups_absolute[g] ?? 0;
  }
  return sums;
}

function readManifest(): any | null {
  if (!existsSync(MANIFEST_PATH)) return null;
  return JSON.parse(readFileSync(MANIFEST_PATH, "utf8"));
}

describe("Census label mapping", () => {
  it("files the Mixed White and Black categories under Mixed in both Censuses", () => {
    for (const label of [
      "Mixed or Multiple ethnic groups: White and Black Caribbean",
      "Mixed or Multiple ethnic groups: White and Black African",
      "Mixed/multiple ethnic groups: White and Black Caribbean",
      "Mixed/multiple ethnic groups: White and Black African"
    ]) {
      expect(mapEthnicGroup(label), label).toBe("mixed");
    }
  });

  it("files the Black categories under Black", () => {
    for (const label of [
      "Black, Black British, Black Welsh, Caribbean or African: African",
      "Black, Black British, Black Welsh, Caribbean or African: Caribbean",
      "Black/African/Caribbean/Black British: African",
      "Black/African/Caribbean/Black British: Other Black"
    ]) {
      expect(mapEthnicGroup(label), label).toBe("black");
    }
  });

  it("recognises the all-persons row in both Censuses", () => {
    expect(mapEthnicGroup("Total: All usual residents")).toBe("total");
    expect(mapEthnicGroup("All usual residents")).toBe("total");
  });

  it("skips the 2021 subtotal rows rather than counting them twice", () => {
    expect(classifyCensusEthnicLabel("Mixed or Multiple ethnic groups").kind).toBe("parent");
    expect(classifyCensusEthnicLabel("White").kind).toBe("parent");
  });

  it("separates White British from the other White categories", () => {
    expect(mapEthnicGroup("White: English, Welsh, Scottish, Northern Irish or British")).toBe("white_british");
    expect(mapEthnicGroup("White: English/Welsh/Scottish/Northern Irish/British")).toBe("white_british");
    expect(mapEthnicGroup("White: Irish")).toBe("white_other");
    expect(mapEthnicGroup("White: Roma")).toBe("white_other");
  });
});

describe("Census fields agree with themselves", () => {
  it("counts over the total agree with the shares for every area and year", () => {
    const failures: string[] = [];
    for (const [code, field, p] of points()) {
      if (!p.groups_absolute || !(p.total_population > 0)) continue;
      const tolerance = field === "current" && areas[code].projections_detail ? MODEL_BASE_TOLERANCE_PP : SHARE_TOLERANCE_PP;
      for (const g of GROUP_KEYS) {
        const fromCounts = ((p.groups_absolute[g] ?? 0) / p.total_population) * 100;
        const diff = fromCounts - (p.groups[g] ?? 0);
        if (Math.abs(diff) > tolerance) {
          failures.push(
            `${code} ${areas[code].areaName} ${field} ${p.year} ${g}: shares ${p.groups[g]}, counts ${fromCounts.toFixed(2)} (${diff > 0 ? "+" : ""}${diff.toFixed(2)}pp)`
          );
        }
      }
    }
    expect(failures.length, `${failures.length} disagreements, first: ${failures.slice(0, 8).join("; ")}`).toBe(0);
  });

  it("holds a positive total for every 2011 baseline", () => {
    const zero = Object.entries(areas)
      .filter(([, a]) => a.baseline.year === 2011 && !(a.baseline.total_population > 0))
      .map(([code, a]) => `${code} ${a.areaName}`);
    expect(zero.length, `${zero.length} 2011 baselines with no total, first: ${zero.slice(0, 5).join("; ")}`).toBe(0);
  });

  it("has the six groups summing to the total", () => {
    const failures: string[] = [];
    for (const [code, field, p] of points()) {
      if (!p.groups_absolute) continue;
      const sum = GROUP_KEYS.reduce((s, g) => s + (p.groups_absolute![g] ?? 0), 0);
      if (sum !== p.total_population) failures.push(`${code} ${field} ${p.year}: groups ${sum}, total ${p.total_population}`);
    }
    expect(failures.length, `${failures.length} mismatches, first: ${failures.slice(0, 8).join("; ")}`).toBe(0);
  });
});

describe("Census fields agree with other Census tables", () => {
  it("2011 totals match the KS204EW country-of-birth totals for the same areas", () => {
    const failures: string[] = [];
    for (const [code, a] of Object.entries(areas)) {
      const ks204 = cob.areas[code]?.population2011;
      if (a.baseline.year !== 2011 || !ks204) continue;
      if (a.baseline.total_population !== ks204) failures.push(`${code} ${a.areaName}: ${a.baseline.total_population} against ${ks204}`);
    }
    expect(failures.length, failures.slice(0, 8).join("; ")).toBe(0);
  });

  it("national 2021 shares match Census 2021 RM043 for England and Wales", () => {
    // RM043 (general health by ethnic group) is a different Census table with
    // its own cell perturbation, on the 2022 district geography. Summed over
    // every England and Wales authority it covers the same population as the
    // 318 areas here, so the national shares must agree closely.
    const rm: Record<string, number> = { total: 0, white: 0, asian: 0, black: 0, mixed: 0, other: 0 };
    for (const [code, a] of Object.entries(health.areas)) {
      if (!/^(E0[6-9]|W06)/.test(code)) continue;
      const b = a.byEthnic;
      rm.total += b["Total"].Total;
      rm.white += b["White"].Total;
      rm.asian += b["Asian, Asian British or Asian Welsh"].Total;
      rm.black += b["Black, Black British, Black Welsh, Caribbean or African"].Total;
      rm.mixed += b["Mixed or Multiple ethnic groups"].Total;
      rm.other += b["Other ethnic group"].Total;
    }
    const file = nationalShares("current", 2021);
    const fileShare = {
      white: ((file.white_british + file.white_other) / file.total) * 100,
      asian: (file.asian / file.total) * 100,
      black: (file.black / file.total) * 100,
      mixed: (file.mixed / file.total) * 100,
      other: (file.other / file.total) * 100
    };
    for (const g of ["white", "asian", "black", "mixed", "other"] as const) {
      const rmShare = (rm[g] / rm.total) * 100;
      expect(Math.abs(fileShare[g] - rmShare), `${g}: file ${fileShare[g].toFixed(2)}%, RM043 ${rmShare.toFixed(2)}%`).toBeLessThanOrEqual(SHARE_TOLERANCE_PP);
    }
  });

  it("national 2021 and 2011 counts match the TS021 and KS201EW totals for the same codes", () => {
    const manifest = readManifest();
    expect(manifest, `missing ${path.relative(process.cwd(), MANIFEST_PATH)}`).not.toBeNull();
    for (const [field, year] of [["current", 2021], ["baseline", 2011]] as const) {
      const file = nationalShares(field, year);
      const census = manifest.national[String(year)];
      expect(file.total, `${year} total`).toBe(census.total);
      for (const g of GROUP_KEYS) expect(file[g], `${year} ${g}`).toBe(census.groups[g]);
    }
  });

  it("the manifest matches the raw Census files when they are on disk", () => {
    const manifest = readManifest();
    if (!manifest) return;
    for (const f of manifest.files as Array<{ fileName: string; sha256: string }>) {
      const local = path.resolve("data/raw/census_ethnicity", f.fileName);
      if (!existsSync(local)) continue;
      const sha = createHash("sha256").update(readFileSync(local)).digest("hex");
      expect(sha, f.fileName).toBe(f.sha256);
    }
  });
});
