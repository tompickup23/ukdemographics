import { describe, expect, it } from "vitest";
import rawProjections from "../src/data/live/ethnic-projections.json";
import cobChange from "../src/data/live/country-of-birth-change-2011-2021.json";
import {
  buildConstituencyDescription,
  buildPlaceDirectAnswer,
  buildPlaceListing,
  buildRegionListing,
  censusYear,
  listingHorizon,
  modelProvenance,
  profileUpdatedDate,
  type PlaceCoverage,
} from "../src/lib/search-listing";
import { plausibleThrough } from "../src/lib/projection-plausibility";

const areas = (rawProjections as any).areas as Record<string, any>;
const cob = (cobChange as any).areas as Record<string, any>;

// House style: no dashes as punctuation and none of the stock phrases that mark
// generated copy.
const BANNED = [/—/, /–/, / - /, /&mdash;|&ndash;/, /\bdelve\b/i, /\bcomprehensive\b/i, /\brobust\b/i,
  /\bseamless/i, /\bunlock/i, /\bvibrant\b/i, /\btapestry\b/i, /\blandscape\b/i, /\bcrucial\b/i, /\bn\/a\b/];

function expectHouseStyle(text: string) {
  for (const re of BANNED) expect(text, `${re} in: ${text}`).not.toMatch(re);
}

/** Every formatted number the data supports for this area. */
function allowedNumbers(code: string): Set<string> {
  const a = areas[code];
  const allowed = new Set<string>();
  const add = (n: number | null | undefined, dp?: number) => {
    if (n == null) return;
    allowed.add(dp == null ? String(n) : Math.abs(n).toFixed(dp));
    allowed.add(Math.abs(n).toLocaleString("en-GB"));
  };
  add(a.current.total_population);
  add(a.current.year);
  add(a.baseline?.year);
  for (const v of Object.values(a.current.groups ?? {})) add(v as number, 1);
  for (const [y, g] of Object.entries(a.projections ?? {})) {
    add(Number(y));
    for (const v of Object.values(g as Record<string, number>)) add(v, 1);
  }
  const c = cob[code];
  if (c) { add(c.population2011); add(c.populationChangePct, 1); }
  const prov = modelProvenance();
  for (const y of prov.censuses) add(y);
  if (prov.envelopeBase) add(prov.envelopeBase);
  if (prov.version) allowed.add(prov.version);
  return allowed;
}

function numbersIn(text: string): string[] {
  return [...text.matchAll(/\d[\d,]*(?:\.\d+)?/g)].map((m) => m[0].replace(/,$/, ""));
}

describe("direct-answer paragraph", () => {
  const codes = Object.keys(areas);

  it("exists for every place and runs 60 to 90 words", () => {
    for (const code of codes) {
      const text = buildPlaceDirectAnswer(code);
      expect(text, code).toBeTruthy();
      const words = text!.split(/\s+/).length;
      expect(words, `${areas[code].areaName}: ${words} words`).toBeGreaterThanOrEqual(60);
      expect(words, `${areas[code].areaName}: ${words} words`).toBeLessThanOrEqual(90);
      expectHouseStyle(text!);
    }
  });

  it("uses no number the data files do not hold", () => {
    for (const code of codes) {
      const allowed = allowedNumbers(code);
      for (const n of numbersIn(buildPlaceDirectAnswer(code)!)) {
        expect(allowed.has(n), `${areas[code].areaName}: ${n} is not in the data`).toBe(true);
      }
    }
  });

  it("never quotes a projected year the plausibility guard withholds", () => {
    for (const code of codes) {
      const through = plausibleThrough(areas[code]);
      const years = numbersIn(buildPlaceDirectAnswer(code)!).map(Number).filter((n) => n >= 2031 && n <= 2061);
      for (const y of years) {
        // A withheld year may only appear in the sentence saying it is withheld.
        if (through == null || y > through) throw new Error(`${areas[code].areaName}: quotes ${y}, horizon ${through}`);
      }
    }
  });
});

describe("listing arms", () => {
  const coverage = (code: string): PlaceCoverage => ({
    areaName: areas[code].areaName,
    censusYear: censusYear(),
    projectionTo: listingHorizon(code),
    hasReligion: true,
    hasCountryOfBirth: true,
    arrivalsSince: 2002,
    hasHousing: true,
    hasSchools: true,
    hasServices: true,
  });
  const updated = profileUpdatedDate();
  const groupNames = /White|Asian|Black|Mixed|British/;

  it("leaves the control copy to the template", () => {
    expect(buildPlaceListing("control", coverage("E08000025"), updated)).toBeNull();
  });

  it("arm A names no group and quotes no figure other than a year", () => {
    for (const code of Object.keys(areas)) {
      const l = buildPlaceListing("A", coverage(code), updated)!;
      for (const text of [l.title, l.description, l.summary]) {
        const stripped = text.replace(areas[code].areaName, "");
        expect(stripped).not.toMatch(groupNames);
        expect(stripped).not.toMatch(/%/);
        for (const n of numbersIn(stripped)) expect(n, text).toMatch(/^(19|20)\d\d$/);
        expectHouseStyle(text);
      }
    }
  });

  it("arm B takes its year from the data and says the population is the Census count", () => {
    const l = buildPlaceListing("B", coverage("E08000025"), updated)!;
    expect(l.title).toContain(` ${updated!.slice(0, 4)}:`);
    expect(l.description).toContain(`as counted at the ${censusYear()} Census`);
    expect(l.description).not.toMatch(groupNames);
    expectHouseStyle(l.description);
  });
});

describe("region and constituency copy", () => {
  it("region listing names no group and no figure other than a year", () => {
    const l = buildRegionListing("North West", 2051);
    for (const text of [l.title, l.description, l.summary]) {
      expect(text).not.toMatch(/White|Asian|Black|%/);
      for (const n of numbersIn(text)) expect(n).toMatch(/^(19|20)\d\d$/);
      expectHouseStyle(text);
    }
  });

  it("constituency description says what is on the page", () => {
    const d = buildConstituencyDescription("Burnley", { mp: true, pip: true, demographics: true, localAuthorities: true });
    expect(d).toMatch(/sitting MP/);
    expect(d).toMatch(/general election result/);
    expectHouseStyle(d);
  });
});
