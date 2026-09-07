import { describe, expect, it } from "vitest";

import rawEnglish from "../src/data/live/census-english-proficiency.json";
import rawProjections from "../src/data/live/ethnic-projections.json";
import rawSuccessors from "../src/data/lookups/lad22-to-lad23.json";

interface EnglishArea {
  areaName: string;
  total: number;
  mainEnglish?: number;
  mainNotEnglishVeryWell?: number;
  mainNotEnglishWell?: number;
  mainNotEnglishNotWell?: number;
  mainNotEnglishCannot?: number;
  cannotSpeakWellPct?: number;
  nonEnglishPct?: number;
  derivedFrom?: { code: string; name: string }[];
  sourceNote?: string;
}

const english = (rawEnglish as unknown as { areas: Record<string, EnglishArea> })
  .areas;
const projections = (
  rawProjections as unknown as { areas: Record<string, { areaName: string }> }
).areas;
const successors = (
  rawSuccessors as unknown as {
    successors: Record<
      string,
      { successorName: string; predecessors: { code: string; name: string }[] }
    >;
  }
).successors;

const COUNT_FIELDS = [
  "mainNotEnglishVeryWell",
  "mainNotEnglishWell",
  "mainNotEnglishNotWell",
  "mainNotEnglishCannot",
] as const;

describe("Census 2021 English proficiency coverage", () => {
  it("carries an entry for every public place page", () => {
    const missing = Object.keys(projections).filter((code) => !english[code]);
    expect(missing).toEqual([]);
  });

  it("covers the 318 areas the site publishes", () => {
    expect(Object.keys(projections).length).toBe(318);
  });
});

describe("Census 2021 English proficiency arithmetic", () => {
  it("sums the main-English count and the four not-English counts to the total", () => {
    const wrong: string[] = [];
    for (const [code, a] of Object.entries(english)) {
      const parts =
        (a.mainEnglish ?? 0) +
        COUNT_FIELDS.reduce((sum, f) => sum + (a[f] ?? 0), 0);
      if (parts !== a.total) {
        wrong.push(`${code} ${a.areaName}: parts ${parts}, total ${a.total}`);
      }
    }
    expect(wrong).toEqual([]);
  });

  it("holds nonEnglishPct at 100 minus the main-English share", () => {
    const wrong: string[] = [];
    for (const [code, a] of Object.entries(english)) {
      const expected = 100 - ((a.mainEnglish ?? 0) / a.total) * 100;
      if (Math.abs((a.nonEnglishPct ?? 0) - expected) > 0.05) {
        wrong.push(
          `${code} ${a.areaName}: stored ${a.nonEnglishPct}, computed ${expected.toFixed(4)}`,
        );
      }
    }
    expect(wrong).toEqual([]);
  });

  it("holds cannotSpeakWellPct at the cannot-speak-well plus cannot-speak share", () => {
    const wrong: string[] = [];
    for (const [code, a] of Object.entries(english)) {
      const expected =
        (((a.mainNotEnglishNotWell ?? 0) + (a.mainNotEnglishCannot ?? 0)) /
          a.total) *
        100;
      if (Math.abs((a.cannotSpeakWellPct ?? 0) - expected) > 0.05) {
        wrong.push(
          `${code} ${a.areaName}: stored ${a.cannotSpeakWellPct}, computed ${expected.toFixed(4)}`,
        );
      }
    }
    expect(wrong).toEqual([]);
  });
});

describe("April 2023 unitary authorities derived from their 2021 districts", () => {
  const derived = Object.entries(english).filter(([, a]) => a.derivedFrom);

  it("derives exactly the four authorities created in April 2023", () => {
    expect(derived.map(([code]) => code).sort()).toEqual([
      "E06000063",
      "E06000064",
      "E06000065",
      "E06000066",
    ]);
  });

  it("names the districts the ONS lookup names", () => {
    for (const [code, a] of derived) {
      expect(a.derivedFrom!.map((d) => d.code).sort()).toEqual(
        successors[code].predecessors.map((p) => p.code).sort(),
      );
    }
  });

  it("equals the sum of the named districts on every count", () => {
    for (const [code, a] of derived) {
      for (const field of ["total", "mainEnglish", ...COUNT_FIELDS] as const) {
        const sum = a.derivedFrom!.reduce(
          (acc, d) => acc + ((english[d.code] as EnglishArea)[field] ?? 0),
          0,
        );
        expect(`${code}.${field}=${a[field] ?? 0}`).toBe(
          `${code}.${field}=${sum}`,
        );
      }
    }
  });

  it("carries a source note naming the districts", () => {
    for (const [, a] of derived) {
      for (const d of a.derivedFrom!) {
        expect(a.sourceNote).toContain(d.name);
      }
    }
  });
});
