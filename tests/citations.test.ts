import fs from "node:fs";
import { describe, expect, it } from "vitest";
import raw from "../src/data/lookups/citations.json";
import { CITATIONS, citationDay, citationSubjectOf } from "../src/lib/citations";
import { SITE_URL, getIndexableSitePaths, organizationNode } from "../src/lib/site";

const BANNED = [/—/, /–/, / - /, /&mdash;|&ndash;/];
const placeTemplate = fs.readFileSync("src/pages/places/[slug].astro", "utf8");
const about = fs.readFileSync("src/pages/about.astro", "utf8");
const llms = fs.readFileSync("src/pages/llms.txt.ts", "utf8");

describe("citations record", () => {
  it("has at least one citation, each complete", () => {
    expect(CITATIONS.length).toBeGreaterThan(0);
    for (const c of CITATIONS) {
      for (const key of ["id", "title", "author", "preparedFor", "dateLabel", "url", "location", "used", "ukdPath", "ukdLabel", "checkedNote"] as const) {
        expect(c[key], `${c.id}.${key}`).toBeTruthy();
      }
      expect(c.page).toBeGreaterThan(0);
      for (const d of [c.datePublished, c.accessedByAuthor, c.checked]) expect(d).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      expect(c.url).toMatch(/^https:\/\//);
      for (const copy of c.alsoIn) {
        expect(copy.url).toMatch(/^https:\/\//);
        expect(copy.page).toBeGreaterThan(0);
      }
    }
  });

  it("uses no dashes as punctuation", () => {
    const text = JSON.stringify(raw);
    for (const re of BANNED) expect(text).not.toMatch(re);
  });

  it("ids are unique", () => {
    const ids = CITATIONS.map((c) => c.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  // A citation in a published report points at a page and an anchor. If either is
  // renamed, the report's link stops landing where its author pointed it.
  it("every cited page is still published", () => {
    const paths = new Set(getIndexableSitePaths());
    for (const c of CITATIONS) {
      const [pathname] = c.ukdPath.split("#");
      expect(paths.has(pathname), `${c.id}: ${pathname}`).toBe(true);
    }
  });

  it("every cited anchor is still a section id on that page type", () => {
    for (const c of CITATIONS) {
      const [pathname, fragment] = c.ukdPath.split("#");
      if (!fragment) continue;
      expect(pathname.startsWith("/places/"), `${c.id}: anchors are only checked on place pages`).toBe(true);
      expect(placeTemplate, `${c.id}: #${fragment}`).toContain(`id="${fragment}"`);
      expect(placeTemplate, `${c.id}: #${fragment} in the section rail`).toContain(`id: "${fragment}"`);
    }
  });

  it("the about page and llms.txt list the record", () => {
    expect(about).toContain('id="cited-in"');
    expect(about).toContain("CITATIONS.map");
    expect(llms).toContain("## Cited in");
    expect(llms).toContain("CITATIONS.map");
  });

  it("formats dates in words without shifting the day", () => {
    expect(citationDay("2026-11-15")).toBe("15 November 2026");
    expect(citationDay("2026-01-01")).toBe("1 January 2026");
  });
});

describe("Organization structured data", () => {
  const org = organizationNode();

  it("keeps the shared @id and names the alternate spellings", () => {
    expect(org["@id"]).toBe(`${SITE_URL}/#organization`);
    expect(org.alternateName).toContain("ukdemographics.co.uk");
  });

  it("lists each citing report, pointing at the page it cites", () => {
    const subjectOf = org.subjectOf as Array<Record<string, unknown>>;
    expect(subjectOf).toEqual(citationSubjectOf(SITE_URL));
    expect(subjectOf.length).toBe(CITATIONS.length);
    for (const [i, node] of subjectOf.entries()) {
      expect(node.url).toBe(CITATIONS[i].url);
      expect(node.citation).toBe(`${SITE_URL}${CITATIONS[i].ukdPath}`);
    }
  });

  it("carries no sameAs, which would tie the anonymous site to a personal account", () => {
    expect(org).not.toHaveProperty("sameAs");
  });

  it("both layouts use the shared node rather than their own copy", () => {
    for (const p of ["src/layouts/BaseLayout.astro", "src/layouts/MapLayout.astro"]) {
      const src = fs.readFileSync(p, "utf8");
      expect(src).toContain("organizationNode(siteOrigin)");
      expect(src).not.toMatch(/"@type": "Organization"/);
    }
  });
});
