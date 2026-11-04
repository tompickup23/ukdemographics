import { describe, expect, it } from "vitest";
import rawProjections from "../src/data/live/ethnic-projections.json";
import successors from "../src/data/live/census-2011-successors.json";
import cobChange from "../src/data/live/country-of-birth-change-2011-2021.json";
import {
  COMPARISON_NOTE,
  comparisonTotals,
  growthPct,
  populationGrowthComparison,
  relation,
  whiteBritishComparison,
  whiteBritishPct,
} from "../src/lib/place-comparisons";
import { getPublicPlaceAreas } from "../src/lib/site";

const areas = (rawProjections as any).areas as Record<string, any>;
const cob = (cobChange as any).areas as Record<string, any>;
const places = getPublicPlaceAreas();

const BANNED = [/—/, /–/, / - /, /&mdash;|&ndash;/, /\bn\/a\b/];

describe("parent totals are sums of the councils the site holds", () => {
  const { region, country } = comparisonTotals();

  it("England and Wales hold every council once", () => {
    const english = places.filter((p) => p.countryName === "England").length;
    const welsh = places.filter((p) => p.countryName === "Wales").length;
    expect(country.get("England")!.councils).toBe(english);
    expect(country.get("Wales")!.councils).toBe(welsh);
    expect(english + welsh).toBe(places.length);
  });

  it("the regions of England add up to England", () => {
    const englishRegions = [...region.values()].filter((r) => r.name !== "Wales");
    const sum = (k: "population2011" | "population2021" | "whiteBritish2021") => englishRegions.reduce((s, r) => s + r[k], 0);
    const england = country.get("England")!;
    expect(sum("population2011")).toBe(england.population2011);
    expect(sum("population2021")).toBe(england.population2021);
    expect(sum("whiteBritish2021")).toBe(england.whiteBritish2021);
  });

  it("the 2011 total matches the check recorded with the successor sums", () => {
    const all = country.get("England")!.population2011 + country.get("Wales")!.population2011;
    expect(all).toBe((successors as any).checks.englandAndWales2011Total);
  });
});

describe("plain-words relation", () => {
  it.each([
    [2.4, "about 2 points above"],
    [-1.2, "about 1 point below"],
    [0.4, "about the same as"],
    [-0.49, "about the same as"],
    [0.5, "about 1 point above"],
    [-7.6, "about 8 points below"],
  ])("%s", (diff, text) => expect(relation(diff)).toBe(text));
});

describe("comparison lines", () => {
  const { region, country } = comparisonTotals();

  it("every place gets a White British line naming its region and country, with their figures", () => {
    for (const p of places) {
      const c = whiteBritishComparison(p.areaCode);
      expect(c, p.areaName).not.toBeNull();
      const refs = p.countryName === "Wales" ? [country.get("Wales")!] : [region.get(p.regionName)!, country.get("England")!];
      for (const t of refs) {
        expect(c!.text).toContain(`${whiteBritishPct(t).toFixed(1)}%`);
        expect(c!.text).toContain(t.name);
      }
      for (const re of BANNED) expect(c!.text).not.toMatch(re);
    }
  });

  it("the growth line appears only where the direct answer states a change since 2011", () => {
    for (const p of places) {
      const c = populationGrowthComparison(p.areaCode);
      expect(c != null, p.areaName).toBe(cob[p.areaCode]?.populationChangePct != null);
      if (!c) continue;
      expect(c.text).toMatch(/^Growth since 2011: about /);
      const ref = p.countryName === "Wales" ? country.get("Wales")! : region.get(p.regionName)!;
      expect(c.text).toContain(`${growthPct(ref).toFixed(1)}%`);
      for (const re of BANNED) expect(c.text).not.toMatch(re);
    }
  });

  it("each gap is the difference between the printed figures", () => {
    // The council's growth is the one the direct-answer paragraph prints and
    // its share is the card's value, so a reader who subtracts the printed
    // parent figure gets the stated gap.
    for (const p of places) {
      const ref = p.countryName === "Wales" ? country.get("Wales")! : region.get(p.regionName)!;
      const g = populationGrowthComparison(p.areaCode);
      if (g) {
        const gap = Number(cob[p.areaCode].populationChangePct.toFixed(1)) - Number(growthPct(ref).toFixed(1));
        expect(g.text, p.areaName).toContain(`${relation(gap)} ${ref.name === "Wales" ? "Wales" : ""}`.trim());
      }
      const w = whiteBritishComparison(p.areaCode)!;
      const share = areas[p.areaCode].current.census_groups.white_british;
      const gap = Number(share.toFixed(1)) - Number(whiteBritishPct(ref).toFixed(1));
      expect(w.text.toLowerCase(), p.areaName).toContain(relation(gap));
    }
  });

  it("reads plainly for a worked example", () => {
    const bristol = places.find((p) => p.areaCode === "E06000023")!;
    const sw = region.get(bristol.regionName)!;
    const local = Number(areas.E06000023.current.census_groups.white_british.toFixed(1));
    const shown = (t: any) => Number(whiteBritishPct(t).toFixed(1));
    expect(whiteBritishComparison("E06000023")!.text).toBe(
      `${relation(local - shown(sw)).replace(/^a/, "A")} the South West (${whiteBritishPct(sw).toFixed(1)}%) and ${relation(local - shown(country.get("England")!))} England (${whiteBritishPct(country.get("England")!).toFixed(1)}%).`
    );
  });

  it("the note labels the comparisons as arithmetic", () => {
    expect(COMPARISON_NOTE).toMatch(/arithmetic/);
    expect(COMPARISON_NOTE).toMatch(/not a separate ONS figure/);
    for (const re of BANNED) expect(COMPARISON_NOTE).not.toMatch(re);
  });
});
