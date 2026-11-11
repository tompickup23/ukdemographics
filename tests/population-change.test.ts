import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

import {
  CHANGE_BASE_YEAR,
  CHANGE_CSV_COLUMNS,
  CHANGE_INK,
  CHANGE_LATEST_YEAR,
  CHANGE_PUBLISHED_ISO,
  CHANGE_SOURCE,
  CHART_WIDTH,
  ENGLAND_AND_WALES,
  certaintyFor,
  changeCodes,
  changeCsvRows,
  changeFor,
  latestParts,
  panelScale,
  partsBetween,
  renderYearSvg,
  renderYearsSvg,
  signed,
  spanSentences,
  textEdges,
  yearParts,
  yearSentences,
  type Drawn
} from "../src/lib/population-change";
import { DASHES, LOADED_WORDS, RANKING_WORDS, contrast } from "../src/lib/map";

/**
 * Checks for the components of population change (register row R628;
 * docs/product/population-change-spec-2026-11-11.md).
 *
 * No published figure is pinned here: next year's edition must pass without editing
 * this file. The change file (table MYEB3 of the detailed time series) is checked
 * against the mid-year estimates file, which is built from a different ONS workbook
 * (tables MYE3 and MYE4) by a different script, so a mis-read column or a dropped
 * council in either shows up as a disagreement between them.
 */

const read = (p: string) => JSON.parse(fs.readFileSync(path.resolve(p), "utf8"));
const change = read("src/data/live/population-change.json");
const estimates = read("src/data/live/population-estimates.json");
const manifest = read("data/raw/manifests/ons_mye_timeseries.json");
const siteCodes = Object.keys(read("src/data/live/ethnic-projections.json").areas);
const years: number[] = change.years;
const BURNLEY = "E07000117";
const ALL = [...siteCodes, ENGLAND_AND_WALES];
const FLOWS = ["births", "deaths", "internalIn", "internalOut", "internationalIn", "internationalOut"] as const;

describe("population-change.json", () => {
  it("covers every site council and nothing else", () => {
    expect(Object.keys(change.areas).sort()).toEqual([...siteCodes].sort());
    expect(change.counts.areasEmitted).toBe(siteCodes.length);
    expect(changeCodes().length).toBe(siteCodes.length);
  });

  it("names the file it was built from, by the manifest's hash", () => {
    expect(change.source.fileSha256).toBe(manifest.current.fileSha256);
    expect(change.source.fileName).toBe(manifest.current.fileName);
    expect(change.source.table).toBe("MYEB3");
    expect(change.source.published).toMatch(/originally published/);
    expect(CHANGE_PUBLISHED_ISO).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it("holds one population per year and one of each flow per year after the first, as whole numbers", () => {
    for (const code of ALL) {
      const a = code === ENGLAND_AND_WALES ? change.englandAndWales : change.areas[code];
      expect(a.population.length, code).toBe(years.length);
      expect(a.population.every((v: number) => Number.isInteger(v) && v > 0), code).toBe(true);
      for (const k of FLOWS) {
        expect(a[k].length, `${code} ${k}`).toBe(years.length - 1);
        expect(a[k].every((v: number) => Number.isInteger(v) && v >= 0), `${code} ${k}`).toBe(true);
      }
      expect(a.other.every((v: number) => Number.isInteger(v)), code).toBe(true);
    }
  });

  it("adds up: the start plus every part is the end, for every area and every year", () => {
    for (const code of ALL) {
      const c = changeFor(code)!;
      for (const p of yearParts(c)) {
        expect(p.start + p.births - p.deaths + p.internalIn - p.internalOut + p.internationalIn - p.internationalOut + p.other, `${code} ${p.to}`).toBe(p.end);
      }
      expect(() => partsBetween(c, CHANGE_BASE_YEAR, CHANGE_LATEST_YEAR)).not.toThrow();
    }
  });

  it("gives the population the mid-year estimates workbook gives, for every council and year", () => {
    for (const code of siteCodes) {
      const series = estimates.areas[code].series;
      years.forEach((y, i) => expect(change.areas[code].population[i], `${code} ${y}`).toBe(series[y]));
    }
    years.forEach((y, i) => expect(change.englandAndWales.population[i], `E&W ${y}`).toBe(estimates.countries[ENGLAND_AND_WALES].series[y]));
  });

  it("gives the latest year's parts the mid-year estimates workbook gives (table MYE3), for every council and England and Wales", () => {
    expect(estimates.latestYear).toBe(CHANGE_LATEST_YEAR);
    for (const code of ALL) {
      const e = (code === ENGLAND_AND_WALES ? estimates.countries : estimates.areas)[code].components;
      const p = latestParts(changeFor(code)!);
      expect([p.births, p.deaths, p.internalNet, p.internationalNet, p.other], code).toEqual([e.births, e.deaths, e.internalMigrationNet, e.internationalMigrationNet, e.other]);
    }
  });

  it("starts the latest year from the revised figure, which is the one ONS revised in July 2026", () => {
    for (const code of siteCodes) {
      const c = certaintyFor(code)!;
      const prior = c.revisions.find((r) => r.year === CHANGE_LATEST_YEAR - 1)!;
      expect(latestParts(changeFor(code)!).start, code).toBe(prior.revised);
      expect(c.lower <= c.population && c.population <= c.upper, code).toBe(true);
    }
  });
});

const boxOf = (t: Drawn["texts"][number]) => {
  const [x0, x1] = textEdges(t);
  return { x0, x1, y0: t.y - t.size * 0.78, y1: t.y + t.size * 0.22 };
};
const overlaps = (a: { x0: number; x1: number; y0: number; y1: number }, b: { x0: number; x1: number; y0: number; y1: number }) =>
  a.x0 < b.x1 && a.x1 > b.x0 && a.y0 < b.y1 && a.y1 > b.y0;

function layoutFaults(d: Drawn, where: string): string[] {
  const faults: string[] = [];
  const boxes = d.texts.map(boxOf);
  boxes.forEach((b, i) => {
    const t = d.texts[i];
    if (b.x0 < 2 || b.x1 > CHART_WIDTH - 2 || b.y0 < 0 || b.y1 > d.height) faults.push(`${where}: "${t.text}" leaves the picture`);
    if (t.size < 9.5) faults.push(`${where}: "${t.text}" is set at ${t.size}`);
    for (let j = i + 1; j < boxes.length; j++) if (overlaps(b, boxes[j])) faults.push(`${where}: "${t.text}" overlaps "${d.texts[j].text}"`);
    for (const m of d.marks) {
      if (overlaps(b, { x0: m.x, x1: m.x + m.width, y0: m.y, y1: m.y + m.height })) faults.push(`${where}: "${t.text}" sits on a mark`);
    }
  });
  return faults;
}

describe("the charts", () => {
  it("keep every label inside the picture, readable, clear of every other label and off every bar, for every area", () => {
    const faults: string[] = [];
    for (const code of ALL) {
      const c = changeFor(code)!;
      faults.push(...layoutFaults(renderYearSvg(c), `${code} year`), ...layoutFaults(renderYearsSvg(c), `${code} years`));
    }
    expect(faults.slice(0, 20)).toEqual([]);
  }, 60_000);

  it("print every part of the latest year exactly as the data holds it", () => {
    for (const code of ALL) {
      const c = changeFor(code)!;
      const p = latestParts(c);
      const texts = renderYearSvg(c).texts.map((t) => t.text);
      for (const v of [signed(p.births), signed(-p.deaths), signed(p.internalNet), signed(p.internationalNet), signed(p.other), signed(p.change), p.start.toLocaleString("en-GB"), p.end.toLocaleString("en-GB")]) {
        expect(texts, `${code} ${v}`).toContain(v);
      }
    }
  });

  it("use one round scale for every panel, and no column leaves its panel", () => {
    for (const code of ALL) {
      const rows = yearParts(changeFor(code)!);
      const s = panelScale(rows);
      expect(Number.isInteger(s.step) && s.step >= 1, code).toBe(true);
      expect(String(s.step / 10 ** Math.floor(Math.log10(s.step))), code).toMatch(/^(1|2|2\.5|5)$/);
      expect(s.top % s.step === 0 && s.bottom % s.step === 0, code).toBe(true);
      for (const p of rows) for (const v of [p.natural, p.internalNet, p.internationalNet, p.other, p.change]) {
        expect(v <= s.top && v >= s.bottom, `${code} ${p.to}`).toBe(true);
      }
    }
  });

  it("are named, with a title and a description that give the source", () => {
    for (const d of [renderYearSvg(changeFor(BURNLEY)!), renderYearsSvg(changeFor(BURNLEY)!)]) {
      expect(d.svg).toMatch(/^<svg [^>]*role="img"[^>]*aria-labelledby="[^"]+-title [^"]+-desc"/);
      expect(d.svg).toContain(`table ${CHANGE_SOURCE.table}`);
      expect(d.alt).toContain("Source: ONS");
    }
  });

  it("meet contrast for text and marks on the saved image", () => {
    expect(contrast(CHANGE_INK.text, CHANGE_INK.ground)).toBeGreaterThanOrEqual(4.5);
    expect(contrast(CHANGE_INK.muted, CHANGE_INK.ground)).toBeGreaterThanOrEqual(4.5);
    expect(contrast(CHANGE_INK.part, CHANGE_INK.ground)).toBeGreaterThanOrEqual(3);
    expect(contrast(CHANGE_INK.total, CHANGE_INK.ground)).toBeGreaterThanOrEqual(3);
  });

  it("write the light tokens into the picture, so a saved image matches the page", () => {
    const css = fs.readFileSync("src/styles/global.css", "utf8");
    expect(css).toMatch(new RegExp(`--series-1:\\s*${CHANGE_INK.part}`, "i"));
  });
});

describe("the words", () => {
  const numbersIn = (s: string) => [...s.matchAll(/[+−]?\d+(?:,\d{3})*/g)].map((m) => m[0]);

  it("put no dash, ranking word or loaded verb in anything people read", () => {
    const faults: string[] = [];
    for (const code of ALL) {
      const c = changeFor(code)!;
      const a = renderYearSvg(c);
      const b = renderYearsSvg(c);
      for (const t of [...yearSentences(c), ...spanSentences(c), a.alt, b.alt, ...a.texts.map((x) => x.text), ...b.texts.map((x) => x.text)]) {
        if (DASHES.test(t) || RANKING_WORDS.test(t) || LOADED_WORDS.test(t)) faults.push(`${code}: ${t}`);
      }
    }
    expect(faults).toEqual([]);
  }, 60_000);

  it("write sentences whose every number is in the data or is a sum of it", () => {
    for (const code of ALL) {
      const c = changeFor(code)!;
      const l = latestParts(c);
      const s = partsBetween(c, CHANGE_BASE_YEAR, CHANGE_LATEST_YEAR);
      const r = partsBetween(c, CHANGE_BASE_YEAR, 2021);
      const allowed = new Set<string>();
      const add = (v: number) => { allowed.add(Math.abs(v).toLocaleString("en-GB")); allowed.add(signed(v)); };
      for (const p of [l, s]) for (const v of Object.values(p)) add(v);
      add(r.other);
      add(CHANGE_LATEST_YEAR - CHANGE_BASE_YEAR);
      for (const y of years) allowed.add(String(y));
      for (const sentence of [...yearSentences(c), ...spanSentences(c)]) {
        for (const n of numbersIn(sentence)) expect(allowed.has(n), `${code}: ${n} in "${sentence}"`).toBe(true);
      }
    }
  });

  it("never gives gross UK moves for England and Wales, where moves between councils cancel out", () => {
    const words = yearSentences(changeFor(ENGLAND_AND_WALES)!).join(" ");
    expect(words).not.toMatch(/moves into England and Wales from elsewhere in the UK/);
    expect(words).toMatch(/Scotland and Northern Ireland/);
  });

  it("quotes ONS only in words its own notes use", () => {
    const notes = fs.readFileSync("src/components/PopulationChangeNotes.astro", "utf8");
    const defs = Object.values(CHANGE_SOURCE.definitions).join(" ").toLowerCase();
    const quotes = [...notes.matchAll(/"([a-z][^"{}<>]+)"/g)].map((m) => m[1]).filter((q) => q.includes(" "));
    expect(quotes.length).toBeGreaterThanOrEqual(6);
    for (const q of quotes) expect(defs, q).toContain(q.toLowerCase());
  });
});

describe("the download", () => {
  it("has one row per year and round-trips to the data file", () => {
    const c = changeFor(BURNLEY)!;
    const rows = changeCsvRows(c);
    expect(rows.length).toBe(years.length - 1);
    expect(Object.keys(rows[0])).toEqual([...CHANGE_CSV_COLUMNS]);
    rows.forEach((row, i) => {
      expect(row.from_mid_year).toBe(years[i]);
      expect(row.population_end).toBe(change.areas[BURNLEY].population[i + 1]);
      expect(row.births).toBe(change.areas[BURNLEY].births[i]);
      expect(row.international_out).toBe(change.areas[BURNLEY].internationalOut[i]);
    });
  });
});
