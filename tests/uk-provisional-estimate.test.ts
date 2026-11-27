import { readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { RELEASES } from "../src/lib/releases";
import {
  UK_COMPONENTS_SUM,
  UK_ESTIMATE,
  UK_ESTIMATE_ANCHOR,
  UK_ESTIMATE_CHANGE,
  UK_ESTIMATE_LABEL,
  UK_ESTIMATE_PUBLISHED_DAY,
  UK_ESTIMATE_SOURCE_LINE,
  UK_PREVIOUS_LABEL,
  formatMillions,
  formatWhole,
  midYearLabel,
} from "../src/lib/uk-provisional-estimate";

const ROOT = path.resolve(__dirname, "..");
const read = (rel: string) => readFileSync(path.join(ROOT, rel), "utf8");

function walk(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const full = path.join(dir, name);
    return statSync(full).isDirectory() ? walk(full) : [full];
  });
}

describe("the ONS provisional UK estimate", () => {
  it("adds up: the earlier estimate plus births, less deaths, plus net migration", () => {
    // ONS builds the provisional figure from exactly these published parts, so a
    // mistyped digit in any of the five values breaks this.
    expect(UK_ESTIMATE.previous.population + UK_COMPONENTS_SUM).toBe(UK_ESTIMATE.population);
    expect(UK_COMPONENTS_SUM).toBe(UK_ESTIMATE_CHANGE);
  });

  it("holds figures to the nearest thousand, as the bulletin gives them", () => {
    for (const value of [
      UK_ESTIMATE.population,
      UK_ESTIMATE.previous.population,
      UK_ESTIMATE.births,
      UK_ESTIMATE.deaths,
      UK_ESTIMATE.netInternationalMigration,
    ]) {
      expect(Number.isInteger(value)).toBe(true);
      expect(value % 1000).toBe(0);
    }
  });

  it("names its source: publisher, title, sections, dates and an ONS address", () => {
    const { source, previous } = UK_ESTIMATE;
    expect(source.publisher).toBe("Office for National Statistics");
    expect(source.title).toMatch(/^Provisional population estimate for the UK: mid-\d{4}$/);
    expect(source.sections).toMatch(/section/);
    for (const iso of [source.published, source.readOn, previous.published, UK_ESTIMATE.referenceDate, previous.referenceDate]) {
      expect(iso).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      expect(Number.isNaN(Date.parse(iso))).toBe(false);
    }
    expect(new URL(source.url).host).toBe("www.ons.gov.uk");
    expect(new URL(previous.url).host).toBe("www.ons.gov.uk");
    expect(source.readOn >= source.published).toBe(true);
    expect(UK_ESTIMATE_SOURCE_LINE).toContain(source.title);
    expect(UK_ESTIMATE_SOURCE_LINE).toContain(UK_ESTIMATE_PUBLISHED_DAY);
  });

  it("is a UK figure, marked provisional, for a mid-year one year after the estimate it starts from", () => {
    expect(UK_ESTIMATE.geography).toBe("United Kingdom");
    expect(UK_ESTIMATE.provisional).toBe(true);
    expect(UK_ESTIMATE.yearEnding).toBe(UK_ESTIMATE.referenceDate);
    expect(Number(UK_ESTIMATE.referenceDate.slice(0, 4)) - Number(UK_ESTIMATE.previous.referenceDate.slice(0, 4))).toBe(1);
    expect(sourceTitleYear()).toBe(UK_ESTIMATE_LABEL);
    expect(UK_PREVIOUS_LABEL).toBe(midYearLabel(UK_ESTIMATE.previous.referenceDate));
    expect(() => midYearLabel("2026-03-31")).toThrow();
  });

  it("formats figures the way the page prints them", () => {
    expect(formatWhole(69564000)).toBe("69,564,000");
    expect(formatMillions(69564000)).toBe("69.6 million");
  });
});

function sourceTitleYear(): string {
  return /mid-\d{4}$/.exec(UK_ESTIMATE.source.title)?.[0] ?? "";
}

describe("where the UK estimate is shown", () => {
  const national = read("src/pages/national.astro");

  it("is on /national/ with its geography tag, its anchor and no typed figure", () => {
    expect(national).toContain("../lib/uk-provisional-estimate");
    expect(national).toContain("id={UK_ESTIMATE_ANCHOR}");
    expect(national).toContain('<span class="scope-tag">{UK_ESTIMATE.geography}</span>');
    expect(national).toContain("UK_ESTIMATE.source.url");
    // Every figure is read from the data file, so replacing the file updates the page.
    for (const value of [UK_ESTIMATE.population, UK_ESTIMATE.previous.population, UK_ESTIMATE.births, UK_ESTIMATE.deaths]) {
      expect(national).not.toContain(formatWhole(value));
      expect(national).not.toContain(String(value));
    }
  });

  it("is on no place, county, region or constituency page: ONS gives no breakdown below the UK", () => {
    const pages = path.join(ROOT, "src", "pages");
    const users = walk(pages)
      .filter((file) => /\.(astro|ts)$/.test(file))
      .filter((file) => readFileSync(file, "utf8").includes("uk-provisional-estimate"))
      .map((file) => path.relative(pages, file));
    expect(users).toEqual(["national.astro"]);
  });

  it("has a release entry that links to the section", () => {
    const entry = RELEASES.find((release) => release.sourceUrl.endsWith(`/national/#${UK_ESTIMATE_ANCHOR}`));
    expect(entry).toBeDefined();
    // The entry is history and keeps its own figures. They are checked against the
    // data file only while the file still holds the edition the entry describes.
    if (entry && UK_ESTIMATE.referenceDate === "2026-06-30") {
      for (const value of [
        UK_ESTIMATE.population,
        UK_ESTIMATE.previous.population,
        UK_ESTIMATE.births,
        UK_ESTIMATE.deaths,
        UK_ESTIMATE.netInternationalMigration,
      ]) {
        expect(entry.summary).toContain(formatWhole(value));
      }
      expect(entry.summary).toContain(UK_ESTIMATE.source.title);
      expect(entry.summary).toContain(UK_ESTIMATE_PUBLISHED_DAY);
    }
  });
});
