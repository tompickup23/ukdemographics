import fs from "node:fs";
import { describe, expect, it } from "vitest";
import calendar from "../src/data/lookups/release-calendar.json";
import mye from "../src/data/live/population-estimates.json";
import projections from "../src/data/live/ethnic-projections.json";
import crime from "../src/data/live/crime-dashboard.json";
import send from "../src/data/live/send-dashboard.json";
import ctb from "../src/data/live/council-tax-spd.json";
import pressure from "../src/data/live/fiscal-resilience.json";
import homeOffice from "../data/raw/manifests/home_office.json";
import spc from "../data/raw/manifests/dfe_pupil_characteristics.json";
import pfa from "../data/raw/manifests/ons_pfa_crime.json";
import payroll from "../data/raw/manifests/hmrc_rti_payroll.json";
import {
  NOT_ANNOUNCED,
  allSeries,
  formatDay,
  lastUpdatedText,
  newerEditionText,
  nextUpdateText,
  sectionIds,
  sectionSeries,
  seriesDates,
} from "../src/lib/section-dates";

const BANNED = [/\u2014/, /\u2013/, / - /, /&mdash;|&ndash;/, /\bn\/a\b/];
const ISO = /^\d{4}-\d{2}-\d{2}$/;
const template = fs.readFileSync("src/pages/places/[slug].astro", "utf8");

const longDate = (text: string) => {
  const m = /(\d{1,2}) ([A-Z][a-z]+) (\d{4})/.exec(text);
  if (!m) return null;
  return new Date(`${m[2]} ${m[1]}, ${m[3]} UTC`).toISOString().slice(0, 10);
};

describe("every place-page section carries a dates line", () => {
  const railIds = [...template.matchAll(/\{ id: "([a-z-]+)", label:/g)].map((m) => m[1]);

  it("the register covers every section in the page rail, and no other", () => {
    expect(railIds.length).toBeGreaterThan(20);
    expect(sectionIds().sort()).toEqual([...railIds].sort());
  });

  it("the template renders the line in every section", () => {
    for (const id of railIds) {
      expect(template, id).toContain(`<SectionDates section="${id}"`);
    }
  });

  it("the projection envelope line is England only, as the ONS projections are", () => {
    expect(template).toContain(`omit={[area.countryName !== "England" && "ons-snpp"]}`);
  });

  it("every omitted series belongs to its section", () => {
    for (const m of template.matchAll(/<SectionDates section="([a-z-]+)" omit=\{\[([\s\S]*?)\]\} \/>/g)) {
      const ids = sectionSeries(m[1]).map((s) => s.id);
      for (const q of m[2].matchAll(/"([a-z0-9-]+)"/g)) {
        if (q[1] === "England") continue;
        expect(ids, `${m[1]} omits ${q[1]}`).toContain(q[1]);
      }
    }
  });

  it("every series a section names exists", () => {
    for (const id of sectionIds()) expect(sectionSeries(id).length, id).toBeGreaterThan(0);
  });
});

describe("each series states its edition, next release and source", () => {
  it.each(allSeries().map((s) => [s.id, s] as const))("%s", (_id, s) => {
    expect(s.lastUpdated).toMatch(ISO);
    expect(s.editionFrom.length).toBeGreaterThan(10);
    expect(s.sourceUrl).toMatch(/^(https:\/\/|\/)/);
    if (s.newerEdition) {
      expect(s.newerEdition.published > s.lastUpdated, "newer edition is later").toBe(true);
      expect(s.newerEdition.url).toMatch(/^https:\/\//);
      expect(s.newerEdition.accessed).toMatch(ISO);
      for (const re of BANNED) expect(newerEditionText(s)!).not.toMatch(re);
    }
    for (const text of [s.label, s.lastUpdatedNote ?? "", lastUpdatedText(s), nextUpdateText(s)]) {
      for (const re of BANNED) expect(text, text).not.toMatch(re);
    }
    if (s.next) {
      expect(["confirmed", "provisional", "month only", "season only", "period only"]).toContain(s.next.status);
      expect(s.next.url).toMatch(/^https:\/\//);
      expect(s.next.accessed).toMatch(ISO);
      // The stated date is the publisher's own words, so it appears in the quote.
      expect(s.next.quote.toLowerCase()).toContain(s.next.stated.toLowerCase().replace(/^\d{1,2} /, ""));
      if (s.next.isoDate) {
        expect(s.next.isoDate).toMatch(ISO);
        expect(s.next.isoDate > s.lastUpdated, "next release after the edition shown").toBe(true);
        expect(formatDay(s.next.isoDate)).toBe(s.next.stated);
      } else {
        expect(s.next.status).not.toBe("confirmed");
      }
      expect(nextUpdateText(s)).toContain(s.next.stated);
    } else {
      expect(nextUpdateText(s)).toBe(NOT_ANNOUNCED);
      expect(s.nextChecked?.url).toMatch(/^https:\/\//);
      expect(s.nextChecked?.accessed).toMatch(ISO);
    }
  });
});

describe("edition dates agree with the manifests and data files the site keeps", () => {
  it("ONS mid-year estimates: the workbook cover sheet", () => {
    const s = seriesDates("ons-mye");
    expect(s.lastUpdated).toBe(longDate((mye as any).source.published));
    expect((mye as any).source.nextPublication.toLowerCase()).toContain(s.next!.stated.toLowerCase());
  });
  it("this site's projection: ethnic-projections.json", () => {
    expect(seriesDates("ukd-projection").lastUpdated).toBe((projections as any).lastUpdated);
  });
  it("the exposure score: fiscal-resilience.json", () => {
    expect(seriesDates("ukd-exposure-score").lastUpdated).toBe((pressure as any).lastUpdated);
  });
  it("police recorded crime: the dataset page date in the manifest", () => {
    expect(seriesDates("ons-pfa-crime").lastUpdated).toBe(longDate((pfa as any).current.pageReleaseDate));
    expect(seriesDates("ons-pfa-crime").lastUpdated).toBe((crime as any).lastUpdated);
  });
  it("Home Office immigration statistics: the manifest release date", () => {
    expect(seriesDates("ho-visas").lastUpdated).toBe((homeOffice as any).releaseDate);
  });
  it("DfE pupil characteristics: the manifest release", () => {
    expect(seriesDates("dfe-spc").lastUpdated).toBe((spc as any).release.lastUpdated);
    expect(seriesDates("dfe-spc").lastUpdatedNote).toContain(formatDay((spc as any).release.published));
  });
  it("DfE special educational needs: send-dashboard.json", () => {
    expect(seriesDates("dfe-sen").lastUpdated).toBe((send as any).lastUpdated);
  });
  it("Council Taxbase: council-tax-spd.json", () => {
    expect(seriesDates("mhclg-ctb").lastUpdated).toBe((ctb as any).lastUpdated);
    expect(seriesDates("mhclg-ctb").lastUpdatedNote).toContain(formatDay((ctb as any).firstPublished));
  });
  it("HMRC payrolled employments: the manifest release", () => {
    expect(seriesDates("hmrc-payroll").lastUpdated).toBe((payroll as any).release.lastUpdated);
  });
});

describe("register counts", () => {
  it("records, for the PR, how many series have a published next date", () => {
    const all = allSeries();
    const stated = all.filter((s) => s.next);
    expect(stated.length + all.filter((s) => !s.next).length).toBe(all.length);
    expect(Object.keys((calendar as any).series).length).toBe(all.length);
  });
});
