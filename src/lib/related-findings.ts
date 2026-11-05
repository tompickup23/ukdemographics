/**
 * Which findings a place page offers as "related" (audit of 3 November 2026).
 *
 * The block used to fall back to the newest composition and migration pieces, so
 * Bristol was offered a piece headlined on Birmingham and another on Blackburn. The
 * order now is:
 *
 *   1. findings that name this place (its ONS name, plain name, other names or code),
 *      those that name it in the lead before those that name it only in the body;
 *   2. findings that name the county council area or the region it sits in;
 *   3. findings whose category matches a section this page renders;
 *   4. anything else, newest first.
 *
 * Whatever the tier, a finding whose lead (the headline and the first sentence of the
 * summary) names another place, county or region, and none of this place, its county
 * or its region, is never offered: it is about somewhere else. The lead, not the body,
 * because national pieces name places as examples further down ("not a London story:
 * Bolton, Pendle, Oldham"), while a piece about one place says so at the top
 * ("Burnley Census 2021 RM021: ...", "Eight of the ten councils ... are Lancashire
 * districts"). Country names (England, Wales, Scotland, Northern Ireland) are
 * national, not a place, so they never rule a finding out.
 *
 * tests/related-findings.test.ts runs this for Bristol, Burnley and a district that no
 * finding names.
 */
import rawProjections from "../data/live/ethnic-projections.json";
import { publicCounties } from "./counties";
import { alternateNames, plainPlaceName } from "./place-names";

export interface FindingInput {
  /** Collection id, with or without the .md extension. */
  id: string;
  headline: string;
  summary: string;
  body: string;
  category: string;
  date: string;
  updated?: string;
}

export interface PlaceContext {
  code: string;
  /** The ONS name ("Bristol, City of"). */
  name: string;
  regionName?: string | null;
  countyName?: string | null;
  /** Section ids the page renders, e.g. "asc", "schools". */
  sections: Iterable<string>;
}

export interface RelatedFinding {
  href: string;
  headline: string;
  /** 1 names the place, 2 its county or region, 3 a matching section, 4 recency. */
  tier: 1 | 2 | 3 | 4;
}

/** The place page section each finding category corresponds to. Fertility has no section. */
export const CATEGORY_SECTION: Record<string, string | null> = {
  demographics: "ethnic-composition",
  projections: "ethnic-composition",
  validation: "ethnic-composition",
  migration: "nino",
  schools: "schools",
  housing: "housing",
  health: "health-ethnic",
  crime: "crime",
  "social-care": "asc",
  send: "send",
  fertility: null
};

const COUNTRIES = new Set(["England", "Wales", "Scotland", "Northern Ireland", "Unknown"]);
const REGIONS = [
  "East Midlands", "East of England", "London", "North East", "North West",
  "South East", "South West", "West Midlands", "Yorkshire and The Humber"
];

const areas = (rawProjections as unknown as { areas: Record<string, { areaName: string }> }).areas;
const escapeRegExp = (t: string) => t.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/**
 * The names a piece might use for a council: the ONS name, the plain name, the other
 * recorded names, and for a joined name the first town ("Blackburn" for "Blackburn
 * with Darwen", "Brighton" for "Brighton and Hove").
 */
export function placeNames(code: string): string[] {
  const ons = areas[code]?.areaName;
  if (!ons) return [code];
  const names = new Set([ons, plainPlaceName(code, ons), ...alternateNames(code)]);
  const first = ons.split(/ with | and |, /)[0];
  if (first !== ons && first.length > 3) names.add(first);
  return [...names];
}

/** Case sensitive, whole word: "Derby" does not match "Derbyshire", "Bury" does not match "bury". */
const mentions = (text: string, name: string) =>
  new RegExp(`(^|[^A-Za-z])${escapeRegExp(name)}([^A-Za-z]|$)`).test(text);
const mentionsAny = (text: string, names: string[]) => names.some((n) => mentions(text, n));

/** Every place, county and region name, each with the codes it can stand for. */
const subjectIndex: Array<{ name: string; key: string }> = [
  ...Object.keys(areas).flatMap((code) => placeNames(code).map((name) => ({ name, key: `place:${code}` }))),
  ...publicCounties.map((c) => ({ name: c.name, key: `county:${c.name}` })),
  ...REGIONS.map((r) => ({ name: r, key: `region:${r}` }))
];

/** The headline and the summary's first sentence: where a piece says what it is about. */
export const findingLead = (f: Pick<FindingInput, "headline" | "summary">): string =>
  `${f.headline} ${f.summary.split(/(?<=[.!?])\s+/)[0] ?? ""}`;

/** The places, counties and regions a lead names, as place:CODE, county:Name, region:Name. Empty for a national piece. */
export function leadSubjects(lead: string): Set<string> {
  return new Set(subjectIndex.filter((s) => mentions(lead, s.name)).map((s) => s.key));
}

const newest = (f: FindingInput) => f.updated ?? f.date;
const slug = (id: string) => id.replace(/\.md$/, "");

export function relatedFindings(findings: FindingInput[], place: PlaceContext, max = 3): RelatedFinding[] {
  const names = [...placeNames(place.code), place.code];
  const region = place.regionName && !COUNTRIES.has(place.regionName) ? place.regionName : null;
  const sections = new Set(place.sections);
  const own = new Set([`place:${place.code}`, ...(place.countyName ? [`county:${place.countyName}`] : []), ...(region ? [`region:${region}`] : [])]);

  return findings
    .filter((f) => {
      const subjects = leadSubjects(findingLead(f));
      return subjects.size === 0 || [...subjects].some((s) => own.has(s));
    })
    .map((f) => {
      const text = `${f.headline} ${f.summary} ${f.body}`;
      const section = CATEGORY_SECTION[f.category] ?? null;
      const tier: RelatedFinding["tier"] = mentionsAny(text, names) ? 1
        : (place.countyName && mentions(text, place.countyName)) || (region && mentions(text, region)) ? 2
        : section && sections.has(section) ? 3
        : 4;
      const lead = tier === 1 && mentionsAny(findingLead(f), names) ? 0 : 1;
      return { f, tier, lead };
    })
    .sort((a, b) => a.tier - b.tier || a.lead - b.lead || newest(b.f).localeCompare(newest(a.f)) || a.f.id.localeCompare(b.f.id))
    .slice(0, max)
    .map(({ f, tier }) => ({ href: `/findings/${slug(f.id)}/`, headline: f.headline, tier }));
}
