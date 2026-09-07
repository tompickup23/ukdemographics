import { describe, expect, it } from "vitest";
import {
  getAreasBelowWhiteBritishMajority,
  getSignificantDemographicShifts
} from "../src/lib/ethnic-projections";
import { plausibleThrough } from "../src/lib/projection-plausibility";
import rawProjections from "../src/data/live/ethnic-projections.json";

const areas = (rawProjections as any).areas as Record<string, any>;
const wb = (a: any, year: number) => a?.projections?.[String(year)]?.white_british;
const wbNow = (a: any) => a?.current?.groups?.white_british;

const publishable = (a: any, year: number) => {
  const through = plausibleThrough(a);
  return wb(a, year) != null && through != null && through >= year;
};

describe("areas below a White British majority", () => {
  it("counts every area under 50% in the year, not only the ones that cross into it", () => {
    // The bug this guards: the homepage and the national page counted threshold
    // crossings under a label promising a stock. An area already under 50% at the
    // 2021 Census records no crossing, so Birmingham, Leicester, Luton and Slough
    // among others were missing from a published count of areas under 50%.
    const below = getAreasBelowWhiteBritishMajority(2051);
    const crossings = getSignificantDemographicShifts(2051);
    expect(below.count).toBeGreaterThan(crossings.length);
  });

  it("does not count a year the area's own page withholds", () => {
    // Enfield's 2051 puts a residual Census group past a quarter of the population
    // at several times its 2021 share, so Enfield's place page stops at 2041. A
    // headline count that includes that year is publishing under a second rule.
    const withheld = Object.values(areas).filter(
      (a) => wb(a, 2051) != null && !publishable(a, 2051) && wb(a, 2051) < 50);
    expect(withheld.length).toBeGreaterThan(0);

    const counted = new Set(getAreasBelowWhiteBritishMajority(2051).areaCodes);
    for (const [code, a] of Object.entries(areas)) {
      if (wb(a, 2051) != null && !publishable(a, 2051)) expect(counted.has(code)).toBe(false);
    }
  });

  it("agrees with a direct scan of the publishable projections", () => {
    for (const year of [2031, 2041, 2051, 2061]) {
      const direct = Object.values(areas).filter((a) => publishable(a, year) && wb(a, year) < 50);
      const covered = Object.values(areas).filter((a) => publishable(a, year));
      const result = getAreasBelowWhiteBritishMajority(year);
      expect(result.count).toBe(direct.length);
      expect(result.covered).toBe(covered.length);
    }
  });

  it("agrees with the published finding, which has said 86 since August", () => {
    const y2051 = getAreasBelowWhiteBritishMajority(2051);
    const alreadyBelow = y2051.areaCodes.filter((c) => wbNow(areas[c]) < 50).length;
    expect(y2051.count).toBe(86);
    // The finding's own split: 59 with a White British majority today.
    expect(y2051.count - alreadyBelow).toBe(59);
  });

  it("keeps the homepage crossing table off withheld years too", () => {
    // The crossing table interpolates its own year from the projection series and
    // does not consult the plausibility rule. It happens to be clean today, but
    // only because the 60% base floor excludes every diverged area by coincidence
    // rather than by design. If a future model run changes that, this fails before
    // the site prints a crossing year derived from a year it refuses to show.
    const MIN_BASE = 60;
    const YEARS = [2031, 2041, 2051, 2061];
    for (const a of Object.values(areas)) {
      const now = wbNow(a);
      if (now == null || now < MIN_BASE) continue;
      const pts: Array<[number, number]> = [[2021, now]];
      for (const y of YEARS) if (wb(a, y) != null) pts.push([y, wb(a, y)]);
      const through = plausibleThrough(a);
      for (let i = 0; i < pts.length - 1; i++) {
        if (pts[i][1] >= 50 && pts[i + 1][1] < 50) {
          expect(through).not.toBeNull();
          expect(through).toBeGreaterThanOrEqual(pts[i + 1][0]);
          break;
        }
      }
    }
  });

  it("reports coverage below the full area count, so a caller cannot imply otherwise", () => {
    const y2051 = getAreasBelowWhiteBritishMajority(2051);
    const y2061 = getAreasBelowWhiteBritishMajority(2061);
    expect(y2051.covered).toBeLessThan(Object.keys(areas).length);
    expect(y2061.covered).toBeLessThan(y2051.covered);
  });
});

describe("national White British share", () => {
  // Two bugs this guards. 2061 summed a numerator over the areas the model reaches
  // and divided it by the population of all 318, counting the rest as areas with no
  // White British in them: it published 39.1% where its own areas give 48.8%. And
  // both projected years swallowed area-years the place pages withhold.
  const weighted = (year: number | "now") => {
    let num = 0;
    let den = 0;
    for (const a of Object.values(areas)) {
      const pop = a?.current?.total_population ?? 0;
      const share = year === "now" ? wbNow(a) : (publishable(a, year) ? wb(a, year) : null);
      if (!pop || share == null) continue;
      num += share * pop;
      den += pop;
    }
    return num / den;
  };

  it("divides each year by the population of the areas that year covers", () => {
    const fullPop = Object.values(areas).reduce(
      (s, a) => s + (a?.current?.total_population ?? 0), 0);
    const pop2061 = Object.values(areas).reduce(
      (s, a) => s + (publishable(a, 2061) ? (a?.current?.total_population ?? 0) : 0), 0);

    expect(pop2061).toBeLessThan(fullPop);
    expect(weighted(2061)).toBeCloseTo(48.8, 1);
    // What the broken denominator produced from that same numerator.
    expect(weighted(2061) * (pop2061 / fullPop)).toBeLessThan(44);
  });

  it("keeps a 2061 comparison on the geography 2061 covers", () => {
    let num51 = 0;
    let den = 0;
    for (const a of Object.values(areas)) {
      const pop = a?.current?.total_population ?? 0;
      if (!pop || !publishable(a, 2061) || !publishable(a, 2051)) continue;
      num51 += wb(a, 2051) * pop;
      den += pop;
    }
    expect(num51 / den).toBeCloseTo(56.0, 1);
    expect(weighted(2051)).toBeCloseTo(56.3, 1);
  });
});

describe("model provenance inside the national figures", () => {
  // The 49 areas the current pipeline cannot produce are exactly those with a 2051
  // projection and no 2061 one: v8 runs an area to 2061 or not at all. They are
  // 15.4% of the weighted population, so the published 2051 share is a blend of two
  // model runs rather than v8 output, and the methodology page says so in prose.
  // These assertions exist so that prose cannot quietly go stale, which is the
  // failure that left an 86 standing while the parts around it were recomputed.
  const legacy = Object.entries(areas).filter(
    ([, a]) => a?.projections?.["2051"] != null && a?.projections?.["2061"] == null);

  it("identifies the legacy set the methodology page describes", () => {
    expect(legacy.length).toBe(49);
  });

  it("holds the weighted share the methodology page quotes", () => {
    let legacyPop = 0, curNum = 0, curPop = 0, allPop = 0;
    for (const a of Object.values(areas)) {
      const pop = a?.current?.total_population ?? 0;
      if (!pop || !publishable(a, 2051)) continue;
      allPop += pop;
      if (a?.projections?.["2061"] == null) legacyPop += pop;
      else { curNum += wb(a, 2051) * pop; curPop += pop; }
    }
    expect((legacyPop / allPop) * 100).toBeCloseTo(15.4, 1);
    expect(curNum / curPop).toBeCloseTo(54.3, 1);
  });

  it("holds the count of legacy areas inside the 86", () => {
    const below = getAreasBelowWhiteBritishMajority(2051).areaCodes;
    const fromLegacy = below.filter((c) => areas[c]?.projections?.["2061"] == null);
    expect(fromLegacy.length).toBe(3);
  });
});
