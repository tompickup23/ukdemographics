import { describe, expect, it } from "vitest";
import rawProjections from "../src/data/live/ethnic-projections.json";
import { summariseModelSpread } from "../src/lib/model-spread";

const areas = (rawProjections as any).areas as Record<string, any>;

describe("modelSpread2051", () => {
  it("stores a spread equal to the gap between its two stored figures", () => {
    // spreadPp is rendered on place pages beside the two figures it is the gap
    // between, so it must be recomputable from them. run_projection_v2.mjs and
    // reconcile_derived.mjs both use this rule.
    const off: string[] = [];
    for (const [code, a] of Object.entries(areas)) {
      const m = a.modelSpread2051;
      expect(typeof m?.hamiltonPerry, code).toBe("number");
      expect(typeof m?.cohortComponent, code).toBe("number");
      const expected = Math.round(Math.abs(m.cohortComponent - m.hamiltonPerry) * 10) / 10;
      if (m.spreadPp !== expected) off.push(`${a.areaName}: ${m.spreadPp} stored, ${expected} from its figures`);
    }
    expect(off).toEqual([]);
  });

  it("keeps the scenario range's central figure equal to the cohort-component figure", () => {
    // Both are the half-convergence, principal-migration run of the same model.
    for (const [code, a] of Object.entries(areas)) {
      expect(a.scenarioRange2051?.central, code).toBe(a.modelSpread2051?.cohortComponent);
    }
  });
});

describe("summariseModelSpread", () => {
  const fixture = {
    A: { projections_detail: {}, modelSpread2051: { hamiltonPerry: 50, cohortComponent: 55, spreadPp: 5 }, scenarioRange2051: { central: 55 } },
    B: { projections_detail: {}, modelSpread2051: { hamiltonPerry: 60, cohortComponent: 39, spreadPp: 21 }, scenarioRange2051: { central: 39 } },
    C: { projections_detail: {}, modelSpread2051: { hamiltonPerry: 70, cohortComponent: 72, spreadPp: 2 }, scenarioRange2051: { central: 70.3 } },
    // Not covered by the current model: left out of the comparison figures,
    // counted in the central check like the validator does.
    D: { modelSpread2051: { hamiltonPerry: 80, cohortComponent: 50, spreadPp: 30 }, scenarioRange2051: { central: 50 } },
  };

  it("summarises only the areas the current model covers", () => {
    const s = summariseModelSpread(fixture);
    expect(s.compared).toBe(3);
    expect(s.medianPp).toBe(5);
    expect(s.maxPp).toBe(21);
    expect(s.above).toBe(1);
    expect(s.ccHigher).toBe(2);
    expect(s.ccLower).toBe(1);
    expect(s.centralMismatch).toBe(3);
  });

  it("takes the mean of the middle two for an even count", () => {
    const { D, ...rest } = fixture;
    const s = summariseModelSpread({ ...rest, E: { ...fixture.A, modelSpread2051: { hamiltonPerry: 1, cohortComponent: 4, spreadPp: 3 } } });
    expect(s.medianPp).toBe(4);
  });

  it("agrees with the published file", () => {
    const s = summariseModelSpread(areas);
    const covered = Object.values(areas).filter((a) => a.projections_detail);
    expect(s.compared).toBe(covered.length);
    expect(s.ccHigher + s.ccLower).toBeLessThanOrEqual(s.compared);
    expect(s.maxPp).toBe(Math.max(...covered.map((a) => a.modelSpread2051.spreadPp)));
  });
});
