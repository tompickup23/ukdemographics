/**
 * The place page's "Westminster constituencies" list. Until October 2026 its note
 * said the list was sorted by the share of the authority's postcodes each
 * constituency covers. The share in pcon-dataset.json is the other way round: the
 * share of a constituency's own postcodes that fall in each authority. These
 * checks recompute that from the file and pin the wording, not a figure.
 */
import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import rawPcon from "../src/data/live/pcon-dataset.json";
import { getPconsForLa } from "../src/lib/pcon-data";

const pcons = Object.values((rawPcon as any).pcons) as any[];

describe("postcodeShare direction", () => {
  it("sums to 1 across each constituency's authorities", () => {
    for (const p of pcons) {
      const sum = p.constituentLas.reduce((s: number, l: any) => s + l.postcodeShare, 0);
      expect(sum, p.name).toBeCloseTo(1, 2);
    }
  });

  it("does not sum to 1 across an authority's constituencies everywhere", () => {
    const byLa = new Map<string, number>();
    for (const p of pcons) {
      for (const l of p.constituentLas) byLa.set(l.ladCode, (byLa.get(l.ladCode) ?? 0) + l.postcodeShare);
    }
    const off = [...byLa.values()].filter((s) => Math.abs(s - 1) > 0.01);
    expect(off.length).toBeGreaterThan(0);
  });

  it("getPconsForLa sorts by the constituency's own share in the authority, largest first", () => {
    const ladCodes = new Set(pcons.flatMap((p) => p.constituentLas.map((l: any) => l.ladCode as string)));
    for (const lad of ladCodes) {
      const shares = getPconsForLa(lad).map((p: any) => p.constituentLas.find((l: any) => l.ladCode === lad).postcodeShare);
      expect(shares, lad).toEqual([...shares].sort((a, b) => b - a));
    }
  });
});

describe("place page wording", () => {
  const page = fs.readFileSync(path.resolve(__dirname, "../src/pages/places/[slug].astro"), "utf8");
  it("describes the share as the constituency's postcodes, not the authority's", () => {
    expect(page).not.toMatch(/share of LA postcodes/i);
    expect(page).toMatch(/share of each constituency's postcodes that fall in \{area\.areaName\}/);
  });
});
