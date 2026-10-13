/**
 * Geometry for the map module: council boundaries, neighbours and frames.
 *
 * Boundaries are ONS Local Authority Districts (May 2026) Boundaries UK BSC, fetched by
 * scripts/fetch/fetch-lad-boundaries.mjs with its source record beside the file. Every UK
 * council is loaded; only the councils with a place page (PLACE_COUNT, keyed as in
 * ethnic-projections.json) are ever given a value or a label. The rest are context.
 *
 * A frame is the set of councils one map shows: a council and the councils that border it
 * (focus), a county, or a region. Frames are derived from lookups, never typed by hand.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { canonicalAreaCode } from "../area-codes";
import { buildPublicPlaceRegionSlug, getPublicPlaceAreas } from "../site";
import rawProjections from "../../data/live/ethnic-projections.json";
import rawCounties from "../../data/lookups/district-to-utla.json";
import rawCeremonial from "../../data/lookups/ceremonial-county-unitaries.json";

export const BOUNDARY_FILE = "data/geography/lad26-uk-bsc.geojson";
export const BOUNDARY_SOURCE_FILE = "data/geography/lad26-uk-bsc.source.json";
export const BOUNDARY_CREDIT =
  "Boundaries: ONS LAD (May 2026) BSC. Contains OS data © Crown copyright and database right 2026.";

type Ring = number[][];
export interface CouncilFeature {
  type: "Feature";
  properties: { LAD26CD: string; LAD26NM: string; code: string };
  geometry: { type: "Polygon"; coordinates: Ring[] } | { type: "MultiPolygon"; coordinates: Ring[][] };
}

// ---------- Winding ----------
// d3-geo is spherical: a ring wound the wrong way is the whole globe minus the shape.
// Exterior rings clockwise in lon/lat, holes anticlockwise (ukelections src/lib/geoRewind.ts).
function ringIsClockwise(ring: Ring): boolean {
  let area = 0;
  for (let i = 0, n = ring.length; i < n; i++) {
    const [x1, y1] = ring[i], [x2, y2] = ring[(i + 1) % n];
    area += x1 * y2 - x2 * y1;
  }
  return area < 0;
}
const rewindRings = (rings: Ring[]): Ring[] =>
  rings.map((ring, i) => (ringIsClockwise(ring) === (i === 0) ? ring : [...ring].reverse()));
function rewind(f: CouncilFeature): CouncilFeature {
  const g = f.geometry;
  const geometry = g.type === "Polygon"
    ? { type: "Polygon" as const, coordinates: rewindRings(g.coordinates) }
    : { type: "MultiPolygon" as const, coordinates: g.coordinates.map(rewindRings) };
  return { ...f, geometry };
}

// ---------- Loading ----------
const PLACE_CODES = new Set(Object.keys((rawProjections as unknown as { areas: Record<string, unknown> }).areas));

let byCode: Map<string, CouncilFeature> | null = null;

/**
 * Every UK council, rewound, keyed by the code this site files the council under.
 * Barnsley and Sheffield come back under E08000016 and E08000019 (see area-codes.ts):
 * the boundary file carries the codes ONS reissued for them in April 2025.
 */
export function loadCouncils(): Map<string, CouncilFeature> {
  if (byCode) return byCode;
  const raw = JSON.parse(readFileSync(join(process.cwd(), BOUNDARY_FILE), "utf8")) as { features: CouncilFeature[] };
  byCode = new Map();
  for (const f of raw.features) {
    const code = canonicalAreaCode(f.properties.LAD26CD);
    byCode.set(code, rewind({ ...f, properties: { ...f.properties, code } }));
  }
  return byCode;
}

/** True when the council has a place page, so may carry a value on a map. */
export const isPlace = (code: string): boolean => PLACE_CODES.has(code);
export const placeCodes = (): string[] => [...PLACE_CODES];

export const polygonsOf = (f: CouncilFeature): Ring[][] =>
  f.geometry.type === "Polygon" ? [f.geometry.coordinates] : f.geometry.coordinates;

export type BBox = [number, number, number, number];
export function bboxOf(f: CouncilFeature): BBox {
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const poly of polygonsOf(f)) for (const [x, y] of poly[0]) {
    if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y;
  }
  return [x0, y0, x1, y1];
}

// ---------- Neighbours ----------
/** About 150 m of latitude: a vertex this close to another council's edge counts as shared boundary. */
export const NEIGHBOUR_TOLERANCE_DEG = 0.0015;

let neighbourMap: Map<string, string[]> | null = null;

/**
 * Councils with a place page that share a boundary with each other: overlapping boxes
 * first, then any vertex of one within the tolerance of an edge of the other. Holes count:
 * South Cambridgeshire surrounds Cambridge, so their shared line is a hole in one of them.
 * Vertex-to-vertex matching is not enough: the generalised (BSC) file keeps different
 * vertices on each side of a shared line, and Cambridge came back with no neighbours.
 * Computed once per pair, testing both directions, so the relation is symmetric.
 */
export function neighbourIndex(): Map<string, string[]> {
  if (neighbourMap) return neighbourMap;
  const geo = loadCouncils(), tol = NEIGHBOUR_TOLERANCE_DEG, cell = 0.02;
  const codes = placeCodes().filter((c) => geo.has(c)).sort();
  const boxes = new Map(codes.map((c) => [c, bboxOf(geo.get(c)!)]));
  // Each council's edges, holes included, bucketed into every grid cell their box spans.
  type Seg = [number, number, number, number];
  const grids = new Map<string, Map<string, Seg[]>>();
  for (const c of codes) {
    const grid = new Map<string, Seg[]>();
    for (const r of polygonsOf(geo.get(c)!).flat()) {
      for (let i = 0; i < r.length - 1; i++) {
        const seg: Seg = [r[i][0], r[i][1], r[i + 1][0], r[i + 1][1]];
        const [gx0, gx1] = [Math.floor((Math.min(seg[0], seg[2]) - tol) / cell), Math.floor((Math.max(seg[0], seg[2]) + tol) / cell)];
        const [gy0, gy1] = [Math.floor((Math.min(seg[1], seg[3]) - tol) / cell), Math.floor((Math.max(seg[1], seg[3]) + tol) / cell)];
        for (let gx = gx0; gx <= gx1; gx++) for (let gy = gy0; gy <= gy1; gy++) {
          const key = `${gx},${gy}`, list = grid.get(key);
          if (list) list.push(seg); else grid.set(key, [seg]);
        }
      }
    }
    grids.set(c, grid);
  }
  const near = (x: number, y: number, [ax, ay, bx, by]: Seg) => {
    const dx = bx - ax, dy = by - ay, L = dx * dx + dy * dy;
    const t = L ? Math.max(0, Math.min(1, ((x - ax) * dx + (y - ay) * dy) / L)) : 0;
    return Math.hypot(x - ax - t * dx, y - ay - t * dy) < tol;
  };
  const touches = (a: string, b: string): boolean => {
    const gb = grids.get(b)!;
    for (const r of polygonsOf(geo.get(a)!).flat()) for (const [x, y] of r) {
      for (const seg of gb.get(`${Math.floor(x / cell)},${Math.floor(y / cell)}`) ?? []) if (near(x, y, seg)) return true;
    }
    return false;
  };
  neighbourMap = new Map(codes.map((c) => [c, [] as string[]]));
  for (let i = 0; i < codes.length; i++) for (let j = i + 1; j < codes.length; j++) {
    const a = boxes.get(codes[i])!, b = boxes.get(codes[j])!;
    if (b[0] > a[2] + tol || b[2] < a[0] - tol || b[1] > a[3] + tol || b[3] < a[1] - tol) continue;
    if (touches(codes[i], codes[j]) || touches(codes[j], codes[i])) {
      neighbourMap.get(codes[i])!.push(codes[j]);
      neighbourMap.get(codes[j])!.push(codes[i]);
    }
  }
  return neighbourMap;
}
export const neighbours = (code: string): string[] => neighbourIndex().get(code) ?? [];

// ---------- Frames ----------
export interface Frame {
  id: string;
  type: "focus" | "group";
  name: string;
  /** Every council drawn with a value and a label. */
  members: string[];
  /** For a county: the districts in the county council area, the only councils in any county total. */
  core: string[];
  /** For a county: unitaries in the ceremonial county, drawn with their own figures, never in the total. */
  extras: string[];
  focus?: string;
  subtitle: string;
  /** A line for the footer, when the frame needs one (the unitaries on a county map). */
  note?: string;
}

const areaNames = new Map(
  Object.entries((rawProjections as unknown as { areas: Record<string, { areaName: string }> }).areas).map(([c, a]) => [c, a.areaName])
);
export const areaName = (code: string): string => areaNames.get(code) ?? loadCouncils().get(code)?.properties.LAD26NM ?? code;
export const slugify = (s: string): string => s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");
const byName = (a: string, b: string) => areaName(a).localeCompare(areaName(b));
const joinNames = (names: string[]): string =>
  names.length <= 1 ? names.join("") : `${names.slice(0, -1).join(", ")} and ${names.at(-1)}`;

/** A council and the councils with a place page that border it. */
export function focusFrame(code: string): Frame {
  if (!isPlace(code)) throw new Error(`${code} has no place page`);
  const nb = [...neighbours(code)].sort(byName);
  const name = areaName(code);
  return {
    id: slugify(name), type: "focus", name, focus: code, members: [code, ...nb], core: [code], extras: [],
    subtitle: nb.length ? `${name} and the councils that border it` : name
  };
}

const counties = (rawCounties as { districts: Record<string, { countyCode: string; countyName: string }> }).districts;
const ceremonial = (rawCeremonial as { counties: Record<string, { unitaries: Array<{ code: string; name: string }> }> }).counties;

/** The two-tier counties: county council code to name, from district-to-utla.json. */
export function countyCodes(): Array<{ code: string; name: string }> {
  const seen = new Map<string, string>();
  for (const v of Object.values(counties)) seen.set(v.countyCode, v.countyName);
  return [...seen].map(([code, name]) => ({ code, name })).sort((a, b) => a.name.localeCompare(b.name));
}

/**
 * A county map (decision P1, default): the county council area's districts carry the
 * county, and the unitaries in the ceremonial county are drawn with their own figures,
 * labelled, and never added into the county total.
 */
export function countyFrame(countyCode: string): Frame {
  const name = countyCodes().find((c) => c.code === countyCode)?.name;
  if (!name) throw new Error(`${countyCode} is not a county in district-to-utla.json`);
  const core = Object.entries(counties).filter(([, v]) => v.countyCode === countyCode).map(([k]) => k).filter(isPlace).sort(byName);
  const extras = (ceremonial[countyCode]?.unitaries ?? []).map((u) => u.code).filter(isPlace).sort(byName);
  const extraNames = joinNames(extras.map(areaName));
  return {
    id: slugify(name), type: "group", name, members: [...core, ...extras].sort(byName), core, extras,
    subtitle: `${name}: ${core.length} district councils${extras.length ? `, ${extras.length} unitary ${extras.length > 1 ? "councils" : "council"}` : ""}`,
    note: extras.length
      ? `${extraNames} ${extras.length > 1 ? "are unitary councils" : "is a unitary council"} in ceremonial ${name}, shown with ${extras.length > 1 ? "their" : "its"} own figures and outside the county council's area.`
      : undefined
  };
}

/** Region frames, keyed by the slug the region pages use (buildPublicPlaceRegionPath in site.ts). */
export function regionSlugs(): Array<{ slug: string; name: string }> {
  const seen = new Map<string, string>();
  for (const a of getPublicPlaceAreas()) seen.set(buildPublicPlaceRegionSlug(a.regionName), a.regionName);
  return [...seen].map(([slug, name]) => ({ slug, name })).sort((a, b) => a.name.localeCompare(b.name));
}

export function regionFrame(slug: string): Frame {
  const areas = getPublicPlaceAreas().filter((a) => buildPublicPlaceRegionSlug(a.regionName) === slug);
  if (!areas.length) throw new Error(`no region with slug ${slug}`);
  const members = areas.map((a) => a.areaCode).sort(byName);
  const name = areas[0].regionName;
  return { id: slug, type: "group", name, members, core: members, extras: [], subtitle: `${name}, ${members.length} councils` };
}
