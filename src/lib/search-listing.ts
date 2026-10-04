/**
 * Search listing copy: titles, meta descriptions and the opening text of the
 * place, region and constituency pages.
 *
 * Every number here is read from a data file. Years included: the Census year
 * comes from the projection file's base, the projection horizon from the
 * plausibility guard, the arrivals start year from the NINo series and the
 * profile date from the projection file's lastUpdated. Nothing is typed.
 *
 * The place listing test (control, A, B) is documented in listing-arm.ts and
 * docs/seo/README.md. Control copy stays in the page template, exactly as it
 * was before the test, so this module only builds the two new arms.
 */
import rawProjections from "../data/live/ethnic-projections.json";
import cobChange from "../data/live/country-of-birth-change-2011-2021.json";
import rawPcon from "../data/live/pcon-dataset.json";
import type { ListingArm } from "./listing-arm";
import { plausibleThrough } from "./projection-plausibility";

/** The furthest projection year a listing advertises. Later years exist but are not the headline horizon. */
export const LISTING_HORIZON_YEAR = 2051;

export const GROUP_LABELS: Record<string, string> = {
  white_british: "White British",
  white_other: "White Other",
  asian: "Asian",
  black: "Black",
  mixed: "Mixed",
  other: "Other",
};

type Groups = Record<string, number | undefined>;

interface ProjectionArea {
  areaName: string;
  baseline?: { year?: number; groups?: Groups };
  current?: { year?: number; total_population?: number; groups?: Groups };
  projections?: Record<string, Groups>;
}

const projections = rawProjections as unknown as {
  source?: string;
  methodology?: string;
  lastUpdated?: string;
  modelVersion?: string;
  areas: Record<string, ProjectionArea>;
};

const cob = cobChange as unknown as {
  areas: Record<string, {
    population2011?: number;
    population2021?: number;
    populationChangePct?: number | null;
  }>;
};

/** "a", "a and b", "a, b and c". No serial comma, as elsewhere on the site. */
export function joinList(items: string[]): string {
  const xs = items.filter(Boolean);
  if (xs.length <= 1) return xs.join("");
  return `${xs.slice(0, -1).join(", ")} and ${xs[xs.length - 1]}`;
}

/** "2026-08-14" to "August 2026". */
export function formatMonthYear(isoDate: string): string {
  const d = new Date(`${isoDate.slice(0, 10)}T00:00:00Z`);
  return d.toLocaleDateString("en-GB", { month: "long", year: "numeric", timeZone: "UTC" });
}

function pct(n: number): string {
  return `${n.toFixed(1)}%`;
}

function count(n: number): string {
  return n.toLocaleString("en-GB");
}

/** The date the projection data was last revised, as stored in the file. */
export function profileUpdatedDate(): string | null {
  return projections.lastUpdated ?? null;
}

/** The Census year the profiles are built on (the projection base). */
export function censusYear(): number | null {
  const first = Object.values(projections.areas)[0];
  return first?.current?.year ?? null;
}

/**
 * Model name, version and inputs, read from the projection file's own
 * provenance strings. Any part that does not parse is left out rather than
 * guessed.
 */
export function modelProvenance(): { model: string | null; version: string | null; censuses: number[]; envelopeBase: number | null } {
  const methodology = projections.methodology ?? "";
  const source = projections.source ?? "";
  const model = methodology.match(/^([A-Z][A-Za-z]+(?:-[A-Z][A-Za-z]+)*) v\d/)?.[1] ?? null;
  const version = (projections.modelVersion ?? "").match(/^\d+(?:\.\d+)*/)?.[0]
    ?? methodology.match(/ v(\d+(?:\.\d+)*)/)?.[1]
    ?? null;
  const censuses = [...new Set([...source.matchAll(/Census (\d{4})/g)].map((m) => Number(m[1])))].sort();
  const envelopeBase = Number(source.match(/SNPP (\d{4})-based/)?.[1]) || null;
  return { model, version, censuses, envelopeBase };
}

/** The projection year a listing should name for this area, or null if none is publishable. */
export function listingHorizon(areaCode: string): number | null {
  const through = plausibleThrough(projections.areas[areaCode] as any);
  if (through == null) return null;
  return Math.min(through, LISTING_HORIZON_YEAR);
}

function topGroups(groups: Groups | undefined, n: number): Array<[string, number]> {
  return Object.entries(groups ?? {})
    .filter((e): e is [string, number] => typeof e[1] === "number" && e[0] in GROUP_LABELS)
    .sort((a, b) => b[1] - a[1])
    .slice(0, n);
}

function groupList(groups: Array<[string, number]>): string {
  return joinList(groups.map(([g, v]) => `${GROUP_LABELS[g]} (${pct(v)})`));
}

// ---------------------------------------------------------------------------
// Place pages
// ---------------------------------------------------------------------------

/** Which sections of the place page rendered, so the listing never promises one that is missing. */
export interface PlaceCoverage {
  areaName: string;
  censusYear: number | null;
  projectionTo: number | null;
  hasReligion: boolean;
  hasCountryOfBirth: boolean;
  arrivalsSince: number | null;
  hasHousing: boolean;
  hasSchools: boolean;
  hasServices: boolean;
}

export interface PlaceListing {
  title: string;
  description: string;
  summary: string;
}

const SOURCES_CLAUSE = "ONS, DWP, DfE and other official statistics";

function populationPhrase(c: PlaceCoverage, counted: boolean): string {
  if (c.censusYear == null) return "population";
  return counted ? `population as counted at the ${c.censusYear} Census` : `population at the ${c.censusYear} Census`;
}

function compositionPhrase(c: PlaceCoverage): string {
  const parts = ["ethnicity", c.hasReligion ? "religion" : "", c.hasCountryOfBirth ? "country of birth" : ""];
  const base = joinList(parts);
  return c.projectionTo != null ? `${base} with projections to ${c.projectionTo}` : base;
}

function coverageTopics(c: PlaceCoverage, counted: boolean): string {
  return joinList([
    populationPhrase(c, counted),
    compositionPhrase(c),
    c.arrivalsSince != null ? `arrivals since ${c.arrivalsSince}` : "",
    c.hasHousing ? "housing" : "",
    c.hasSchools ? "schools" : "",
    c.hasServices ? "services" : "",
  ]);
}

/**
 * Arm A: breadth, no number in the title or description beyond years.
 * Arm B: as A, with the profile's revision year in the title, and the
 * description saying the population is the Census count, so "2026" is not
 * read as a 2026 population estimate.
 * Returns null for the control, whose copy stays in the template.
 */
export function buildPlaceListing(arm: ListingArm, c: PlaceCoverage, updatedIso: string | null): PlaceListing | null {
  if (arm === "control") return null;

  const projectionsTitle = c.projectionTo != null ? `projections to ${c.projectionTo}` : "";

  if (arm === "A" || updatedIso == null) {
    const title = `${c.areaName} demographics: ${joinList([
      "population",
      "ethnicity",
      c.arrivalsSince != null ? "arrivals" : "",
      c.hasHousing ? "housing" : "",
      projectionsTitle,
    ])}`;
    const topics = coverageTopics(c, false);
    return {
      title,
      description: `${c.areaName} in detail: ${topics}. From ${SOURCES_CLAUSE}, with modelled projections labelled as such.`,
      summary: `This profile covers ${topics}, drawn from ${SOURCES_CLAUSE}.`,
    };
  }

  const year = updatedIso.slice(0, 4);
  const updated = formatMonthYear(updatedIso);
  const topics = coverageTopics(c, true);
  return {
    title: `${c.areaName} demographics ${year}: ${joinList(["population", "ethnicity", projectionsTitle])}`,
    description: `Profile updated ${updated}. ${c.areaName} in detail: ${topics}. From ${SOURCES_CLAUSE}.`,
    summary: `Updated ${updated}, this profile covers ${topics}, drawn from ${SOURCES_CLAUSE}.`,
  };
}

/**
 * The direct answer at the top of a place page, 60 to 90 words: the Census
 * population, the three largest ethnic groups with shares, the change since
 * 2011 and one sentence on the projection with its source and model version.
 * Every figure in it is already rendered further down the same page.
 */
export function buildPlaceDirectAnswer(areaCode: string): string | null {
  const area = projections.areas[areaCode];
  const population = area?.current?.total_population;
  const year = area?.current?.year;
  if (!area || !population || !year) return null;

  const sentences: string[] = [];
  const top2021 = topGroups(area.current?.groups, 3);

  // Change since 2011, from the Census population change in the country of
  // birth file. The eleven unitaries formed after 2011 are not in that file and
  // their projection base is 2021, so for them the paragraph says so rather
  // than reaching for a figure on different boundaries.
  const change = cob.areas[areaCode];
  const baseYear = area.baseline?.year;
  const hasPopulationChange = !!(change?.population2011 && change.populationChangePct != null && baseYear);
  let opening = `${area.areaName} had ${count(population)} residents at the ${year} Census`;
  if (hasPopulationChange) {
    const dir = change!.populationChangePct! >= 0 ? "up" : "down";
    opening += `, ${dir} ${pct(Math.abs(change!.populationChangePct!))} from ${count(change!.population2011!)} in ${baseYear}`;
  }
  sentences.push(`${opening}.`);

  if (top2021.length === 3) {
    sentences.push(`The three largest ethnic groups were ${groupList(top2021)}.`);
  }
  const prov = modelProvenance();
  const earlierCensus = prov.censuses.find((y) => y < year);
  if (!hasPopulationChange && earlierCensus) {
    sentences.push(`This site holds no ${earlierCensus} figure for these boundaries, so no change since ${earlierCensus} is shown.`);
  }

  const horizon = listingHorizon(areaCode);
  const projected = horizon != null ? area.projections?.[String(horizon)] : undefined;
  const topProjected = topGroups(projected, 3);
  if (horizon != null && topProjected.length === 3) {
    const inputs: string[] = [];
    if (prov.censuses.length) inputs.push(`projected from the ${joinList(prov.censuses.map(String))} Censuses`);
    if (prov.envelopeBase) inputs.push(`held within the ONS ${prov.envelopeBase}-based subnational population projections`);
    const modelName = prov.model ? `${prov.model} model` : "projection model";
    const version = prov.version ? `version ${prov.version}` : "";
    const detail = [version, ...inputs].filter(Boolean).join(", ");
    sentences.push(
      `This site's ${modelName}${detail ? ` (${detail})` : ""} puts the three largest groups in ${horizon} at ${groupList(topProjected)}.`
    );
    const through = plausibleThrough(area as any);
    if (through != null && through < LISTING_HORIZON_YEAR) {
      sentences.push(`Years after ${through} are withheld for this area because the model stops being plausible there.`);
    }
  } else {
    sentences.push("No projection is published for this area, because the model's first projected decade fails the plausibility check.");
  }

  return sentences.join(" ");
}

// ---------------------------------------------------------------------------
// Region pages (arm A treatment, no test: there are too few to split)
// ---------------------------------------------------------------------------

/** "the North West", "the East of England", but "London", "Wales". */
function regionWithArticle(regionName: string): string {
  return /^(North|South|East|West)\b/.test(regionName) ? `the ${regionName}` : regionName;
}

export function buildRegionListing(regionName: string, projectionTo: number | null): PlaceListing {
  const year = censusYear();
  const region = regionWithArticle(regionName);
  const pop = year != null ? `population at the ${year} Census` : "population";
  const proj = projectionTo != null ? `projections to ${projectionTo}` : "projections";
  return {
    title: `${regionName} demographics: population, ethnicity and projections by local authority`,
    description: `The local authorities of ${region} with ${pop}, ethnicity and ${proj}, each linking to a full profile covering arrivals, housing, schools and services. From ${SOURCES_CLAUSE}.`,
    summary: `The local authorities of ${region}, with ${pop}, ethnicity and ${proj}. Each links to a full profile covering arrivals, housing, schools and services.`,
  };
}

// ---------------------------------------------------------------------------
// Constituency pages
// ---------------------------------------------------------------------------

/** The general election year the constituency results come from, read from the dataset's source line. */
export function generalElectionYear(): number | null {
  const source = (rawPcon as unknown as { source?: string }).source ?? "";
  return Number(source.match(/GE (\d{4})/)?.[1]) || null;
}

export function pconDatasetDate(): string | null {
  const generated = (rawPcon as unknown as { generatedAt?: string }).generatedAt;
  return generated ? generated.slice(0, 10) : null;
}

export function buildConstituencyDescription(
  name: string,
  has: { mp: boolean; pip: boolean; demographics: boolean; localAuthorities: boolean }
): string {
  const ge = generalElectionYear();
  const parts = [
    has.mp ? "the sitting MP" : "",
    ge != null ? `the ${ge} general election result` : "the general election result",
    has.pip ? "PIP claimants" : "",
    has.demographics ? "a demographic snapshot" : "",
    has.localAuthorities ? "the local authorities it covers, with links to their full profiles" : "",
  ];
  return `${name} constituency: ${joinList(parts)}. Sources include the UK Parliament, DWP and ONS.`;
}
