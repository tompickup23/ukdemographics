/**
 * Plain place names and identifiers for the place pages (roadmap R360).
 *
 * ONS names three councils with a suffix ("Bristol, City of"), which is how
 * they appeared in the title and H1. The page now leads with the plain name
 * and gives the council's own name beneath it. Only the title, H1, breadcrumb
 * and structured data name change: the URL, the area code and every figure
 * stay as they were, and the body text keeps the ONS name.
 *
 * Everything here is read from src/data/lookups/place-identities.json, which
 * records where each name and identifier came from and when it was read.
 */
import identities from "../data/lookups/place-identities.json";
import rawProjections from "../data/live/ethnic-projections.json";
import { slugifyAreaName } from "./site";

interface PlainName {
  plainName: string;
  councilName: string | null;
  alternateNames: string[];
}

const ids = identities as unknown as {
  plainNames: Record<string, PlainName>;
  redirects: Record<string, string>;
  areas: Record<string, { wikidata: string; label: string }>;
};
const areaNames = (rawProjections as unknown as { areas: Record<string, { areaName: string }> }).areas;

/** The name a reader would type: "Bristol" for "Bristol, City of". Every other council keeps its ONS name. */
export function plainPlaceName(areaCode: string, onsName: string): string {
  return ids.plainNames[areaCode]?.plainName ?? onsName;
}

/** The council's own name, shown under the H1, where the plain name differs from the ONS name. */
export function councilName(areaCode: string): string | null {
  return ids.plainNames[areaCode]?.councilName ?? null;
}

/** Other names for the area, for schema.org alternateName. Empty where the plain name is the ONS name. */
export function alternateNames(areaCode: string): string[] {
  return ids.plainNames[areaCode]?.alternateNames ?? [];
}

/** The Wikidata item carrying this area's GSS code. */
export function placeSameAs(areaCode: string): string[] {
  const w = ids.areas[areaCode]?.wikidata;
  return w ? [w] : [];
}

/** Natural URLs that returned 404, each mapped to the page the site builds for that council. */
export function placeRedirects(): Record<string, string> {
  return Object.fromEntries(
    Object.entries(ids.redirects).map(([from, code]) => [from, `/places/${slugifyAreaName(areaNames[code].areaName)}/`])
  );
}
