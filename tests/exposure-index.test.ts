import { describe, expect, it } from "vitest";

import rawEnglish from "../src/data/live/census-english-proficiency.json";
import rawIndex from "../src/data/live/fiscal-resilience.json";
import rawProjections from "../src/data/live/ethnic-projections.json";

/**
 * The exposure index published on /pressure/ is a sum of five capped
 * components. It shipped for months with one of the five reading a field no
 * script writes, so it scored 0 for every area and the published total was
 * built from four components while the page described five. These tests pin
 * the shape so that failure cannot recur silently: every component present and
 * numeric, every component inside its cap, the total consistent with the
 * components, the band consistent with the cutoffs, and the area set equal to
 * the areas the site publishes.
 */

interface IndexArea {
  areaName: string;
  serviceDemandPressureScore: number;
  category: string;
  wbiChange2021to2041: number;
  asylumRate: number;
  nonEnglishPct: number;
  components: Record<string, number>;
}

const index = (rawIndex as unknown as { areas: Record<string, IndexArea> })
  .areas;
const english = (
  rawEnglish as unknown as {
    areas: Record<string, { nonEnglishPct?: number }>;
  }
).areas;
const projections = (
  rawProjections as unknown as { areas: Record<string, unknown> }
).areas;

const COMPONENTS = [
  "ethnicChangeContribution",
  "asylumConcentration",
  "schoolPressure",
  "languagePressure",
  "housingPressure",
] as const;

const entries = Object.entries(index);

/** The band the generator's cutoffs give a score. */
function bandFor(score: number): string {
  if (score >= 70) return "High Pressure";
  if (score >= 45) return "Moderate Pressure";
  if (score >= 25) return "Low Pressure";
  return "Stable";
}

describe("exposure index coverage", () => {
  it("covers exactly the areas the site publishes", () => {
    expect(Object.keys(index).sort()).toEqual(Object.keys(projections).sort());
  });

  it("covers the 318 areas the projection file carries", () => {
    expect(entries.length).toBe(318);
  });
});

describe("exposure index components", () => {
  it("carries all five components, numeric, for every area", () => {
    const wrong: string[] = [];
    for (const [code, a] of entries) {
      for (const key of COMPONENTS) {
        const v = a.components?.[key];
        if (typeof v !== "number" || !Number.isFinite(v)) {
          wrong.push(`${code} ${a.areaName}: ${key} = ${JSON.stringify(v)}`);
        }
      }
    }
    expect(wrong).toEqual([]);
  });

  it("holds every component inside its 0 to 20 cap", () => {
    const wrong: string[] = [];
    for (const [code, a] of entries) {
      for (const key of COMPONENTS) {
        const v = a.components[key];
        if (v < 0 || v > 20) {
          wrong.push(`${code} ${a.areaName}: ${key} = ${v}`);
        }
      }
    }
    expect(wrong).toEqual([]);
  });

  it("scores the language component on the observed Census 2021 share, not zero", () => {
    // nonEnglishPct times 1.0, capped at 20: 20 points at a 20% share. The
    // stored input is unrounded, so this is an exact match, and it is checked
    // against the TS029 file rather than against the index's own copy.
    const wrong: string[] = [];
    for (const [code, a] of entries) {
      const source = english[code]?.nonEnglishPct;
      if (typeof source !== "number") {
        wrong.push(`${code} ${a.areaName}: no TS029 row`);
        continue;
      }
      if (a.nonEnglishPct !== source) {
        wrong.push(
          `${code} ${a.areaName}: stored input ${a.nonEnglishPct}, TS029 ${source}`,
        );
        continue;
      }
      const expected = Math.round(Math.min(20, source));
      if (a.components.languagePressure !== expected) {
        wrong.push(
          `${code} ${a.areaName}: scored ${a.components.languagePressure}, expected ${expected}`,
        );
      }
    }
    expect(wrong).toEqual([]);
  });

  it("scores no area zero on the language component", () => {
    const zero = entries.filter(([, a]) => a.components.languagePressure === 0);
    expect(zero.map(([code]) => code)).toEqual([]);
  });

  it("scores the asylum component at the published rate times 0.5", () => {
    const wrong: string[] = [];
    for (const [code, a] of entries) {
      const expected = Math.round(Math.min(20, a.asylumRate * 0.5));
      if (a.components.asylumConcentration !== expected) {
        wrong.push(
          `${code} ${a.areaName}: scored ${a.components.asylumConcentration}, expected ${expected} from rate ${a.asylumRate}`,
        );
      }
    }
    expect(wrong).toEqual([]);
  });

  it("scores the ethnic change component at the absolute change times 1.5", () => {
    // wbiChange2021to2041 is published to one decimal place while the score is
    // computed on the unrounded value, so allow the one point that rounding of
    // the published input can move.
    const wrong: string[] = [];
    for (const [code, a] of entries) {
      const expected = Math.round(
        Math.min(20, Math.abs(a.wbiChange2021to2041) * 1.5),
      );
      if (Math.abs(a.components.ethnicChangeContribution - expected) > 1) {
        wrong.push(
          `${code} ${a.areaName}: scored ${a.components.ethnicChangeContribution}, expected about ${expected} from change ${a.wbiChange2021to2041}`,
        );
      }
    }
    expect(wrong).toEqual([]);
  });
});

describe("exposure index total and band", () => {
  it("holds the total to the sum of the five capped components", () => {
    // Each component is rounded before it is published and the total is
    // rounded once after summing the unrounded values, so the two can differ
    // by the rounding alone. Anything beyond that is a component missing from
    // the total or an input counted twice.
    const wrong: string[] = [];
    for (const [code, a] of entries) {
      const sum = COMPONENTS.reduce((acc, k) => acc + a.components[k], 0);
      if (Math.abs(sum - a.serviceDemandPressureScore) > 3) {
        wrong.push(
          `${code} ${a.areaName}: components sum ${sum}, total ${a.serviceDemandPressureScore}`,
        );
      }
    }
    expect(wrong).toEqual([]);
  });

  it("keeps the total a whole number from 0 to 100", () => {
    const wrong: string[] = [];
    for (const [code, a] of entries) {
      const v = a.serviceDemandPressureScore;
      if (!Number.isInteger(v) || v < 0 || v > 100) {
        wrong.push(`${code} ${a.areaName}: ${v}`);
      }
    }
    expect(wrong).toEqual([]);
  });

  it("matches every band to the published cutoffs", () => {
    const wrong: string[] = [];
    for (const [code, a] of entries) {
      const expected = bandFor(a.serviceDemandPressureScore);
      if (a.category !== expected) {
        wrong.push(
          `${code} ${a.areaName}: score ${a.serviceDemandPressureScore} banded ${a.category}, cutoffs give ${expected}`,
        );
      }
    }
    expect(wrong).toEqual([]);
  });
});
