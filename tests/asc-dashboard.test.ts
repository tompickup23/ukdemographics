import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { dataTablesAttachment, newestEdition, SERIES } from "../scripts/fetch/fetch-dhsc-asc.mjs";

/**
 * Shape and cross-source checks for asc-dashboard.json (DHSC adult social care finance and
 * activity reports, with ONS mid-2025 populations for the rates).
 *
 * No published figure is pinned: the 2025-26 finance edition must pass without editing
 * this file. Each check lives in `problems()` so the planted-error cases below can show
 * it fires; a check that cannot fail is not a check.
 */

const read = (p: string) => JSON.parse(fs.readFileSync(path.resolve(p), "utf8"));
const asc = read("src/data/live/asc-dashboard.json");
const manifests = {
  grossSpendPerCapita: read("data/raw/manifests/dhsc_asc_finance.json"),
  residentialRatePer10k65: read("data/raw/manifests/dhsc_asc_activity.json"),
};
const site = read("src/data/live/ethnic-projections.json").areas as Record<string, any>;
const pe = read("src/data/live/population-estimates.json");
const lookup = read("src/data/lookups/district-to-utla.json").districts as Record<string, any>;

const DASHES = /[–—]| - |&mdash;|&ndash;/;
const PERIOD = /^(\d{4})-(\d{2})$/;
const CASSR = /^E(06|08|09|10)\d{6}$/;

/** ONS mid-2025 18+ and 65+ for a CASSR: direct, or the sum of a county's districts. */
function onsPopulation(code: string): [number, number] | null {
  const bands = (a: any): [number, number] => [a.ageBands["18-64"] + a.ageBands["65+"], a.ageBands["65+"]];
  if (pe.areas[code]) return bands(pe.areas[code]);
  const districts = Object.entries(lookup).filter(([, v]) => v.countyCode === code).map(([k]) => k);
  if (!districts.length || districts.some((d) => !pe.areas[d])) return null;
  return districts.map((d) => bands(pe.areas[d])).reduce((s, b) => [s[0] + b[0], s[1] + b[1]], [0, 0]);
}

function problems(d: any): string[] {
  const out: string[] = [];
  const say = (m: string) => out.push(m);

  // Provenance: each measure names the file it was read from, by hash, and its own period.
  if (!/^\d{4}-\d{2}-\d{2}$/.test(d.lastUpdated ?? "")) say("lastUpdated is not an ISO date");
  for (const key of ["source", "methodology", "caveat", "populationSource"]) {
    if (!d[key]) say(`${key} is empty`);
    if (DASHES.test(d[key] ?? "")) say(`${key} carries a dash`);
  }
  if (!String(d.populationSource).includes(pe.source.title)) say("populationSource does not name the population file");
  for (const [key, manifest] of Object.entries(manifests)) {
    const m = d.measures?.[key];
    if (!m) { say(`no measure ${key}`); continue; }
    if (m.fileSha256 !== manifest.current?.fileSha256) say(`${key} file is not the manifest's current file`);
    if (m.fileName !== manifest.current?.fileName) say(`${key} file name is not the manifest's`);
    const p = String(m.period).match(PERIOD);
    if (!p || Number(p[2]) !== (Number(p[1]) + 1) % 100) say(`${key} period ${m.period} is not one financial year`);
    const long = p ? `${p[1]} to ${Number(p[1]) + 1}` : "?";
    if (!String(m.edition).includes(long)) say(`${key} edition does not match its period`);
    if (!String(d.source).includes(long)) say(`source does not name the ${key} period`);
    for (const f of ["label", "counts", "numerator", "denominator", "status", "check"]) {
      if (!m[f]) say(`${key} has no ${f}`);
      if (DASHES.test(m[f] ?? "")) say(`${key} ${f} carries a dash`);
    }
    if (m.pageUpdated > d.lastUpdated) say(`${key} page update is later than lastUpdated`);
  }
  if (DASHES.test(d.measures?.residentialRatePer10k65?.revisionNotice?.note ?? "")) say("revision notice carries a dash");

  // Areas: every CASSR is a site area or a county in the district lookup, and every place
  // page has a figure, directly or through its county.
  const areas = Object.entries(d.areas ?? {}) as [string, any][];
  if (areas.length < 150) say(`only ${areas.length} CASSRs`);
  const counties = new Set(Object.values(lookup).map((v: any) => v.countyCode));
  for (const [code, a] of areas) {
    if (!CASSR.test(code)) say(`${code} is not an English upper tier code`);
    if (!site[code] && !counties.has(code)) say(`${code} is neither a site area nor a county`);
    if (site[code] && a.areaName !== site[code].areaName) say(`${code} name ${a.areaName} differs from the site's`);
    if (a.grossSpendPeriod !== d.measures?.grossSpendPerCapita?.period) say(`${code} spend period differs from the measure's`);
    if (a.residentialPeriod !== d.measures?.residentialRatePer10k65?.period) say(`${code} residential period differs from the measure's`);
    if (a.qualityOfLifeScore !== null || a.dtocDaysAnnual !== null) say(`${code} carries a figure with no source`);

    // Denominators are the ONS mid-2025 bands for the area, counties summed from districts.
    const ons = onsPopulation(code);
    if (!ons) { say(`${code} has no ONS mid-2025 population`); continue; }
    if (a.population18Plus !== ons[0] || a.population65Plus !== ons[1]) say(`${code} populations are not ONS mid-2025`);
    // ...and agree with the ONS mid-2024 figures DHSC published beside its own tables.
    // A wrong join (a district for a county, a shifted row) is far outside 10%.
    for (const [ours, theirs, band] of [[a.population18Plus, a.dhscPopulation18Plus, "18+"], [a.population65Plus, a.dhscPopulation65Plus, "65+"]]) {
      if (theirs && Math.abs(ours / theirs - 1) > 0.1) say(`${code} ${band} population is ${(ours / theirs).toFixed(2)}x DHSC's`);
    }

    // Each rate follows from its own count and denominator.
    if (!(a.grossCurrentExpenditureThousands > 0)) say(`${code} has no spend`);
    else if (a.grossSpendPerCapita !== Math.round((a.grossCurrentExpenditureThousands * 1000) / a.population18Plus)) {
      say(`${code} spend per adult does not follow from spend and population`);
    }
    if (a.residentialClients65 == null) {
      if (a.residentialRatePer10k65 !== null) say(`${code} has a rate with no count`);
      if (!["[c]", "[x]", "[z]"].includes(a.residentialClients65Marker)) say(`${code} lacks a suppression marker`);
    } else if (a.residentialRatePer10k65 !== Math.round((a.residentialClients65 / a.population65Plus) * 10000)) {
      say(`${code} residential rate does not follow from count and population`);
    }
  }

  // Cross-source: the England row of each table against the sum of the CASSR rows.
  const e = d.england ?? {};
  const spendSum = areas.reduce((s, [, a]) => s + (a.grossCurrentExpenditureThousands ?? 0), 0);
  // Finance is published unrounded; allow GBP 500 per CASSR in case a later edition rounds to thousands.
  if (!(Math.abs(spendSum - e.grossCurrentExpenditureThousands) <= 0.5 * areas.length)) {
    say(`sum of CASSR spend ${spendSum.toFixed(0)} is not England's ${e.grossCurrentExpenditureThousands}`);
  }
  // Activity counts are rounded to the nearest 5 and small cells suppressed, so allow 5 per CASSR.
  const resSum = areas.reduce((s, [, a]) => s + (a.residentialClients65 ?? 0), 0);
  if (!(Math.abs(resSum - e.residentialClients65) <= 5 * areas.length)) {
    say(`sum of CASSR residential clients ${resSum} is not England's ${e.residentialClients65}`);
  }
  const popSum = areas.reduce((s, [, a]) => s + a.population18Plus, 0);
  if (popSum !== e.population18Plus) say(`CASSR 18+ populations sum to ${popSum}, not England's ${e.population18Plus}`);
  return out;
}

const clone = () => JSON.parse(JSON.stringify(asc));

describe("asc-dashboard.json", () => {
  it("passes every shape and cross-source check", () => {
    expect(problems(asc)).toEqual([]);
  });

  it("gives every district place page its county's figures", () => {
    for (const [district, entry] of Object.entries(lookup)) {
      if (site[district]) expect(asc.areas[entry.countyCode], `${district} -> ${entry.countyCode}`).toBeTruthy();
    }
    for (const code of Object.keys(site).filter((c) => /^E0[689]/.test(c))) {
      expect(asc.areas[code], code).toBeTruthy();
    }
  });

  it("labels each measure with its own year", () => {
    const fin = asc.measures.grossSpendPerCapita.period;
    const act = asc.measures.residentialRatePer10k65.period;
    for (const a of Object.values(asc.areas) as any[]) {
      expect(a.period).toBe(fin === act ? fin : `finance ${fin}, activity ${act}`);
    }
  });

  describe("fires on planted errors", () => {
    const planted: [string, (d: any) => void, RegExp][] = [
      ["a CASSR's spend changed by 1%", (d) => { const a = d.areas.E08000025; a.grossCurrentExpenditureThousands *= 1.01; a.grossSpendPerCapita = Math.round(a.grossCurrentExpenditureThousands * 1000 / a.population18Plus); }, /sum of CASSR spend/],
      ["a county given one district's population", (d) => { const a = d.areas.E10000017; a.population18Plus = 80000; a.grossSpendPerCapita = Math.round(a.grossCurrentExpenditureThousands * 1000 / 80000); }, /E10000017 populations are not ONS|E10000017 18\+ population/],
      ["a CASSR dropped", (d) => { delete d.areas.E06000008; }, /sum of CASSR spend/],
      ["a residential count moved", (d) => { d.areas.E08000025.residentialClients65 += 2000; }, /residential rate does not follow|residential clients/],
      ["a rate kept after suppression", (d) => { d.areas.E09000001.residentialClients65 = null; d.areas.E09000001.residentialClients65Marker = "[c]"; }, /has a rate with no count/],
      ["a stale period on an area", (d) => { d.areas.E06000001.grossSpendPeriod = "2023-24"; }, /spend period differs/],
      ["a period that is not a year", (d) => { d.measures.grossSpendPerCapita.period = "2024-26"; }, /not one financial year/],
      ["a file that is not the manifest's", (d) => { d.measures.residentialRatePer10k65.fileSha256 = "0".repeat(64); }, /not the manifest's current file/],
      ["a typed quality score", (d) => { d.areas.E06000001.qualityOfLifeScore = 19.1; }, /figure with no source/],
      ["an unknown code", (d) => { d.areas.E07000117 = { ...d.areas.E10000017 }; }, /not an English upper tier code/],
      ["a dash in the caveat", (d) => { d.caveat += " – note"; }, /caveat carries a dash/],
    ];
    for (const [name, plant, expected] of planted) {
      it(name, () => {
        const d = clone();
        plant(d);
        expect(problems(d).join("\n")).toMatch(expected);
      });
    }
  });
});

describe("fetch-dhsc-asc edition discovery", () => {
  const finance = SERIES.find((s) => s.dataset === "dhsc_asc_finance")!;
  const activity = SERIES.find((s) => s.dataset === "dhsc_asc_activity")!;
  const result = (title: string, link: string, ts = "2025-10-23T08:30:00Z") => ({ title, link, public_timestamp: ts });
  const today = [
    result("Adult social care finance report, England: 2024 to 2025", "/government/statistics/adult-social-care-finance-report-england-2024-to-2025"),
    result("Adult social care finance report, England: 2025 to 2026", "/government/statistics/announcements/adult-social-care-finance-report-england-2025-to-2026"),
    result("Adult social care activity report, England: 2024 to 2025", "/government/statistics/adult-social-care-activity-report-england-2024-to-2025"),
    result("Adult social care activity report, England: 2025 to 2026", "/government/statistics/announcements/adult-social-care-activity-report-england-2025-to-2026"),
  ];

  it("takes the newest published edition and never an announcement", () => {
    expect(newestEdition(today, finance.editionTitle)?.endYear).toBe(2025);
    expect(newestEdition(today, activity.editionTitle)?.endYear).toBe(2025);
  });

  it("moves finance to 2025-26 when published while activity stays at 2024-25", () => {
    const after = [...today, result("Adult social care finance report, England: 2025 to 2026", "/government/statistics/adult-social-care-finance-report-england-2025-to-2026", "2026-10-22T08:30:00Z")];
    expect(newestEdition(after, finance.editionTitle)?.link).toBe("/government/statistics/adult-social-care-finance-report-england-2025-to-2026");
    expect(newestEdition(after, activity.editionTitle)?.endYear).toBe(2025);
  });

  it("picks the data tables, not the net current expenditure tables", () => {
    const attachments = [
      { title: "Adult social care finance report, England: 2024 to 2025 - data tables", url: "https://assets.publishing.service.gov.uk/media/a/x-data-tables.ods" },
      { title: "Adult social care finance report, England: 2024 to 2025 - net current expenditure data tables", url: "https://assets.publishing.service.gov.uk/media/b/y-nce.ods" },
      { title: "Adult social care finance report, England: 2024 to 2025 - data pack", url: "https://assets.publishing.service.gov.uk/media/c/z.zip" },
    ];
    expect(dataTablesAttachment(attachments, finance.attachmentTitle, finance.excludeTitle).url).toContain("x-data-tables");
    expect(() => dataTablesAttachment(attachments.slice(1), finance.attachmentTitle, finance.excludeTitle)).toThrow(/found 0/);
  });
});
