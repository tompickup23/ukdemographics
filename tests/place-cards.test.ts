/**
 * Share cards for place pages (maps plan Stage 3). The Open Graph image is the population
 * card (P2), every card draws the focus council's plate (I6), and card for card the value
 * on it is the figure the page prints, re-derived here from the source files. The raster
 * checks build one council's cards and read the files' own headers.
 */
import fs from "node:fs";
import { describe, expect, it } from "vitest";
import { getPublicPlaceAreas, slugifyAreaName } from "../src/lib/site";
import {
  CARD_PALETTE_COLOURS,
  buildCard,
  cardPath,
  placeCardSpecs,
  placeOgCard,
  placeSlug,
  renderCard
} from "../src/lib/map/cards";

const readJson = (p: string) => JSON.parse(fs.readFileSync(p, "utf8"));
const projections = readJson("src/data/live/ethnic-projections.json");
const mye = readJson("src/data/live/population-estimates.json");
const areas = getPublicPlaceAreas();
const BURNLEY = "E07000117";

/** The page's population change figure: "+16.0%", with the page's minus sign as a hyphen. */
function pagePopulationChange(code: string): { year: number; text: string } {
  const s = mye.areas[code].series as Record<string, number>;
  const year = Math.max(...Object.keys(s).map(Number));
  const d = Number(((s[String(year)] / s["2011"] - 1) * 100).toFixed(1));
  return { year, text: `${d > 0 ? "+" : d < 0 ? "-" : ""}${Math.abs(d).toFixed(1)}%` };
}
const norm = (s: string) => s.replace(/−/g, "-");

describe("place share cards", () => {
  it("makes the population card the Open Graph image, never an ethnicity card (P2)", () => {
    const og = placeCardSpecs().filter((c) => c.template === "og");
    expect(og.map((c) => c.indicator)).toEqual(["population_change"]);
    expect(placeOgCard(BURNLEY).path).toBe(`/media/places/burnley/population-${pagePopulationChange(BURNLEY).year}-og.png`);
  });

  it("files each place's cards under the page's own slug", () => {
    const bad = areas.filter((a) => placeSlug(a.areaCode) !== slugifyAreaName(a.areaName)).map((a) => a.areaName);
    expect(bad).toEqual([]);
    expect(new Set(areas.flatMap((a) => placeCardSpecs().map((c) => cardPath(a.areaCode, c)))).size).toBe(areas.length * placeCardSpecs().length);
  });

  it("draws the focus plate with the page's own figure on every card, for every place (I6)", { timeout: 180_000 }, () => {
    const bad: string[] = [];
    for (const { areaCode: code, areaName } of areas) {
      const pop = pagePopulationChange(code);
      for (const tk of ["og", "portrait"] as const) {
        const card = renderCard(code, "population_change", tk);
        if (!card.focus.labelled || card.focus.year !== pop.year || norm(card.focus.display) !== pop.text) {
          bad.push(`${areaName} population ${tk}: card "${card.focus.display}" ${card.focus.year}, page "${pop.text}" ${pop.year}`);
        }
      }
      // Census 2021 as TS021 gives it: the counts, rounded to 2 places (maps plan v2.2, I22).
      const cur = projections.areas[code].current;
      const w21 = Math.round((cur.groups_absolute.white_british / cur.total_population) * 10000) / 100;
      const eth = renderCard(code, "white_british_share", "portrait");
      if (!eth.focus.labelled || eth.focus.year !== 2021 || eth.focus.display !== `${w21.toFixed(1)}%`) {
        bad.push(`${areaName} White British portrait: card "${eth.focus.display}", page "${w21.toFixed(1)}%"`);
      }
    }
    expect(bad).toEqual([]);
  });

  it("writes palette PNGs and WebPs at the stated sizes (I7)", { timeout: 60_000 }, async () => {
    for (const spec of placeCardSpecs()) {
      const buf = await buildCard(BURNLEY, spec);
      if (spec.format === "png") {
        expect(buf.subarray(1, 4).toString("latin1")).toBe("PNG");
        expect([buf.readUInt32BE(16), buf.readUInt32BE(20)]).toEqual([spec.width, spec.height]);
        // IHDR colour type 3 is indexed colour, with a PLTE chunk of at most the palette size.
        expect(buf[25]).toBe(3);
        const plte = buf.indexOf("PLTE");
        expect(plte).toBeGreaterThan(0);
        expect(buf.readUInt32BE(plte - 4) / 3).toBeLessThanOrEqual(CARD_PALETTE_COLOURS);
      } else {
        expect(buf.subarray(0, 4).toString("latin1")).toBe("RIFF");
        expect(buf.subarray(8, 12).toString("latin1")).toBe("WEBP");
      }
      expect(buf.length, `${spec.name}.${spec.format}`).toBeLessThan(120 * 1024);
    }
  });
});

describe("ethnicity cards carry their context (maps plan v2.2, I26 and I27)", () => {
  it("draws all six groups for the focus council beside the White British map, matching the plate", { timeout: 180_000 }, () => {
    const bad: string[] = [];
    for (const { areaCode: code, areaName } of areas) {
      const svg = renderCard(code, "white_british_share", "portrait").svg;
      if (!svg.includes(`ALL SIX GROUPS IN ${areaName.toUpperCase().replace(/&/g, "&amp;")}`)) bad.push(`${areaName}: no composition bars`);
      if (!svg.includes("England and Wales 74.4%")) bad.push(`${areaName}: no England and Wales comparison on the plate`);
      const card = renderCard(code, "white_british_share", "portrait");
      const cur = projections.areas[code].current;
      const w21 = (Math.round((cur.groups_absolute.white_british / cur.total_population) * 10000) / 100).toFixed(1);
      if (!card.alt.includes(`White British ${w21}%`) || card.focus.display !== `${w21}%`) bad.push(`${areaName}: bars and plate disagree`);
    }
    expect(bad).toEqual([]);
  });

  it("keeps the population cards free of ethnicity", () => {
    const svg = renderCard(BURNLEY, "population_change", "og").svg + renderCard(BURNLEY, "population_change", "portrait").svg;
    expect(svg).not.toMatch(/White British|ALL SIX GROUPS|Asian/);
  });

  it("does not let the year outweigh the figure on the Open Graph card", () => {
    const res = renderCard(BURNLEY, "population_change", "og");
    const year = /font-size="([\d.]+)"[^>]*>2025</.exec(res.svg);
    const value = new RegExp(`font-size="([\\d.]+)"[^>]*>${res.focus.display.replace("+", "\\+")}<`).exec(res.svg);
    expect(Number(year![1])).toBeLessThanOrEqual(Number(value![1]));
  });
});

describe("card rights metadata", () => {
  it("embeds credit and rights in every file, naming the site and no person", async () => {
    for (const spec of placeCardSpecs()) {
      const buf = (await buildCard(BURNLEY, spec)).toString("latin1");
      expect(buf, `${spec.name}.${spec.format}`).toContain("<rdf:li>ukdemographics.co.uk</rdf:li>");
      expect(buf).toContain("Open Government Licence v3.0");
      expect(buf).toContain("https://ukdemographics.co.uk/terms/");
      expect(buf).not.toMatch(/Tom Pickup|DigitalSourceType|xmpRights:UsageTerms/);
    }
  });
});
