import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { FEED_PATH, FEED_TITLE, RELEASES_PATH, SITE_URL } from "../src/lib/site";
import { RELEASES, buildReleasesFeed, releaseAnchor, releaseLink, releaseUrl } from "../src/lib/releases";

const ROOT = path.resolve(__dirname, "..");
const DASHES = /[–—]| - |&mdash;|&ndash;/;
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

/** Entries written before this test existed are verbatim history and are not rewritten. */
const DASH_RULE_FROM = "2026-11-05";

function tagValues(xml: string, tag: string): string[] {
  return [...xml.matchAll(new RegExp(`<${tag}(?: [^>]*)?>([\\s\\S]*?)</${tag}>`, "g"))].map((m) => m[1]);
}

describe("release entries", () => {
  it("has entries, each with a real date, a title, a summary and a source address", () => {
    expect(RELEASES.length).toBeGreaterThan(0);
    for (const release of RELEASES) {
      expect(release.date, release.title).toMatch(ISO_DATE);
      expect(Number.isNaN(Date.parse(`${release.date}T00:00:00Z`)), release.date).toBe(false);
      expect(release.title.trim().length, release.date).toBeGreaterThan(0);
      expect(release.summary.trim().length, release.title).toBeGreaterThan(0);
      expect(() => new URL(release.sourceUrl), release.title).not.toThrow();
    }
  });

  it("is ordered newest first", () => {
    const dates = RELEASES.map((release) => release.date);
    expect(dates).toEqual([...dates].sort().reverse());
  });

  it("gives every entry its own anchor, safe to use as an id and a fragment", () => {
    const anchors = RELEASES.map(releaseAnchor);
    expect(new Set(anchors).size).toBe(anchors.length);
    for (const anchor of anchors) expect(anchor).toMatch(/^\d{4}-\d{2}-\d{2}-[a-z0-9]+(?:-[a-z0-9]+)*$/);
  });

  it("fills every date an entry reads from a data file", () => {
    for (const release of RELEASES.filter((r) => r.date >= DASH_RULE_FROM)) {
      expect(`${release.title} ${release.summary}`, release.title).not.toMatch(/undefined|\$\{|published [.,)]|\(\)/);
    }
    const dated = RELEASES.filter((r) => r.date >= DASH_RULE_FROM && /published|publication date/.test(r.summary));
    expect(dated.length).toBeGreaterThanOrEqual(3);
    for (const release of dated) expect(release.summary, release.title).toMatch(/\d{1,2} [A-Z][a-z]+ \d{4}/);
  });

  it("keeps dashes out of every entry written since the rule was tested", () => {
    for (const release of RELEASES.filter((r) => r.date >= DASH_RULE_FROM)) {
      expect(release.title, release.title).not.toMatch(DASHES);
      expect(release.summary, release.title).not.toMatch(DASHES);
    }
  });

  it("links an entry to the page it is about, and never just to the homepage", () => {
    for (const release of RELEASES) {
      const link = releaseLink(release);
      if (!link) continue;
      expect(link.href, release.title).not.toBe("/");
      if (link.external) expect(link.href).toMatch(/^https:\/\//);
      else expect(link.href).toMatch(/^\/[^/]/);
    }
    const site = RELEASES.find((r) => r.sourceUrl === "https://ukdemographics.co.uk");
    expect(site && releaseLink(site)).toBeNull();
  });
});

describe("/feed.xml", () => {
  const xml = buildReleasesFeed();
  const items = tagValues(xml, "item");

  it("is RSS 2.0 with the channel's title, link and self address", () => {
    expect(xml.startsWith('<?xml version="1.0" encoding="UTF-8"?>\n<rss version="2.0"')).toBe(true);
    expect(xml.trimEnd().endsWith("</rss>")).toBe(true);
    const channelHead = xml.slice(0, xml.indexOf("<item>"));
    expect(tagValues(channelHead, "title")).toEqual([FEED_TITLE]);
    expect(tagValues(channelHead, "link")).toEqual([`${SITE_URL}${RELEASES_PATH}`]);
    expect(channelHead).toContain(`<atom:link href="${SITE_URL}${FEED_PATH}" rel="self" type="application/rss+xml" />`);
    expect(channelHead).toContain("<language>en-GB</language>");
  });

  it("carries one item per release entry, in the page's order", () => {
    expect(items).toHaveLength(RELEASES.length);
    items.forEach((item, index) => {
      expect(tagValues(item, "link")).toEqual([releaseUrl(RELEASES[index])]);
      expect(tagValues(item, "guid")).toEqual([releaseUrl(RELEASES[index])]);
    });
  });

  it("gives every item a unique permanent address on the releases page", () => {
    const guids = items.flatMap((item) => tagValues(item, "guid"));
    expect(new Set(guids).size).toBe(guids.length);
    for (const guid of guids) expect(guid.startsWith(`${SITE_URL}${RELEASES_PATH}#`)).toBe(true);
  });

  it("dates every item in RFC 822 form, matching the entry's day", () => {
    items.forEach((item, index) => {
      const [pubDate] = tagValues(item, "pubDate");
      expect(pubDate).toMatch(/^[A-Z][a-z]{2}, \d{2} [A-Z][a-z]{2} \d{4} \d{2}:\d{2}:\d{2} GMT$/);
      expect(new Date(pubDate).toISOString().slice(0, 10)).toBe(RELEASES[index].date);
    });
  });

  it("escapes every text value, so the document stays well formed", () => {
    for (const tag of ["title", "description", "link", "guid"]) {
      for (const value of tagValues(xml, tag)) {
        expect(value, tag).not.toMatch(/[<>]/);
        expect(value.replace(/&(?:amp|lt|gt|quot|apos);/g, ""), tag).not.toContain("&");
      }
    }
    const quoted = RELEASES.find((r) => r.summary.includes('"'));
    expect(quoted).toBeDefined();
    expect(xml).not.toMatch(/<description>[^<]*"[^<]*<\/description>/);
  });

  it("refuses an entry whose date is not a day", () => {
    expect(() => buildReleasesFeed([{ date: "November 2026", title: "x", summary: "y", sourceUrl: SITE_URL }])).toThrow(/YYYY-MM-DD/);
  });
});

describe("discovery", () => {
  it.each(["BaseLayout.astro", "MapLayout.astro"])("%s points feed readers at the feed", (layout) => {
    const source = readFileSync(path.join(ROOT, "src", "layouts", layout), "utf8");
    expect(source).toContain('<link rel="alternate" type="application/rss+xml" title={FEED_TITLE} href={feedUrl} />');
    expect(source).toContain("const feedUrl = new URL(FEED_PATH, siteOrigin).toString();");
  });

  it("serves the feed from the path the layouts name", () => {
    expect(FEED_PATH).toBe("/feed.xml");
    const endpoint = readFileSync(path.join(ROOT, "src", "pages", "feed.xml.ts"), "utf8");
    expect(endpoint).toContain("buildReleasesFeed()");
  });

  it("shows each entry's anchor and the feed address on the releases page", () => {
    const page = readFileSync(path.join(ROOT, "src", "pages", "releases.astro"), "utf8");
    expect(page).toContain("id={releaseAnchor(release)}");
    expect(page).toContain("href={FEED_PATH}");
  });
});
