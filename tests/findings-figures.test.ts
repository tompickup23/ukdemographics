import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import send from "../src/data/live/send-dashboard.json";
import asc from "../src/data/live/asc-dashboard.json";
import births from "../src/data/live/births-history-national.json";
import rawProjections from "../src/data/live/ethnic-projections.json";
import { plausibleThrough } from "../src/lib/projection-plausibility";
import { getPublicPlaceAreas } from "../src/lib/site";
import { nationalWhiteBritishAggregate } from "../src/lib/national-share";

/**
 * Figures quoted in findings prose, checked against the data file each one comes
 * from. No release figure is typed here: each check reads the number out of the
 * sentence and compares it with the file, so a refresh passes if the prose moves
 * with it and fails, naming the sentence, if it does not. Same pattern as
 * tests/majority-counts.test.ts.
 *
 * The SEND and adult social care findings were corrected on 12 October 2026 after
 * their original figures turned out to come from a hand-typed 25-authority file
 * that matched no published table. These checks stop that happening again.
 *
 * Dated correction notices (markdown blockquotes) are left out: they record what
 * was true on their date and must not move with the data.
 */

const read = (slug: string) =>
  fs.readFileSync(path.resolve("src/content/findings", `${slug}.md`), "utf8");

const prose = (text: string) =>
  text
    .split("\n")
    .filter((line) => !line.trimStart().startsWith(">"))
    .join("\n")
    .replace(/\*\*/g, "")
    .replace(/\s+/g, " ");

const frontmatter = (text: string, field: string) => {
  const m = text.match(new RegExp(`^${field}:\\s*"(.*)"$`, "m"));
  if (!m) throw new Error(`no ${field} in frontmatter`);
  return m[1];
};

const grab = (text: string, re: RegExp, label: string): string[] => {
  const m = text.match(re);
  if (!m) throw new Error(`${label}: sentence not found (${re}). Update this test with the prose.`);
  return m.slice(1);
};

const n = (s: string) => Number(s.replace(/,/g, ""));
const areas = (rawProjections as any).areas as Record<string, any>;

/** Spearman rank correlation with average ranks for ties. */
function spearman(x: number[], y: number[]): number {
  const rank = (v: number[]) => {
    const order = v.map((_, i) => i).sort((a, b) => v[a] - v[b]);
    const r = new Array(v.length).fill(0);
    for (let i = 0; i < order.length; ) {
      let j = i;
      while (j + 1 < order.length && v[order[j + 1]] === v[order[i]]) j++;
      for (let k = i; k <= j; k++) r[order[k]] = (i + j) / 2 + 1;
      i = j + 1;
    }
    return r;
  };
  const rx = rank(x), ry = rank(y);
  const mean = (v: number[]) => v.reduce((s, a) => s + a, 0) / v.length;
  const mx = mean(rx), my = mean(ry);
  let num = 0, dx = 0, dy = 0;
  for (let i = 0; i < rx.length; i++) {
    num += (rx[i] - mx) * (ry[i] - my);
    dx += (rx[i] - mx) ** 2;
    dy += (ry[i] - my) ** 2;
  }
  return num / Math.sqrt(dx * dy);
}

describe("SEND finding against send-dashboard.json", () => {
  const raw = read("send-demand-demographic-areas");
  const text = prose(raw);
  const eng = (send as any).england;
  const byName = (name: string) =>
    Object.values((send as any).areas as Record<string, any>).find((a) => a.areaName === name);

  it("quotes England's five-year growth and counts from the file", () => {
    const [pct, from, to] = grab(
      text,
      /rose by ([\d.]+)% in five years, from ([\d,]+) in 2020\/21 to ([\d,]+) in 2025\/26/,
      "England growth"
    );
    expect(Number(pct)).toBe(eng.fiveYearGrowthPct);
    expect(n(from)).toBe(eng.ehcpPupilsFiveYearsEarlier);
    expect(n(to)).toBe(eng.ehcpPupils);
    expect(frontmatter(raw, "stat_value")).toBe(`+${eng.fiveYearGrowthPct}%`);
    const [share] = grab(text, /they are ([\d.]+)% of pupils/, "England share");
    expect(Number(share)).toBe(eng.ehcpPctOfPupils);
  });

  it("quotes each named council's growth and counts from the file", () => {
    for (const name of ["Blackpool", "Lancashire", "Doncaster"]) {
      const a = byName(name);
      const re = new RegExp(`${name}(?:, which runs SEND for Preston)?: \\+([\\d.]+)%, from ([\\d,]+) to ([\\d,]+)`);
      const [pct, from, to] = grab(text, re, name);
      expect(Number(pct)).toBe(a.fiveYearGrowthPct);
      expect(n(from)).toBe(a.ehcpPupilsFiveYearsEarlier);
      expect(n(to)).toBe(a.ehcpPupils);
    }
    // North Northamptonshire is said to have no five-year figure.
    expect(byName("North Northamptonshire").fiveYearGrowthPct).toBeNull();
  });

  it("quotes the rank correlation with demographic change as the data gives it", () => {
    const x: number[] = [], y: number[] = [];
    for (const [code, a] of Object.entries((send as any).areas as Record<string, any>)) {
      const p = areas[code];
      const g11 = p?.baseline?.groups?.white_british, g21 = p?.current?.groups?.white_british;
      if (a.fiveYearGrowthPct == null || g11 == null || g21 == null) continue;
      x.push(g21 - g11);
      y.push(a.fiveYearGrowthPct);
    }
    const [count, rho] = grab(
      text,
      /Across the (\d+) unitary, metropolitan and London authorities with both figures, the rank correlation between five-year growth and the 2011 to 2021 change in the White British share is (-?[\d.]+)/,
      "correlation"
    );
    expect(Number(count)).toBe(x.length);
    expect(Number(rho)).toBe(Number(spearman(x, y).toFixed(2)));
  });
});

describe("adult social care finding against asc-dashboard.json", () => {
  const raw = read("asc-spend-demographic-change");
  const text = prose(raw);
  const a = (asc as any).areas as Record<string, any>;
  const pounds = (code: string) => `£${a[code].grossSpendPerCapita}`;

  it("quotes spend per adult from the file", () => {
    const [bwd, wn] = grab(text, /Blackburn with Darwen spent (£\d+) per adult in 2024-25 and West Northamptonshire (£\d+)/, "two unitaries");
    expect(bwd).toBe(pounds("E06000008"));
    expect(wn).toBe(pounds("E06000062"));
    const [lancs] = grab(text, /Lancashire County Council spent (£\d+) per adult/, "Lancashire");
    expect(lancs).toBe(pounds("E10000017"));
    const [bpool, england] = grab(text, /Blackpool spent (£\d+), and England as a whole (£\d+)/, "Blackpool and England");
    expect(bpool).toBe(pounds("E06000009"));
    expect(england).toBe(`£${(asc as any).england.grossSpendPerCapita}`);
    expect(frontmatter(raw, "stat_value")).toBe(pounds("E10000017"));
  });

  it("names as districts only areas with no figure of their own in the file", () => {
    // The original piece gave district councils adult social care figures.
    for (const code of ["E07000122", "E07000123", "E07000117", "E07000128", "E07000124", "E07000119", "E07000127", "E07000125"]) {
      expect(a[code]).toBeUndefined();
    }
  });
});

describe("births finding against births-history-national.json", () => {
  const text = prose(read("births-non-uk-born-mothers-2024"));
  const b = births as any;
  const at = (year: number) => b.years.indexOf(year);

  it("quotes the 2008 and 2024 counts from Table 1", () => {
    const [uk08, uk24, non08, non24] = grab(
      text,
      /Births to UK-born mothers fell from ([\d,]+) to ([\d,]+) \(down \d+%\)\. Births to non-UK-born mothers rose from ([\d,]+) to ([\d,]+)/,
      "UK and non-UK counts"
    );
    expect(n(uk08)).toBe(b.ukBornMother[at(2008)]);
    expect(n(uk24)).toBe(b.ukBornMother[at(2024)]);
    expect(n(non08)).toBe(b.nonUkBornMother[at(2008)]);
    expect(n(non24)).toBe(b.nonUkBornMother[at(2024)]);
    const [total, non, pct] = grab(text, /([\d,]+) live births in England and Wales last year\. ([\d,]+) of those, ([\d.]+)%/, "2024 total");
    expect(n(total)).toBe(b.totalBirths[at(2024)]);
    expect(n(non)).toBe(b.nonUkBornMother[at(2024)]);
    expect(Number(pct)).toBe(b.nonUkBornMotherPct[at(2024)]);
  });

  it("quotes the time series rows from Table 1", () => {
    for (const year of [2008, 2012, 2016, 2020, 2024]) {
      const [total, pct] = grab(text, new RegExp(`\\| ${year} \\| ([\\d,]+) \\| ([\\d.]+)% \\|`), `row ${year}`);
      expect(n(total)).toBe(b.totalBirths[at(year)]);
      expect(Number(pct)).toBe(b.nonUkBornMotherPct[at(year)]);
    }
  });
});

describe("Blackburn finding against ethnic-projections.json", () => {
  it("quotes the 2011 White British share from the Census baseline", () => {
    const text = prose(read("blackburn-minority-wb-2027"));
    const [share] = grab(text, /Down from ([\d.]+)% in 2011/, "2011 share");
    expect(share).toBe(areas.E06000008.baseline.groups.white_british.toFixed(1));
  });
});

describe("cohort-component figures against modelSpread2051", () => {
  // The cohort-component run was corrected on 12 October 2026 (it had doubled the
  // ONS projection envelope). These checks make the prose move with any re-run.
  const codes = getPublicPlaceAreas().map((a) => a.areaCode);

  it("quotes the weighted 2051 share on the Hamilton-Perry publishable areas", () => {
    let wsum = 0, pop = 0, count = 0;
    for (const code of codes) {
      const a = areas[code];
      const through = plausibleThrough(a);
      const cc = a?.modelSpread2051?.cohortComponent;
      const p = a?.current?.total_population ?? 0;
      if (through == null || through < 2051 || a?.projections?.["2051"]?.white_british == null || cc == null || !p) continue;
      wsum += cc * p; pop += p; count++;
    }
    const cc = wsum / pop;
    const hp = nationalWhiteBritishAggregate(codes).wb2051;
    const text = prose(read("86-areas-minority-wbi-2051"));
    const [quoted, n312] = grab(text, /gives ([\d.]+)% on the same weighting and the same (\d+) areas/, "cohort-component share");
    expect(quoted).toBe(cc.toFixed(1));
    expect(Number(n312)).toBe(count);
    const [gap, hpQ, ccQ] = grab(text, /The two models are ([\d.]+) points apart on this weighting, ([\d.]+)% against ([\d.]+)%/, "gap");
    expect(hpQ).toBe(hp.toFixed(1));
    expect(ccQ).toBe(cc.toFixed(1));
    expect(gap).toBe((Number(hpQ) - Number(ccQ)).toFixed(1));
  });

  it("quotes Birmingham's 2051 cohort-component figure from the file", () => {
    const text = prose(read("birmingham-demographic-transformation"));
    const [quoted] = grab(text, /projects ([\d.]+)% on the same year/, "Birmingham cohort-component");
    expect(Number(quoted)).toBe(areas.E08000025.modelSpread2051.cohortComponent);
  });
});
