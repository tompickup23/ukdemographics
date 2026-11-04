/**
 * Plain-words comparisons beside the place page's headline figures (roadmap
 * R504): "about 2 points above the North West".
 *
 * Arithmetic only, on figures the site already holds. The region and England
 * (or Wales) figures are sums of the council figures in ethnic-projections.json,
 * which carries Census 2011 KS201EW and Census 2021 TS021 counts for all 318
 * councils (the eleven councils formed since 2011 as exact sums of their 2011
 * districts). They are not separate ONS releases, and the line on the page says
 * so. Census 2021 counts are published after statistical disclosure control, so
 * a sum of council counts can differ by a few people from ONS's own regional
 * table.
 *
 * Only observed figures are compared. The projected cards are left alone: a
 * regional projection would be a new modelled figure the site does not publish.
 */
import rawProjections from "../data/live/ethnic-projections.json";
import cobChange from "../data/live/country-of-birth-change-2011-2021.json";
import { getPublicPlaceAreas } from "./site";

interface CensusSide {
  year: number;
  total_population: number;
  groups_absolute: Record<string, number>;
}

const projections = rawProjections as unknown as {
  areas: Record<string, { areaName: string; baseline: CensusSide; current: CensusSide }>;
};
const cob = cobChange as unknown as { areas: Record<string, { populationChangePct?: number | null }> };

export interface Totals {
  name: string;
  /** Councils summed. */
  councils: number;
  population2011: number;
  population2021: number;
  whiteBritish2021: number;
}

/** "the North West", "the East of England", but "London", "Wales", "England". */
export function withArticle(name: string): string {
  return /^(North|South|East|West)\b/.test(name) ? `the ${name}` : name;
}

function emptyTotals(name: string): Totals {
  return { name, councils: 0, population2011: 0, population2021: 0, whiteBritish2021: 0 };
}

let cache: { region: Map<string, Totals>; country: Map<string, Totals>; regionOf: Map<string, string>; countryOf: Map<string, string> } | null = null;

/** Sums of the council figures by region and by country. Regions of "Unknown" are not summed. */
export function comparisonTotals() {
  if (cache) return cache;
  const region = new Map<string, Totals>();
  const country = new Map<string, Totals>();
  const regionOf = new Map<string, string>();
  const countryOf = new Map<string, string>();
  for (const area of getPublicPlaceAreas()) {
    const a = projections.areas[area.areaCode];
    if (!a?.baseline?.total_population || !a.current?.total_population) continue;
    const add = (map: Map<string, Totals>, name: string) => {
      const t = map.get(name) ?? emptyTotals(name);
      t.councils += 1;
      t.population2011 += a.baseline.total_population;
      t.population2021 += a.current.total_population;
      t.whiteBritish2021 += a.current.groups_absolute.white_british;
      map.set(name, t);
    };
    if (area.regionName && area.regionName !== "Unknown") {
      add(region, area.regionName);
      regionOf.set(area.areaCode, area.regionName);
    }
    add(country, area.countryName);
    countryOf.set(area.areaCode, area.countryName);
  }
  cache = { region, country, regionOf, countryOf };
  return cache;
}

export const growthPct = (t: Pick<Totals, "population2011" | "population2021">) =>
  (t.population2021 / t.population2011 - 1) * 100;
export const whiteBritishPct = (t: Pick<Totals, "population2021" | "whiteBritish2021">) =>
  (t.whiteBritish2021 / t.population2021) * 100;

/**
 * "about 2 points above", "about 1 point below", "about the same as".
 * Differences under half a point read as the same; a half point rounds up.
 * The gap is counted in whole tenths first, because the figures it compares
 * are printed to one decimal and floating point puts 8.7 minus 5.2 just under
 * 3.5.
 */
export function relation(diffPoints: number): string {
  const tenths = Math.abs(Math.round(diffPoints * 10));
  const n = Math.floor((tenths + 5) / 10);
  if (n === 0) return "about the same as";
  return `about ${n} point${n === 1 ? "" : "s"} ${diffPoints > 0 ? "above" : "below"}`;
}

/** The parents a council is compared with: its region and its country, or only Wales for a Welsh council. */
function parents(areaCode: string): Totals[] {
  const { region, country, regionOf, countryOf } = comparisonTotals();
  const out: Totals[] = [];
  const r = regionOf.get(areaCode);
  const c = countryOf.get(areaCode);
  if (r && r !== c && region.has(r)) out.push(region.get(r)!);
  if (c && country.has(c)) out.push(country.get(c)!);
  return out;
}

/** One decimal place, as every percentage on the page is printed. */
const shown = (n: number) => Number(n.toFixed(1));

/**
 * The gap is taken between the figures as printed, the council's own and the
 * parent's in brackets, so a reader who subtracts one from the other gets the
 * gap the sentence states.
 */
function phrase(local: number, refs: Array<{ t: Totals; v: number }>): string {
  return refs.map(({ t, v }) => `${relation(shown(local) - shown(v))} ${withArticle(t.name)} (${v.toFixed(1)}%)`).join(" and ");
}

export interface PlaceComparison {
  /** The sentence shown beside the figure. */
  text: string;
}

/**
 * Growth since 2011, beside the population card. The council's own growth is
 * the figure the direct-answer paragraph prints (Census 2011 KS204EW and 2021
 * TS012 totals), so the line only appears where that paragraph states one and
 * the page never shows a change it elsewhere says it does not hold.
 */
export function populationGrowthComparison(areaCode: string): PlaceComparison | null {
  const a = projections.areas[areaCode];
  const local = cob.areas[areaCode]?.populationChangePct;
  if (!a?.baseline?.year || local == null) return null;
  const refs = parents(areaCode).map((t) => ({ t, v: growthPct(t) }));
  if (refs.length === 0) return null;
  return { text: `Growth since ${a.baseline.year}: ${phrase(local, refs)}.` };
}

/**
 * The 2021 Census White British share, beside the card that shows it. The
 * council's figure is the card's own value, census_groups.white_british.
 */
export function whiteBritishComparison(areaCode: string): PlaceComparison | null {
  const a = projections.areas[areaCode] as any;
  const local = (a?.current?.census_groups ?? a?.current?.groups)?.white_british;
  if (local == null) return null;
  const refs = parents(areaCode).map((t) => ({ t, v: whiteBritishPct(t) }));
  if (refs.length === 0) return null;
  return { text: `${phrase(local, refs).replace(/^a/, "A")}.` };
}

export const COMPARISON_NOTE =
  "Comparisons are this site's arithmetic: each region and country figure is the sum of its councils' Census 2011 (KS201EW) and Census 2021 (TS021) counts on this site, not a separate ONS figure.";
