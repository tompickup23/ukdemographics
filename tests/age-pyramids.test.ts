import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

import {
  AGE_COUNT,
  ENGLAND_AND_WALES,
  OPEN_AGE,
  PYRAMID_ACCURACY_NOTE,
  PYRAMID_BASE_YEAR,
  PYRAMID_CSV_COLUMNS,
  PYRAMID_GEOMETRY,
  PYRAMID_INK,
  PYRAMID_LATEST_YEAR,
  PYRAMID_PUBLISHED_ISO,
  PYRAMID_SOURCE_LINE,
  PYRAMID_YEARS,
  pyramidClientData,
  pyramidCodes,
  pyramidCsvRows,
  pyramidFor,
  pyramidScales,
  pyramidSentences,
  renderPyramidSvg,
  summarise
} from "../src/lib/age-pyramid";
import { DASHES, LOADED_WORDS, RANKING_WORDS, VISIONS, contrast, seenDistance } from "../src/lib/map";

/**
 * Checks for the age pyramid layer (docs/product/age-pyramid-spec-2026-11-09.md).
 *
 * No published figure is pinned here: next year's edition must pass without editing
 * this file. The pyramid file is checked against the mid-year estimates file, which is
 * built from a different ONS workbook by a different script, so a mis-read column or a
 * dropped council in either shows up as a disagreement between them.
 */

const read = (p: string) => JSON.parse(fs.readFileSync(path.resolve(p), "utf8"));
const pyramids = read("src/data/live/age-pyramids.json");
const estimates = read("src/data/live/population-estimates.json");
const manifest = read("data/raw/manifests/ons_mye_timeseries.json");
const siteCodes = Object.keys(read("src/data/live/ethnic-projections.json").areas);
const sum = (row: number[]) => row.reduce((a, b) => a + b, 0);
const BURNLEY = "E07000117";
const SAMPLE = [BURNLEY, "E08000025", "E09000001", "E06000053", "W06000015", "E06000063", ENGLAND_AND_WALES];

describe("age-pyramids.json", () => {
  it("covers every site council and nothing else", () => {
    expect(Object.keys(pyramids.areas).sort()).toEqual([...siteCodes].sort());
    expect(pyramids.counts.areasEmitted).toBe(siteCodes.length);
    expect(pyramidCodes().length).toBe(siteCodes.length);
  });

  it("names the file it was built from, by the manifest's hash", () => {
    expect(pyramids.source.fileSha256).toBe(manifest.current.fileSha256);
    expect(pyramids.source.fileName).toBe(manifest.current.fileName);
    expect(pyramids.source.table).toBe("MYEB1");
    expect(pyramids.source.published).toMatch(/originally published/);
    expect(PYRAMID_PUBLISHED_ISO).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it("holds 91 whole numbers of zero or more for each sex in every year", () => {
    expect(PYRAMID_YEARS.length).toBeGreaterThan(1);
    for (const [code, a] of [...Object.entries(pyramids.areas), ["E&W", pyramids.englandAndWales]] as [string, any][]) {
      for (const sex of ["M", "F"]) {
        expect(a[sex].length, code).toBe(PYRAMID_YEARS.length);
        // One assertion per row: an assertion per cell is 870,000 of them.
        for (const row of a[sex]) {
          expect(row.length, code).toBe(AGE_COUNT);
          expect(row.every((v: unknown) => Number.isInteger(v) && (v as number) >= 0), `${code} ${sex}`).toBe(true);
        }
      }
    }
  });

  it("sums to the mid-year estimate for every council in every year", () => {
    for (const code of siteCodes) {
      PYRAMID_YEARS.forEach((year, i) => {
        const total = sum(pyramids.areas[code].M[i]) + sum(pyramids.areas[code].F[i]);
        expect(total, `${code} ${year}`).toBe(estimates.areas[code].series[String(year)]);
      });
    }
  });

  it("sums to ONS's own England and Wales row in every year", () => {
    PYRAMID_YEARS.forEach((year, i) => {
      const total = sum(pyramids.englandAndWales.M[i]) + sum(pyramids.englandAndWales.F[i]);
      expect(total, String(year)).toBe(estimates.countries.K04000001.series[String(year)]);
    });
  });

  it("gives the age bands and the median age the estimates workbook gives for the latest year", () => {
    expect(PYRAMID_LATEST_YEAR).toBe(estimates.latestYear);
    for (const code of [...siteCodes, ENGLAND_AND_WALES]) {
      const s = summarise(pyramidFor(code)!, PYRAMID_LATEST_YEAR);
      const held = code === ENGLAND_AND_WALES ? estimates.countries[code] : estimates.areas[code];
      expect(s.bands, code).toEqual(held.ageBands);
      expect(s.population, code).toBe(held.population);
      // MYE6 is published to one decimal place.
      expect(s.medianAge.toFixed(1), code).toBe(held.medianAge.toFixed(1));
    }
  });
});

describe("age pyramid chart", () => {
  const draw = (code: string, year = PYRAMID_LATEST_YEAR, compareYear: number | null = PYRAMID_BASE_YEAR) =>
    renderPyramidSvg(pyramidFor(code)!, { year, compareYear });

  it("draws every bar at the length the data file holds, on the fixed scale", () => {
    for (const code of SAMPLE) {
      const p = pyramidFor(code)!;
      const scale = pyramidScales(p).people;
      const i = p.years.indexOf(PYRAMID_LATEST_YEAR);
      const svg = draw(code);
      const bars = [...svg.matchAll(/data-ap-bar="([MF])" data-age="(\d+)" x="[\d.]+" y="[\d.]+" width="([\d.]+)"/g)];
      expect(bars.length, code).toBe(AGE_COUNT * 2);
      // Lengths are written to a tenth of a unit, so a bar is within that of its value.
      const tolerance = (0.051 / PYRAMID_GEOMETRY.side) * scale.max;
      for (const [, sex, age, width] of bars) {
        const value = (Number(width) / PYRAMID_GEOMETRY.side) * scale.max;
        expect(Math.abs(value - p[sex as "M" | "F"][i][Number(age)]), `${code} ${sex} ${age}`).toBeLessThanOrEqual(tolerance);
      }
    }
  });

  it("keeps one scale across every year and never lets a bar leave the plot", () => {
    for (const code of SAMPLE) {
      const p = pyramidFor(code)!;
      const scales = pyramidScales(p);
      const ticks = (svg: string) => [...svg.matchAll(/class="ap-t ap-tick"[^>]*>([^<]+)</g)].map((m) => m[1]).join("|");
      expect(ticks(draw(code, PYRAMID_BASE_YEAR, null)), code).toBe(ticks(draw(code)));
      for (const rows of [p.M, p.F]) for (const row of rows) expect(Math.max(...row), code).toBeLessThanOrEqual(scales.people.max);
      expect(scales.people.max / scales.people.step, code).toBeLessThanOrEqual(5);
      expect(scales.share.max / scales.share.step, code).toBeLessThanOrEqual(5);
    }
  });

  it("states the population of both years in the picture, exactly as held", () => {
    for (const code of SAMPLE.filter((c) => c !== ENGLAND_AND_WALES)) {
      const svg = draw(code);
      const series = estimates.areas[code].series;
      expect(svg, code).toContain(`${series[String(PYRAMID_LATEST_YEAR)].toLocaleString("en-GB")} residents`);
      expect(svg, code).toContain(`${series[String(PYRAMID_BASE_YEAR)].toLocaleString("en-GB")} residents`);
    }
  });

  it("is named, with a title and a description that give the source", () => {
    const svg = draw(BURNLEY);
    expect(svg).toMatch(/role="img" aria-labelledby="ap-title ap-desc"/);
    expect(svg).toMatch(/<title id="ap-title"[^>]*>Burnley: population by single year of age and sex, mid-\d{4} against mid-\d{4}<\/title>/);
    expect(svg).toMatch(/<desc id="ap-desc"[^>]*>[^<]*Source: ONS[^<]*table MYEB1/);
  });

  it("sets the 90 and over bar apart from age 89", () => {
    const y = (age: number) => Number(new RegExp(`data-ap-bar="M" data-age="${age}" x="[\\d.]+" y="([\\d.]+)"`).exec(draw(BURNLEY))![1]);
    expect(y(OPEN_AGE - 1) - y(OPEN_AGE)).toBeGreaterThan(PYRAMID_GEOMETRY.rowHeight * 2);
    expect(y(OPEN_AGE - 2) - y(OPEN_AGE - 1)).toBeCloseTo(PYRAMID_GEOMETRY.rowHeight, 5);
  });

  it("writes the light tokens into the picture, so a saved image matches the page", () => {
    const css = fs.readFileSync("src/styles/global.css", "utf8");
    const root = css.slice(0, css.indexOf("@media (prefers-color-scheme: dark)"));
    const token = (name: string) => new RegExp(`--${name}:\\s*(#[0-9a-f]{6})`).exec(root)![1];
    expect(PYRAMID_INK.males).toBe(token("series-1"));
    expect(PYRAMID_INK.females).toBe(token("series-2"));
    expect(PYRAMID_INK.text).toBe(token("text"));
    expect(PYRAMID_INK.muted).toBe(token("text-muted"));
    expect(PYRAMID_INK.grid).toBe(token("border"));
    expect(PYRAMID_INK.ground).toBe(token("bg"));
  });

  it("meets contrast for its text and keeps the two series apart for every kind of vision", () => {
    expect(contrast(PYRAMID_INK.text, PYRAMID_INK.ground)).toBeGreaterThanOrEqual(4.5);
    expect(contrast(PYRAMID_INK.muted, PYRAMID_INK.ground)).toBeGreaterThanOrEqual(4.5);
    for (const c of [PYRAMID_INK.males, PYRAMID_INK.females]) expect(contrast(c, PYRAMID_INK.ground), c).toBeGreaterThanOrEqual(3);
    for (const v of VISIONS) expect(seenDistance(PYRAMID_INK.males, PYRAMID_INK.females, v), v).toBeGreaterThan(0.09);
  });

  it("puts no dash, ranking word or loaded verb in anything people read", () => {
    for (const code of SAMPLE) {
      const p = pyramidFor(code)!;
      const svg = draw(code);
      const text = [...[...svg.matchAll(/>([^<>]+)</g)].map((m) => m[1]), ...pyramidSentences(p), PYRAMID_SOURCE_LINE, PYRAMID_ACCURACY_NOTE];
      for (const t of text) {
        expect(DASHES.test(t), t).toBe(false);
        expect(RANKING_WORDS.test(t), t).toBe(false);
        expect(LOADED_WORDS.test(t), t).toBe(false);
      }
    }
  });

  it("writes sentences whose every number is in the data", () => {
    for (const code of siteCodes) {
      const p = pyramidFor(code)!;
      const now = summarise(p, PYRAMID_LATEST_YEAR);
      const then = summarise(p, PYRAMID_BASE_YEAR);
      const allowed = new Set([
        String(PYRAMID_LATEST_YEAR), String(PYRAMID_BASE_YEAR),
        now.population.toLocaleString("en-GB"), then.population.toLocaleString("en-GB"),
        now.medianAge.toFixed(1), then.medianAge.toFixed(1)
      ]);
      for (const s of pyramidSentences(p)) {
        for (const n of s.replace(/\.$/, "").match(/\d[\d,]*(?:\.\d+)?/g) ?? []) expect(allowed.has(n), `${code}: ${n} in "${s}"`).toBe(true);
      }
    }
  });

  it("hands the client script the same rows and the same scales", () => {
    const p = pyramidFor(BURNLEY)!;
    const client = pyramidClientData(p);
    expect(client.M).toEqual(pyramids.areas[BURNLEY].M);
    expect(client.F).toEqual(pyramids.areas[BURNLEY].F);
    expect(client.scales).toEqual(pyramidScales(p));
    expect(pyramidClientData(pyramidFor(ENGLAND_AND_WALES)!).englandAndWalesUrl).toBeNull();
  });
});

describe("age pyramid download", () => {
  it("has one row per year, sex and single year of age, and round-trips to the data file", () => {
    for (const code of [BURNLEY, "W06000015"]) {
      const rows = pyramidCsvRows(pyramidFor(code)!);
      expect(rows.length).toBe(PYRAMID_YEARS.length * 2 * AGE_COUNT);
      expect(Object.keys(rows[0])).toEqual([...PYRAMID_CSV_COLUMNS]);
      for (const row of rows) {
        const i = PYRAMID_YEARS.indexOf(Number(row.year));
        const age = row.age === "90+" ? OPEN_AGE : Number(row.age);
        expect(row.population, `${code} ${row.year} ${row.sex} ${row.age}`).toBe(pyramids.areas[code][row.sex === "male" ? "M" : "F"][i][age]);
        expect(row.area_name).toBe(pyramids.areas[code].name);
      }
    }
  });
});
