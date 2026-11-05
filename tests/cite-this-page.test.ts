import fs from "node:fs";
import { describe, expect, it } from "vitest";
import { ACCESSED_PLACEHOLDER, CITE_AUTHOR, citationEditions, placeCitation } from "../src/lib/cite";
import { placeCodes, placeCsvPath } from "../src/lib/place-downloads";
import { NOT_ANNOUNCED, allSeries, formatDay, nextUpdateText, sectionIds, sectionSeries } from "../src/lib/section-dates";
import { getPublicPlaceAreas } from "../src/lib/site";

const BANNED = [/\u2014/, /\u2013/, / - /, /&mdash;|&ndash;/];
const template = fs.readFileSync("src/pages/places/[slug].astro", "utf8");
const component = fs.readFileSync("src/components/CiteThisPage.astro", "utf8");

describe("how to cite this page (R363)", () => {
  it("every place page renders the cite block, above the foot freshness line", () => {
    const cite = template.indexOf("<CiteThisPage ");
    expect(cite).toBeGreaterThan(0);
    expect(cite).toBeLessThan(template.lastIndexOf("<DataFreshness"));
  });

  it("the citation uses the page's own title, the same one BaseLayout receives", () => {
    expect(template).toMatch(/placeCitation\(\{[\s\S]*?title: pageTitle,[\s\S]*?\}\)/);
    expect(template).toContain("title={pageTitle}");
    expect(template).toMatch(/placeCitation\(\{[\s\S]*?url: canonicalUrl,/);
  });

  it("is in Harvard shape: author (year) title. Data. Available at: URL (Accessed: [date]).", () => {
    const c = placeCitation({
      areaCode: "E06000023",
      areaName: "Bristol, City of",
      title: "Bristol demographics 2026: population, ethnicity and projections to 2051",
      url: "https://ukdemographics.co.uk/places/bristol-city-of/",
      year: "2026",
    });
    expect(c.text.startsWith(`${CITE_AUTHOR} (2026) Bristol demographics 2026: population, ethnicity and projections to 2051. Data: `)).toBe(true);
    expect(c.text.endsWith(`Available at: https://ukdemographics.co.uk/places/bristol-city-of/ (Accessed: ${ACCESSED_PLACEHOLDER}).`)).toBe(true);
    expect(c.csvPath).toBe(placeCsvPath("Bristol, City of"));
  });

  it("names the data editions of the download, one each, with publication dates in words", () => {
    const editions = citationEditions();
    expect(editions.length).toBe(3);
    for (const e of editions) expect(e).toMatch(/\(published \d{1,2} [A-Z][a-z]+ \d{4}\)$/);
  });

  it("gives every place with a CSV its download link, and no link where there is none", () => {
    const withCsv = new Set(placeCodes());
    for (const a of getPublicPlaceAreas()) {
      const c = placeCitation({ areaCode: a.areaCode, areaName: a.areaName, title: "t", url: "u", year: "2026" });
      expect(c.csvPath, a.areaCode).toBe(withCsv.has(a.areaCode) ? placeCsvPath(a.areaName) : null);
      for (const re of BANNED) expect(c.text).not.toMatch(re);
    }
  });

  it("names no individual and needs no framework", () => {
    for (const text of [component, fs.readFileSync("src/lib/cite.ts", "utf8")]) {
      expect(text).not.toMatch(/Tom Pickup|Pickup/i);
      expect(text).not.toMatch(/from ["'](react|preact|vue|svelte|solid-js)/);
      for (const re of BANNED) expect(text).not.toMatch(re);
    }
    expect(component).not.toMatch(/client:(load|idle|visible)/);
  });
});

describe("section freshness lines (R503)", () => {
  it("every section that cites a source renders a last updated line", () => {
    for (const id of sectionIds()) {
      expect(sectionSeries(id).length, id).toBeGreaterThan(0);
      expect(template, id).toContain(`<SectionDates section="${id}"`);
    }
    const comp = fs.readFileSync("src/components/SectionDates.astro", "utf8");
    expect(comp).toContain("lastUpdatedText(s)");
  });

  it("no next update line exists without the publisher's schedule, its URL and the date it was read", () => {
    for (const s of allSeries()) {
      const text = nextUpdateText(s);
      if (/^Next update likely/.test(text)) {
        expect(s.next, s.id).not.toBeNull();
        expect(s.next!.url, s.id).toMatch(/^https:\/\//);
        expect(s.next!.accessed, s.id).toMatch(/^\d{4}-\d{2}-\d{2}$/);
        expect(text, s.id).toContain(`(read ${formatDay(s.next!.accessed)})`);
      } else {
        expect(text, s.id).toBe(NOT_ANNOUNCED);
      }
    }
  });

  it("a series whose record lacks the schedule URL or read date renders not announced", () => {
    const s = allSeries().find((x) => x.next)!;
    expect(nextUpdateText({ ...s, next: null })).toBe(NOT_ANNOUNCED);
    expect(nextUpdateText({ ...s, next: { ...s.next!, url: "" } })).toBe(NOT_ANNOUNCED);
    expect(nextUpdateText({ ...s, next: { ...s.next!, accessed: "" } })).toBe(NOT_ANNOUNCED);
  });
});
