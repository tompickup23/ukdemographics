/**
 * Links from one area page to the area pages next to it (audit of 3 November 2026).
 *
 * A place page drew its neighbouring councils on the map and linked to none of them.
 * These lists come from the same sets the maps draw, never from name similarity or a
 * hand list:
 *
 * A place: focusFrame() in src/lib/map/geo.ts, the councils that share a boundary
 *   with it (or, for an island with no land border, the nearest councils, and the
 *   heading says so);
 * A county: countyFrame(), the districts in the county council area and the
 *   unitaries in the ceremonial county, kept apart as the county map keeps them;
 * A region: regionFrame(), split into the county council areas that hold its
 *   districts and the single tier councils outside any county council area.
 *
 * tests/neighbour-links.test.ts checks every link resolves to a built page and that no
 * page lists itself.
 */
import { countyForDistrict, countyPath, publicCounties } from "./counties";
import { areaName, countyFrame, focusFrame, regionFrame } from "./map/geo";
import { buildPlacePath } from "./site";
import { plainPlaceName } from "./place-names";

export interface AreaLink {
  /** ONS code of the council or county council area linked to. */
  code: string;
  name: string;
  href: string;
}

export interface LinkGroup {
  heading: string;
  links: AreaLink[];
}

const byName = (a: AreaLink, b: AreaLink) => a.name.localeCompare(b.name);
/** Link text is the plain name the H1 uses ("Bristol"); the path is built from the ONS name, as the page's is. */
const placeLink = (code: string): AreaLink => {
  const ons = areaName(code);
  return { code, name: plainPlaceName(code, ons), href: buildPlacePath({ areaCode: code, areaName: ons }) };
};

/** The councils a place page's map draws beside it, as links, A to Z. */
export function placeNeighbourLinks(code: string): LinkGroup[] {
  const frame = focusFrame(code);
  const links = frame.members.filter((c) => c !== code).map(placeLink).sort(byName);
  if (!links.length) return [];
  const name = plainPlaceName(code, areaName(code));
  const heading = frame.relation === "nearby" ? `Councils nearest to ${name}` : `Councils that border ${name}`;
  return [{ heading, links }];
}

/** The councils a county map draws: districts first, then the unitaries in the ceremonial county. */
export function countyNeighbourLinks(countyCode: string): LinkGroup[] {
  const frame = countyFrame(countyCode);
  const groups: LinkGroup[] = [{ heading: `District councils in ${frame.name}`, links: frame.core.map(placeLink).sort(byName) }];
  if (frame.extras.length) {
    groups.push({ heading: `Unitary councils in ceremonial ${frame.name}`, links: frame.extras.map(placeLink).sort(byName) });
  }
  return groups.filter((g) => g.links.length);
}

/** The county council areas in a region, then the councils in it that sit in no county council area. */
export function regionNeighbourLinks(regionSlug: string): LinkGroup[] {
  const frame = regionFrame(regionSlug);
  const countyCodes = new Set(frame.members.map((c) => countyForDistrict(c)?.countyCode).filter((c): c is string => !!c));
  const counties = publicCounties
    .filter((c) => countyCodes.has(c.code))
    .map((c) => ({ code: c.code, name: c.name, href: countyPath(c.name) }))
    .sort(byName);
  const singleTier = frame.members.filter((c) => !countyForDistrict(c)).map(placeLink).sort(byName);
  return [
    { heading: `County council areas in ${frame.name}`, links: counties },
    { heading: counties.length ? `Councils in ${frame.name} outside a county council area` : `Councils in ${frame.name}`, links: singleTier }
  ].filter((g) => g.links.length);
}
