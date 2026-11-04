/**
 * Related findings on a place page (audit of 3 November 2026): matched on the place,
 * then its county or region, then a section the page has, then recency, and never a
 * piece about another named place. Findings are read from disk, as authored.
 */
import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { findingLead, leadSubjects, relatedFindings, type FindingInput, type PlaceContext } from "../src/lib/related-findings";
import { countyForDistrict } from "../src/lib/counties";
import { getPublicPlaceAreas } from "../src/lib/site";

const DIR = path.resolve("src/content/findings");
const findings: FindingInput[] = fs.readdirSync(DIR).filter((f) => f.endsWith(".md")).map((file) => {
  const raw = fs.readFileSync(path.join(DIR, file), "utf8");
  const m = raw.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n([\s\S]*)$/)!;
  // Read as text, as tests/findings-integrity.test.ts does: one line per field.
  const field = (name: string): string | undefined =>
    m[1].match(new RegExp(`^${name}:\\s*(.*)$`, "m"))?.[1].trim().replace(/^["']|["']$/g, "").replace(/\\"/g, '"');
  return { id: file, headline: field("headline")!, summary: field("summary")!, body: m[2], category: field("category")!, date: field("date")!, updated: field("updated") };
});

const ALL_SECTIONS = ["ethnic-composition", "nino", "housing", "health-ethnic", "crime", "asc", "send", "schools"];
const areas = new Map(getPublicPlaceAreas().map((a) => [a.areaCode, a]));
const ctx = (code: string, sections = ALL_SECTIONS): PlaceContext => {
  const a = areas.get(code)!;
  return { code, name: a.areaName, regionName: a.regionName, countyName: countyForDistrict(code)?.countyName ?? null, sections };
};
const slugs = (code: string, sections?: string[]) => relatedFindings(findings, ctx(code, sections)).map((r) => r.href.split("/")[2]);

const BRISTOL = "E06000023", BURNLEY = "E07000117", MID_SUFFOLK = "E07000203";
const ABOUT_ELSEWHERE = ["birmingham-demographic-transformation", "blackburn-minority-wb-2027", "working-and-not-working-by-passport", "asc-spend-demographic-change"];

describe("Bristol", () => {
  it("is offered nothing about Birmingham, Blackburn, Burnley or Lancashire", () => {
    const got = slugs(BRISTOL);
    expect(got).toHaveLength(3);
    for (const s of ABOUT_ELSEWHERE) expect(got).not.toContain(s);
  });
  it("has no finding of its own, so nothing ranks as naming it", () => {
    expect(relatedFindings(findings, ctx(BRISTOL)).every((r) => r.tier >= 3)).toBe(true);
  });
});

describe("Burnley", () => {
  it("leads with the pieces that name Burnley", () => {
    const got = relatedFindings(findings, ctx(BURNLEY));
    expect(got.every((r) => r.tier === 1)).toBe(true);
    expect(got.map((r) => r.href.split("/")[2])).toContain("working-and-not-working-by-passport");
  });
  it("is never offered the Birmingham piece", () => {
    expect(relatedFindings(findings, ctx(BURNLEY), findings.length).map((r) => r.href)).not.toContain("/findings/birmingham-demographic-transformation/");
  });
});

describe("a district no finding names", () => {
  it("Mid Suffolk is named by no finding", () => {
    for (const f of findings) expect(`${f.headline} ${f.summary} ${f.body}`).not.toMatch(/Mid Suffolk|E07000203/);
  });
  it("gets section matches first, then recency, and nothing about another place", () => {
    const got = relatedFindings(findings, ctx(MID_SUFFOLK, ["ethnic-composition"]));
    expect(got).toHaveLength(3);
    expect(got.every((r) => r.tier === 3)).toBe(true);
    for (const s of ABOUT_ELSEWHERE) expect(got.map((r) => r.href.split("/")[2])).not.toContain(s);
  });
  it("falls back to the newest when the page has no matching section", () => {
    const got = relatedFindings(findings, ctx(MID_SUFFOLK, []));
    expect(got.every((r) => r.tier === 4)).toBe(true);
    const dates = got.map((r) => { const f = findings.find((x) => r.href.includes(x.id.replace(/\.md$/, "")))!; return f.updated ?? f.date; });
    expect(dates).toEqual([...dates].sort().reverse());
  });
});

describe("every place page", () => {
  it.each([...areas.keys()])("%s is offered no piece whose lead names only somewhere else", (code) => {
    const c = ctx(code);
    const own = new Set([`place:${code}`, `county:${c.countyName}`, `region:${c.regionName}`]);
    for (const r of relatedFindings(findings, c)) {
      const f = findings.find((x) => r.href === `/findings/${x.id.replace(/\.md$/, "")}/`)!;
      const subjects = [...leadSubjects(findingLead(f))];
      expect(subjects.length === 0 || subjects.some((s) => own.has(s)), `${code}: ${f.id} is about ${subjects.join(", ")}`).toBe(true);
    }
  });
});
