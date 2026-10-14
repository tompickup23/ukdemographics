/**
 * The place page map block (maps plan Stage 2). Every figure is re-derived here from the
 * source files, read from disk, never through the module under test.
 */
import fs from "node:fs";
import { gzipSync } from "node:zlib";
import { describe, expect, it } from "vitest";
import { DASHES, LOADED_WORDS, RANKING_WORDS, areaName, focusFrame, getIndicator, placeCodes, qa, renderStill } from "../src/lib/map";
import { GROUPS, MEASURES, censusShares, placeMap, summarySentences } from "../src/lib/map/place";

const readJson = (p: string) => JSON.parse(fs.readFileSync(p, "utf8"));
const projections = readJson("src/data/live/ethnic-projections.json");
const mye = readJson("src/data/live/population-estimates.json");
const successors2011 = readJson("src/data/live/census-2011-successors.json").areas;

const BURNLEY = "E07000117", CARDIFF = "W06000015", RIBBLE_VALLEY = "E07000124", CUMBERLAND = "E06000063", ISLE_OF_WIGHT = "E06000046";
const FIVE = [BURNLEY, CARDIFF, RIBBLE_VALLEY, CUMBERLAND, ISLE_OF_WIGHT];

/** White British share for a Census year, from the raw files: stored shares, or the summed 2011 districts. */
function rawShares(code: string, year: 2011 | 2021): Record<string, number> | null {
  const a = projections.areas[code];
  const side = year === 2011 ? a.baseline : a.current;
  // 2021 re-derived from the TS021 counts, rounded to 2 places as the rebase script does.
  if (side.year === year && year === 2021) return Object.fromEntries(Object.entries<number>(side.groups_absolute).map(([g, n]) => [g, Math.round((n / side.total_population) * 10000) / 100]));
  if (side.year === year) return side.groups;
  const d = year === 2011 ? successors2011[code] : null;
  if (!d) return null;
  return Object.fromEntries(Object.entries<number>(d.groups_absolute).map(([g, n]) => [g, Number(((n / d.total_population) * 100).toFixed(2))]));
}
const nf = (v: number) => v.toLocaleString("en-GB");
function expectedSentences(code: string): string[] {
  const name = projections.areas[code].areaName;
  const s = mye.areas[code].series;
  const out: string[] = [];
  const d = Number(((s["2025"] / s["2011"] - 1) * 100).toFixed(1));
  out.push(`${name}'s estimated population ${d === 0 ? "showed no change" : `${d > 0 ? "rose" : "fell"} ${Math.abs(d).toFixed(1)}%`} between mid-2011 and mid-2025, from ${nf(s["2011"])} to ${nf(s["2025"])} (ONS mid-year estimates, table MYE4).`);
  const w11 = rawShares(code, 2011)?.white_british, w21 = rawShares(code, 2021)!.white_british;
  if (w11 != null) {
    const p = Number((w21 - w11).toFixed(1));
    out.push(`Its White British share ${p === 0 ? "showed no change" : `${p > 0 ? "rose" : "fell"} ${Math.abs(p).toFixed(1)} points`} between the 2011 and 2021 Censuses, from ${w11.toFixed(1)}% to ${w21.toFixed(1)}% (ONS Census 2011 table KS201EW, Census 2021 table TS021).`);
  }
  return out;
}

describe("place map block", () => {
  it("draws one SVG per page with the geometry once and both measures on it", { timeout: 120_000 }, () => {
    const bad: string[] = [];
    for (const code of placeCodes()) {
      const pm = placeMap(code);
      const svg = pm.svg;
      if ((svg.match(/<svg/g) ?? []).length !== 1) bad.push(`${code}: not one svg`);
      for (const sh of pm.measures[0].res.layout.shapes) {
        if (svg.split(`d="${sh.d}"`).length - 1 !== 1) bad.push(`${code}: ${sh.code} geometry drawn ${svg.split(`d="${sh.d}"`).length - 1} times`);
      }
      for (const m of pm.measures) {
        const chunks = (svg.match(new RegExp(`<g data-measure="${m.key}"`, "g")) ?? []).length;
        if (chunks !== 2) bad.push(`${code}: ${chunks} chunks for ${m.key}`);
        for (const c of pm.frame.members) for (const y of m.years) {
          if (!new RegExp(`data-code="${c}"[^>]*data-${m.key}-f-${y}="`).test(svg)) bad.push(`${code}: no ${m.key} fill for ${c} ${y}`);
        }
      }
      if (/<g data-measure="e">/.test(svg)) bad.push(`${code}: the ethnicity chunk is shown with no script`);
      if (!/data-m="p"/.test(svg)) bad.push(`${code}: population is not the first measure`);
      if (/<!--\/?m\d+-->/.test(svg)) bad.push(`${code}: merge markers left in`);
    }
    expect(bad.slice(0, 10)).toEqual([]);
  });

  it("keeps every page's map within the weight budget (I2)", { timeout: 120_000 }, () => {
    // The block's whole budget is 30 KB gzipped (tables and bars included, checked over
    // dist/ by scripts/check/place-map-weight.mjs); the SVG takes at most 25 KB of it.
    const over: string[] = [];
    let max = 0;
    for (const code of placeCodes()) {
      const gz = gzipSync(placeMap(code).svg).length;
      max = Math.max(max, gz);
      if (gz > 25 * 1024) over.push(`${areaName(code)} ${(gz / 1024).toFixed(1)} KB`);
    }
    expect(over).toEqual([]);
    expect(max).toBeGreaterThan(0);
  });

  it("passes the QA gates for both measures in every year on the five checked councils", () => {
    for (const code of FIVE) for (const m of MEASURES) {
      const ind = getIndicator(m.id, { projections: false });
      for (const y of ind.years) expect(qa(renderStill(focusFrame(code), ind, "inline", y, { measure: m.key })), `${code} ${m.id} ${y}`).toEqual([]);
    }
  });

  it("carries a title per council and a map title per measure and year (I3)", () => {
    for (const code of FIVE) {
      const pm = placeMap(code);
      for (const m of pm.measures) for (const y of m.years) {
        expect(pm.svg).toContain(`data-${m.key}-a-${y}="Map: ${m.ind.title}, `);
        for (const c of pm.frame.members) {
          const v = m.ind.status(c, y) === "ok" ? m.ind.format(m.ind.value(c, y)!) : "n/a";
          const esc = `${areaName(c)}: ${v}`.replace(/&/g, "&amp;");
          expect(pm.svg, `${c} ${m.key} ${y}`).toMatch(new RegExp(`data-tc="${c}"[^>]*data-${m.key}-t-${y}="${esc.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}"`));
        }
      }
      // The no-script title names the default year: population, mid-2025.
      expect(pm.svg).toMatch(/<title id="[^"]+" data-alt=""[^>]*>Map: Population change since 2011, mid-2025 estimate\./);
    }
  });

  it("writes the summary sentences from the source files, with neutral verbs and no ranking", () => {
    const bad: string[] = [];
    for (const code of placeCodes()) {
      const got = summarySentences(code);
      const want = expectedSentences(code);
      if (JSON.stringify(got) !== JSON.stringify(want)) bad.push(`${code}: ${JSON.stringify(got)} vs ${JSON.stringify(want)}`);
      for (const s of got) {
        if (DASHES.test(s) || RANKING_WORDS.test(s) || LOADED_WORDS.test(s)) bad.push(`${code}: wording "${s}"`);
        if (/\b(increased|decreased|grew|declined|dropped|jumped)\b/.test(s)) bad.push(`${code}: verb "${s}"`);
      }
    }
    expect(bad.slice(0, 5)).toEqual([]);
  });

  it("states the five checked councils' figures as the sources give them", () => {
    expect(summarySentences(BURNLEY)).toEqual([
      "Burnley's estimated population rose 16.0% between mid-2011 and mid-2025, from 87,032 to 100,946 (ONS mid-year estimates, table MYE4).",
      "Its White British share fell 7.6 points between the 2011 and 2021 Censuses, from 85.5% to 77.9% (ONS Census 2011 table KS201EW, Census 2021 table TS021)."
    ]);
    // Cumberland's 2011 figure is the sum of Allerdale, Carlisle and Copeland (KS201EW).
    expect(successors2011[CUMBERLAND].total_population).toBe(96422 + 107524 + 70603);
    expect(summarySentences(CUMBERLAND)[1]).toContain("from 96.5% to 95.1%");
    // Island: nearest councils, never "border".
    expect(focusFrame(ISLE_OF_WIGHT).relation).toBe("nearby");
  });

  it("gives the composition bars all six groups from the source files", () => {
    for (const code of placeCodes()) for (const y of [2011, 2021] as const) {
      const got = censusShares(code, y), want = rawShares(code, y);
      if (want == null) { expect(got).toBeNull(); continue; }
      for (const g of GROUPS) expect(got![g.key], `${code} ${y} ${g.key}`).toBe(want[g.key]);
    }
    expect(GROUPS.map((g) => g.key)).toEqual(["white_british", "white_other", "asian", "black", "mixed", "other"]);
    // No red for any group (hue 345 to 15 degrees with any saturation).
    for (const g of GROUPS) {
      const [r, gg, b] = [1, 3, 5].map((i) => parseInt(g.colour.slice(i, i + 2), 16));
      expect(r > gg * 1.4 && r > b * 1.4, `${g.label} ${g.colour}`).toBe(false);
    }
  });

  it("keeps the switcher script under 5 KB", () => {
    expect(fs.statSync("public/scripts/place-map.js").size).toBeLessThan(5 * 1024);
  });
});
