import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  getAreasBelowWhiteBritishMajority,
  getSignificantDemographicShifts
} from "../src/lib/ethnic-projections";
import { nationalWhiteBritishAggregate } from "../src/lib/national-share";
import { plausibleThrough } from "../src/lib/projection-plausibility";
import { getPublicPlaceAreas } from "../src/lib/site";
import { PLACE_COUNT } from "../src/lib/coverage";
import rawProjections from "../src/data/live/ethnic-projections.json";

/**
 * No figure from one model run is typed into this file. Each check either
 * compares two derivations of the same quantity, or compares a number printed in
 * prose against the function the page prints from. A model re-run, a
 * regeneration of the legacy areas or a Census correction therefore passes here
 * if the prose moves with it, and fails, naming the sentence, if it does not.
 * Before 12 October 2026 this file asserted 86, 59, 48.8, 56.0, 56.3, 49, 15.4%,
 * 54.3 and 3 directly, so any re-run failed CI by design.
 */

const areas = (rawProjections as any).areas as Record<string, any>;
const wb = (a: any, year: number) => a?.projections?.[String(year)]?.white_british;
const wbNow = (a: any) => a?.current?.census_groups?.white_british;

const publishable = (a: any, year: number) => {
  const through = plausibleThrough(a);
  return wb(a, year) != null && through != null && through >= year;
};

// The homepage aggregates over the public place registry; so does every check here.
const publicCodes = getPublicPlaceAreas().map((a) => a.areaCode);
const national = () => nationalWhiteBritishAggregate(publicCodes);

const read = (p: string) => fs.readFileSync(path.resolve(p), "utf8");

/** Prose with markdown emphasis, tags and line wrapping taken out. Dated
 * correction notices (blockquotes) are left out: they record what was true on
 * their date and must not move with the data. */
const prose = (text: string) =>
  text
    .split("\n")
    .filter((line) => !line.trimStart().startsWith(">"))
    .join("\n")
    .replace(/<[^>]+>/g, "")
    .replace(/\*\*/g, "")
    .replace(/\s+/g, " ");

const WORDS: Record<string, number> = {
  one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10,
  eleven: 11, twelve: 12, thirteen: 13, fourteen: 14, fifteen: 15, sixteen: 16,
  seventeen: 17, eighteen: 18, nineteen: 19, twenty: 20
};
const num = (s: string) => (/^\d/.test(s) ? Number(s) : WORDS[s.toLowerCase()]);

/** Every capture of `re` in `text`, failing loudly if the sentence has gone. */
const grab = (text: string, re: RegExp, label: string): string[] => {
  const m = text.match(re);
  if (!m) throw new Error(`${label}: sentence not found (${re}). Update this test with the prose.`);
  return m.slice(1);
};

const pct1 = (n: number) => n.toFixed(1);

const below2051 = () => getAreasBelowWhiteBritishMajority(2051);
const majorityToday = (codes: string[]) => codes.filter((c) => wbNow(areas[c]) >= 50).length;
const legacyAmong = (codes: string[]) => codes.filter((c) => areas[c]?.projections?.["2061"] == null).length;

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
  // White British in them: it published 39.1% where its own areas gave 48.8%. And
  // both projected years swallowed area-years the place pages withhold.
  //
  // `direct` is a second, independent derivation of the share the homepage prints.
  // The library must agree with it on every year, and must not agree with the
  // all-areas denominator wherever coverage is partial.
  const popOf = (a: any) => a?.current?.total_population ?? 0;
  const direct = (year: number | "now", geography: (a: any) => boolean = () => true) => {
    let num = 0;
    let den = 0;
    for (const code of publicCodes) {
      const a = areas[code];
      const pop = popOf(a);
      if (!pop || !geography(a)) continue;
      const share = year === "now" ? wbNow(a) : (publishable(a, year) ? wb(a, year) : null);
      if (share == null) continue;
      num += share * pop;
      den += pop;
    }
    return num / den;
  };

  it("matches an independent scan in every year it prints", () => {
    const n = national();
    expect(n.wb2021).toBeCloseTo(direct("now"), 9);
    expect(n.wb2051).toBeCloseTo(direct(2051), 9);
    expect(n.wb2061).toBeCloseTo(direct(2061), 9);
  });

  it("divides each year by the population of the areas that year covers", () => {
    const n = national();
    const fullPop = publicCodes.reduce((s, c) => s + popOf(areas[c]), 0);
    const pop2061 = publicCodes.reduce(
      (s, c) => s + (publishable(areas[c], 2061) ? popOf(areas[c]) : 0), 0);
    expect(n.pop).toBe(fullPop);
    expect(pop2061).toBeLessThan(fullPop);
    // What the broken denominator produced: the 2061 numerator over every area's
    // population. The printed share must be the covered-population one, and the
    // two must sit visibly apart, or this check would not tell them apart.
    const covered = direct(2061);
    const broken = covered * (pop2061 / fullPop);
    expect(n.wb2061).toBeCloseTo(covered, 9);
    expect(Math.abs(n.wb2061 - broken)).toBeGreaterThan(1);
  });

  it("keeps a 2061 comparison on the geography 2061 covers", () => {
    const n = national();
    const on2061Geo = direct(2051, (a) => publishable(a, 2061));
    expect(n.wb2051on2061Geo).toBeCloseTo(on2061Geo, 9);
    expect(n.n2061).toBeLessThan(n.n2051);
  });

  it("is printed from the library, not recomputed on the page", () => {
    const page = read("src/pages/index.astro");
    expect(page).toContain("nationalWhiteBritishAggregate(");
    // A second hand-rolled accumulation is how the two pages drifted before.
    expect(page).not.toMatch(/white_british[^\n]*\*\s*pop/);
  });
});

describe("model provenance inside the national figures", () => {
  // The areas the current pipeline cannot produce are exactly those with a 2051
  // projection and no 2061 one: v8 runs an area to 2061 or not at all. The
  // methodology page and the finding state how many they are and what share of the
  // weighted population they carry, so that prose is checked below against the
  // same derivation the homepage prints from.
  it("runs an area to 2061 or not at all", () => {
    for (const [code, a] of Object.entries(areas)) {
      if (a?.projections?.["2061"] != null) expect(a?.projections?.["2051"], code).not.toBeUndefined();
    }
  });

  it("derives the legacy count from the data the way the definition says", () => {
    const legacy = Object.values(areas).filter(
      (a) => a?.projections?.["2051"] != null && a?.projections?.["2061"] == null);
    const withheldLegacy = legacy.filter((a) => !publishable(a, 2051)).length;
    expect(national().nLegacy).toBe(legacy.length - withheldLegacy);
    expect(national().nCurrent + national().nLegacy).toBe(national().n2051);
  });
});

describe("the prose quotes the figures the data gives", () => {
  const finding = read("src/content/findings/86-areas-minority-wbi-2051.md");
  const front = finding.split("---")[1];
  const body = prose(finding.split("---").slice(2).join("---"));
  const methodology = prose(read("src/pages/methodology.astro"));

  it("frontmatter: stat, headline and summary carry the count and its split", () => {
    const { count, areaCodes } = below2051();
    const today = majorityToday(areaCodes);
    const [stat] = grab(front, /stat_value: "(\d+)"/, "stat_value");
    const [headline] = grab(front, /headline: "(\d+) local authorities projected minority/, "headline");
    const [summary, split] = grab(
      front, /summary: "(\d+) English local authorities[^"]*?(\d+) of those have a White British majority today/,
      "summary");
    expect(Number(stat), "stat_value").toBe(count);
    expect(Number(headline), "headline").toBe(count);
    expect(Number(summary), "summary count").toBe(count);
    expect(Number(split), "summary split").toBe(today);
  });

  it("body: counts by year, the split, and the areas already below", () => {
    const { count, areaCodes } = below2051();
    const [by2041, by2051] = grab(body, /(\d+) by 2041\. (\d+) by 2051\./, "counts by year");
    expect(Number(by2041), "2041").toBe(getAreasBelowWhiteBritishMajority(2041).count);
    expect(Number(by2051), "2051").toBe(count);

    const [ofThe, have] = grab(body, /Of the (\d+), (\d+) have a White British majority today/, "split");
    expect(Number(ofThe)).toBe(count);
    expect(Number(have)).toBe(majorityToday(areaCodes));

    const [already] = grab(body, /Already below 50% in 2021 \((\d+) areas\)/, "already below");
    expect(Number(already)).toBe(publicCodes.filter((c) => wbNow(areas[c]) < 50).length);

    const withheld = publicCodes.filter(
      (c) => wb(areas[c], 2051) != null && !publishable(areas[c], 2051)).length;
    const [cut] = grab(body, /cuts that to (\w+) areas whose 2051 is still withheld/, "withheld");
    expect(num(cut), "withheld at 2051").toBe(withheld);
  });

  it("body: the national paragraph matches the homepage's derivation", () => {
    const n = national();
    const [wb21, all] = grab(body, /gives the same (\d+\.\d)% across all (\d+) areas/, "2021 share");
    expect(wb21).toBe(pct1(n.wb2021));
    expect(Number(all)).toBe(PLACE_COUNT);

    const [wb51, n51] = grab(body, /(\d+\.\d)% by 2051 across the (\d+) areas where 2051 is publishable/, "2051 share");
    expect(wb51).toBe(pct1(n.wb2051));
    expect(Number(n51)).toBe(n.n2051);

    const [legacy, legacyPct] = grab(
      body, /(\d+) of those areas carry projections from an earlier run[^.]*?, (\d+\.\d)% of the weighted population/,
      "legacy share");
    expect(Number(legacy)).toBe(n.nLegacy);
    expect(legacyPct).toBe(pct1(n.legacyPopPct));

    const [nCur, wbCur] = grab(body, /across the (\d+) areas the current model produces 2051 is (\d+\.\d)%/, "current model");
    expect(Number(nCur)).toBe(n.nCurrent);
    expect(wbCur).toBe(pct1(n.wb2051Current));
  });

  it("methodology: the coverage paragraph matches the data", () => {
    const n = national();
    const reaches2061 = Object.values(areas).filter((a) => a?.projections?.["2061"] != null).length;
    const [projects, of] = grab(methodology, /projects (\d+) of the (\d+):/, "model coverage");
    expect(Number(projects)).toBe(reaches2061);
    expect(Number(of)).toBe(PLACE_COUNT);

    const [remaining] = grab(methodology, /The remaining (\d+) carry projections from an earlier model run/, "remaining");
    expect(Number(remaining)).toBe(n.nLegacy);
    expect(Number(remaining)).toBe(PLACE_COUNT - reaches2061);

    const [those, legacyPct, wb51, wbCur, nCur] = grab(
      methodology,
      /Those (\d+) are (\d+\.\d)% of the weighted population, and the published 2051 share of (\d+\.\d)% falls to (\d+\.\d)% across the (\d+) areas/,
      "legacy share");
    expect(Number(those)).toBe(n.nLegacy);
    expect(legacyPct).toBe(pct1(n.legacyPopPct));
    expect(wb51).toBe(pct1(n.wb2051));
    expect(wbCur).toBe(pct1(n.wb2051Current));
    expect(Number(nCur)).toBe(n.nCurrent);

    const { count, areaCodes } = below2051();
    const [legacyIn, ofCount] = grab(
      methodology, /(\w+) of the (\d+) areas below 50% at 2051 are legacy output/, "legacy inside the count");
    expect(num(legacyIn)).toBe(legacyAmong(areaCodes));
    expect(Number(ofCount)).toBe(count);
  });
});
