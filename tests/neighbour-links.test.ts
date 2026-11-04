/**
 * NeighbourLinks (audit of 3 November 2026): every link resolves to a page the build
 * makes, no page lists itself, and each list is the set its map draws.
 */
import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { countyNeighbourLinks, placeNeighbourLinks, regionNeighbourLinks, type LinkGroup } from "../src/lib/neighbour-links";
import { countyCodes, countyFrame, focusFrame, placeCodes, regionFrame, regionSlugs } from "../src/lib/map/geo";
import { countyPath } from "../src/lib/counties";
import { buildPlacePath, getIndexableSitePaths, getPublicPlaceAreas } from "../src/lib/site";

const built = new Set(getIndexableSitePaths());
const placePaths = new Map(getPublicPlaceAreas().map((a) => [a.areaCode, buildPlacePath(a)]));
// After a build, every link must also exist as a file in dist.
const dist = path.resolve("dist");
const hasDist = fs.existsSync(path.join(dist, "places"));

const links = (groups: LinkGroup[]) => groups.flatMap((g) => g.links);
function resolves(href: string) {
  expect(built.has(href), `${href} is not a page the site builds`).toBe(true);
  if (hasDist) expect(fs.existsSync(path.join(dist, href, "index.html")), `${href} missing from dist`).toBe(true);
}

describe("place pages", () => {
  const codes = placeCodes();

  it("covers every place page", () => {
    expect(codes.length).toBe(placePaths.size);
  });

  it.each(codes)("%s links its map's councils, never itself, and every link resolves", (code) => {
    const ls = links(placeNeighbourLinks(code));
    expect(ls.length).toBeGreaterThan(0);
    expect(ls.map((l) => l.code)).not.toContain(code);
    expect(ls.map((l) => l.href)).not.toContain(placePaths.get(code));
    expect(new Set(ls.map((l) => l.code))).toEqual(new Set(focusFrame(code).members.filter((c) => c !== code)));
    for (const l of ls) {
      expect(l.href).toBe(placePaths.get(l.code));
      resolves(l.href);
    }
  });

  it("names Burnley's bordering councils, A to Z", () => {
    const [g] = placeNeighbourLinks("E07000117");
    expect(g.heading).toBe("Councils that border Burnley");
    expect(g.links.map((l) => l.name)).toEqual([...g.links.map((l) => l.name)].sort((a, b) => a.localeCompare(b)));
    expect(g.links.map((l) => l.name)).toEqual(expect.arrayContaining(["Calderdale", "Hyndburn", "Pendle", "Rossendale"]));
  });

  it("says nearest, not border, for an island with no land border", () => {
    const [g] = placeNeighbourLinks("E06000053");
    expect(g.heading).toBe("Councils nearest to Isles of Scilly");
    expect(g.links.map((l) => l.name)).toContain("Cornwall");
  });
});

describe("county pages", () => {
  it.each(countyCodes().map((c) => [c.name, c.code]))("%s lists its districts and unitaries, and every link resolves", (name, code) => {
    const frame = countyFrame(code);
    const groups = countyNeighbourLinks(code);
    const ls = links(groups);
    expect(new Set(ls.map((l) => l.code))).toEqual(new Set(frame.members));
    expect(groups[0].links.map((l) => l.code).sort()).toEqual([...frame.core].sort());
    expect(ls.map((l) => l.href)).not.toContain(countyPath(name));
    for (const l of ls) resolves(l.href);
  });
});

describe("region pages", () => {
  it.each(regionSlugs().map((r) => [r.name, r.slug]))("%s lists its counties and single tier councils, and every link resolves", (_name, slug) => {
    const members = regionFrame(slug).members;
    const ls = links(regionNeighbourLinks(slug));
    expect(ls.length).toBeGreaterThan(0);
    for (const l of ls) resolves(l.href);
    // Every council in the region is reachable: directly, or through its county page.
    const direct = new Set(ls.map((l) => l.code));
    for (const c of members) {
      const county = countyCodes().find((k) => countyFrame(k.code).core.includes(c));
      expect(direct.has(c) || (!!county && direct.has(county.code)), `${c} unreachable from ${slug}`).toBe(true);
    }
  });
});
