import { describe, expect, it } from "vitest";
import oos from "../src/data/live/out-of-sample-validation.json";
import projections from "../src/data/live/ethnic-projections.json";

/**
 * Locks the model's calibration to the evidence that selected it.
 *
 * The guardrails were chosen on an out-of-sample test that fits cohort change
 * ratios on Census 2001 to 2011 and forecasts 2021, scored against the actual
 * Census 2021. If someone changes the settings without re-running that test, or
 * re-runs it and the numbers move materially, these fail.
 */
describe("out-of-sample calibration", () => {
  const wb = (oos as any).summary.white_british;

  it("scores against a target the fitting window never saw", () => {
    expect((oos as any).design).toMatch(/2001 to Census 2011, projected one decade to 2021/);
    expect((oos as any).areasScored).toBeGreaterThan(250);
  });

  it("is close to unbiased on the White British share", () => {
    // Bias matters more than MAE because it compounds across projection steps.
    // Selected at +0.03pp; anything beyond half a point in either direction means
    // the calibration has drifted and needs reselecting.
    expect(Math.abs(wb.bias)).toBeLessThan(0.5);
  });

  it("beats the settings it replaced", () => {
    // Previous guardrails (ceiling 5.0, freeze at a 2011 base of five or fewer)
    // scored MAE 2.82pp with bias -2.13pp on this same test.
    expect(wb.mae).toBeLessThan(2.0);
  });

  it("beats NEWETHPOP, which is the only comparable out-of-sample benchmark", () => {
    // NEWETHPOP projected 2021 from a 2011 base and scored 3.95pp.
    expect(wb.mae).toBeLessThan(3.95);
  });

  it("does not buy the headline group's accuracy at another group's expense", () => {
    const total = Object.values((oos as any).summary)
      .filter(Boolean)
      .reduce((t: number, s: any) => t + s.mae, 0);
    // 5.53 at selection, against 8.14 for the settings replaced.
    expect(total).toBeLessThan(7);
  });
});

describe("published projections carry the calibrated model", () => {
  const meta = projections as any;

  it("records the model version the calibration belongs to", () => {
    expect(meta.modelVersion).toBe("8.0-out-of-sample-calibrated");
  });

  it("no longer advertises the withdrawn backcast comparison", () => {
    expect(meta.methodology).not.toMatch(/beats NEWETHPOP/i);
    expect(meta.methodology).toMatch(/out-of-sample/i);
  });
});
