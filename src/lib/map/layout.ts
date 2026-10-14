/**
 * Layout: computed once per frame, template and indicator, and reused for every year, so
 * nothing moves between years in a video or when the web map's year changes. Plates are
 * sized for the widest value and sub-line across all years.
 *
 * Rules learnt from the prototype (Reports, ukd-maps-2026-10-13/v2):
 * - Labels sit on dark plates, never straight on a fill, so contrast can be checked by code.
 * - A plate centres on its council's pole of inaccessibility. It may cross a boundary line,
 *   never another plate, a brand tag or the panel edge. The focus council goes first, then
 *   the largest councils.
 * - What cannot sit on the map goes to a side gutter on a leader line, sorted by height so
 *   leaders never cross, drawn beneath the plates. Frames of more than DENSE_FRAME councils
 *   get no gutters: plates only where they fit, and the A to Z table carries every value.
 * - Focus cards fit the focus council, not the neighbours, so a large neighbour cannot
 *   shrink it to a corner. Every part reserves its own space; the map takes what is left.
 */
import { geoMercator, geoPath, type GeoPermissibleObjects, type GeoProjection } from "d3-geo";
import { SITE_DOMAIN } from "./brand";
import { BOUNDARY_CREDIT, areaName, bboxOf, loadCouncils, polygonsOf, type BBox, type CouncilFeature, type Frame } from "./geo";
import type { Indicator } from "./indicators";
import { measure, wrap, type FontKey } from "./text";
import { DENSE_FRAME, TEMPLATES, type PlateType, type Template, type TemplateKey } from "./templates";

export interface Box { x: number; y: number; w: number; h: number }
type Pt = [number, number];

// ---------- Pole of inaccessibility ----------
// Computed once per council in a local plane (longitude scaled by the cosine of the
// latitude), where Mercator is locally a uniform scale, then projected per layout.
interface GeoPole { lon: number; lat: number; rDeg: number }
const poleCache = new Map<string, GeoPole>();

function inside(rings: Pt[][], x: number, y: number): boolean {
  let c = false;
  for (const r of rings) for (let i = 0, j = r.length - 1; i < r.length; j = i++) {
    const [xi, yi] = r[i], [xj, yj] = r[j];
    if ((yi > y) !== (yj > y) && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) c = !c;
  }
  return c;
}
const insideRings = inside;
function distanceToEdge(rings: Pt[][], px: number, py: number): number {
  let m = Infinity;
  for (const r of rings) for (let i = 0; i < r.length - 1; i++) {
    const [ax, ay] = r[i], [bx, by] = r[i + 1], dx = bx - ax, dy = by - ay, L = dx * dx + dy * dy;
    const t = L ? Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / L)) : 0;
    const d = Math.hypot(px - ax - t * dx, py - ay - t * dy);
    if (d < m) m = d;
  }
  return m;
}

export function geoPole(f: CouncilFeature): GeoPole {
  const code = f.properties.code;
  const hit = poleCache.get(code);
  if (hit) return hit;
  const all = polygonsOf(f).flat();
  const lat0 = all.flat().reduce((a, p) => a + p[1], 0) / all.flat().length;
  const k = Math.cos((lat0 * Math.PI) / 180);
  const rings: Pt[][] = all.map((r) => r.map(([x, y]) => [x * k, y] as Pt));
  const pts = rings.flat();
  let [x0, x1, y0, y1] = [Math.min(...pts.map((p) => p[0])), Math.max(...pts.map((p) => p[0])), Math.min(...pts.map((p) => p[1])), Math.max(...pts.map((p) => p[1]))];
  let best = { x: (x0 + x1) / 2, y: (y0 + y1) / 2, r: 0 };
  for (let pass = 0; pass < 4; pass++) {
    const step = Math.max(x1 - x0, y1 - y0) / 36;
    for (let x = x0; x <= x1; x += step) for (let y = y0; y <= y1; y += step) {
      if (!inside(rings, x, y)) continue;
      const r = distanceToEdge(rings, x, y);
      if (r > best.r) best = { x, y, r };
    }
    const sp = step * 2;
    [x0, x1, y0, y1] = [best.x - sp, best.x + sp, best.y - sp, best.y + sp];
  }
  const pole = { lon: best.x / k, lat: best.y, rDeg: best.r };
  poleCache.set(code, pole);
  return pole;
}

function projectedPole(f: CouncilFeature, proj: GeoProjection): { x: number; y: number; r: number } {
  const p = geoPole(f);
  const [x, y] = proj([p.lon, p.lat])!;
  const [, yN] = proj([p.lon, p.lat + 0.01])!;
  return { x, y, r: (p.rDeg / 0.01) * Math.abs(y - yN) };
}

// ---------- Plates ----------
export const PLATE_PAD = 8;
/** Inner margin for the inline template's header and footer text. The panel runs edge to edge. */
export const INLINE_PAD = 12;
export type Role = "focus" | "neighbour" | "group";

export interface PlateMetrics { base: number[]; valBase: number; subBase: number; h: number }
/** One definition of plate geometry, used for sizing and drawing, so text never spills out. */
export function plateMetrics(lines: number, t: PlateType, showSub: boolean, pad: number): PlateMetrics {
  const base: number[] = [];
  let y = pad + t.name * 0.8;
  for (let i = 0; i < lines; i++) { base.push(y); y += t.name * 1.12; }
  const valBase = base[base.length - 1] + t.val * 1.0;
  const subBase = valBase + t.sub * 1.3;
  const h = (showSub ? subBase + t.sub * 0.3 : valBase + t.val * 0.22) + pad;
  return { base, valBase, subBase, h };
}

export interface Label {
  code: string;
  role: Role;
  type: PlateType;
  nameLines: string[];
  nameFont: FontKey;
  showSub: boolean;
  w: number;
  h: number;
  pad: number;
  anchor: { x: number; y: number };
  r: number;
  mode: "plate" | "out";
  side?: "L" | "R";
  /** Centre of the plate. */
  x: number;
  y: number;
}

export interface Layout {
  frame: Frame;
  tk: TemplateKey;
  t: Template;
  ind: Indicator;
  W: number;
  H: number;
  panel: Box;
  tags: Box[];
  shapes: Array<{ code: string; d: string }>;
  context: string[];
  labels: Label[];
  /** Members with no plate on this layout: listed in the table or the page's own table. */
  unlabelled: string[];
  dense: boolean;
  header: {
    brand: { x: number; y: number; k: number };
    titleLines: string[];
    subtitleLines: string[];
    titleBase: number[];
    subtitleBase: number[];
    yearBase: number;
    pill: { y: number; h: number };
    legend: { x: number; y: number; w: number; barH: number };
  };
  tableY: number;
  timelineY: number;
  footY: number;
  footLineH: number;
  urlY: number;
}

/** Footer lines for a year: definition, source, notes and the boundary credit, wrapped. */
export function footerText(ind: Indicator, frame: Frame, year: number): string[] {
  return [ind.definition, `Source: ${ind.source(year)}.`, ...ind.notes(year, frame.members), ...(frame.note ? [frame.note] : []), BOUNDARY_CREDIT];
}
export function footerLines(ind: Indicator, frame: Frame, year: number, size: number, maxW: number, short = false): string[] {
  const lines = short ? [`Source: ${ind.source(year)}.`, BOUNDARY_CREDIT] : footerText(ind, frame, year);
  return lines.flatMap((l) => wrap(l, size, maxW));
}

export const tagSize = (t: Template) => {
  const k = t.font.tag / 17;
  return { w: measure(SITE_DOMAIN, t.font.tag, "sansSemiBold") + 44 * k, h: 30 * k, k };
};

const splitName = (name: string, size: number, max: number, font: FontKey): string[] =>
  measure(name, size, font) <= max || !name.includes(" ") ? [name] : wrap(name, size, Math.max(max, measure(name, size, font) / 2 + size), font);

// ---------- Paths ----------
/** Douglas-Peucker on a projected ring, keeping both ends. */
function simplify(pts: Pt[], tol: number): Pt[] {
  if (pts.length < 4) return pts;
  const keep = new Uint8Array(pts.length);
  keep[0] = keep[pts.length - 1] = 1;
  const stack: Array<[number, number]> = [[0, pts.length - 1]];
  while (stack.length) {
    const [i, j] = stack.pop()!;
    const [ax, ay] = pts[i], [bx, by] = pts[j], dx = bx - ax, dy = by - ay, L = Math.hypot(dx, dy);
    let max = -1, at = -1;
    for (let k = i + 1; k < j; k++) {
      const d = L ? Math.abs(dy * pts[k][0] - dx * pts[k][1] + bx * ay - by * ax) / L : Math.hypot(pts[k][0] - ax, pts[k][1] - ay);
      if (d > max) { max = d; at = k; }
    }
    if (max > tol) { keep[at] = 1; stack.push([i, at], [at, j]); }
  }
  return pts.filter((_, k) => keep[k]);
}

/**
 * A council as an SVG path: projected, simplified to `tol` units, one decimal place, rings
 * smaller than a unit dropped. Neighbours are simplified separately, so a shared line may
 * differ by up to `tol` between them; the boundary stroke is wider than that.
 */
/** Sutherland-Hodgman: a ring cut to a rectangle. Anything beyond the panel is masked anyway. */
function clipRing(pts: Pt[], b: Box): Pt[] {
  const edges: Array<[(p: Pt) => boolean, (p: Pt, q: Pt) => Pt]> = [
    [(p) => p[0] >= b.x, (p, q) => [b.x, p[1] + ((q[1] - p[1]) * (b.x - p[0])) / (q[0] - p[0])]],
    [(p) => p[0] <= b.x + b.w, (p, q) => [b.x + b.w, p[1] + ((q[1] - p[1]) * (b.x + b.w - p[0])) / (q[0] - p[0])]],
    [(p) => p[1] >= b.y, (p, q) => [p[0] + ((q[0] - p[0]) * (b.y - p[1])) / (q[1] - p[1]), b.y]],
    [(p) => p[1] <= b.y + b.h, (p, q) => [p[0] + ((q[0] - p[0]) * (b.y + b.h - p[1])) / (q[1] - p[1]), b.y + b.h]]
  ];
  let out = pts;
  for (const [inside, cut] of edges) {
    const input = out; out = [];
    if (!input.length) break;
    for (let i = 0; i < input.length; i++) {
      const p = input[i], q = input[(i + 1) % input.length];
      if (inside(p)) { out.push(p); if (!inside(q)) out.push(cut(p, q)); }
      else if (inside(q)) out.push(cut(p, q));
    }
  }
  if (out.length) out.push(out[0]);
  return out;
}

export function svgPath(f: CouncilFeature, proj: GeoProjection, tol: number, clip?: Box): string {
  let d = "";
  for (const ring of polygonsOf(f).flat()) {
    let projected = ring.map((c) => proj(c as [number, number])! as Pt);
    if (clip) projected = clipRing(projected.slice(0, -1), clip);
    const pts = simplify(projected, tol);
    let area = 0;
    for (let i = 0; i < pts.length - 1; i++) area += pts[i][0] * pts[i + 1][1] - pts[i + 1][0] * pts[i][1];
    if (pts.length < 4 || Math.abs(area / 2) < 1) continue;
    let last = "";
    pts.forEach(([x, y], i) => {
      const p = `${x.toFixed(1)},${y.toFixed(1)}`;
      if (p === last) return;
      d += (i === 0 ? "M" : "L") + p;
      last = p;
    });
    d += "Z";
  }
  return d;
}

const layoutCache = new Map<string, Layout>();
const bboxCache = new Map<string, BBox>();
const cachedBBox = (code: string, f: CouncilFeature): BBox => {
  let b = bboxCache.get(code);
  if (!b) { b = bboxOf(f); bboxCache.set(code, b); }
  return b;
};

export function buildLayout(frame: Frame, tk: TemplateKey, ind: Indicator): Layout {
  const key = `${frame.type}:${frame.id}:${tk}:${ind.id}:${ind.years.join(",")}`;
  const hit = layoutCache.get(key);
  if (hit) return hit;
  const t = TEMPLATES[tk], s = t.s, F = t.font, W = t.W;
  const geo = loadCouncils();
  const isFocus = frame.type === "focus";
  const dense = frame.members.length > DENSE_FRAME;
  const useGutters = !isFocus && !dense && t.gutter > 0;

  // ---- Header and panel position ----
  const header = { brand: { x: 48, y: t.safeTop, k: s }, titleLines: [] as string[], subtitleLines: [] as string[], titleBase: [] as number[], subtitleBase: [] as number[], yearBase: 0, pill: { y: 0, h: 0 }, legend: { x: 0, y: 0, w: 0, barH: 0 } };
  let panel: Box;
  let H = t.H;
  const footSize = F.foot, footLineH = F.foot * 1.42;
  const footMaxW = tk === "og" ? 440 : W - 2 * (tk === "inline" ? INLINE_PAD : 48);
  const footN = Math.max(...ind.years.map((y) => footerLines(ind, frame, y, footSize, footMaxW, tk === "og").length));
  const tableRows = isFocus && t.table ? Math.ceil((frame.members.length - 1) / 2) : 0;
  const tableH = tableRows ? 70 * s + tableRows * 34 * s : 0;
  let tableY = 0, timelineY = 0, footY = 0, urlY = 0;

  if (tk === "og") {
    header.brand = { x: 40, y: 36, k: 0.8 };
    panel = { ...t.panel! };
    header.titleLines = wrap(ind.title, F.title, 440, "serifSemiBold");
    header.titleBase = header.titleLines.map((_, i) => 150 + i * 46);
    const sy = header.titleBase[header.titleBase.length - 1];
    header.subtitleLines = wrap(frame.subtitle, F.subtitle, 440);
    header.subtitleBase = header.subtitleLines.map((_, i) => sy + 34 + i * 27);
    const sb = header.subtitleBase[header.subtitleBase.length - 1];
    header.yearBase = sb + 82;
    header.pill = { y: sb + 98, h: 30 };
    header.legend = { x: 40, y: sb + 182, w: 400, barH: 15 };
    urlY = t.H - 26;
    footY = urlY - 30 - (footN - 1) * footLineH;
  } else if (tk === "inline") {
    header.brand = { x: INLINE_PAD, y: 8, k: 0.95 };
    header.titleLines = wrap(ind.title, F.title, W - 2 * INLINE_PAD, "serifSemiBold");
    header.titleBase = header.titleLines.map((_, i) => 104 + i * 36);
    const ty = header.titleBase[header.titleBase.length - 1];
    header.subtitleLines = wrap(frame.subtitle, F.subtitle, W - 2 * INLINE_PAD);
    header.subtitleBase = header.subtitleLines.map((_, i) => ty + 32 + i * 28);
    const sb = header.subtitleBase[header.subtitleBase.length - 1];
    header.yearBase = 50;
    header.pill = { y: sb + 16, h: 30 };
    panel = { x: 0, y: sb + 62, w: W, h: t.inlinePanelH! };
    const hasRef = ind.years.some((y) => ind.reference(y));
    const legendY = panel.y + panel.h + 20 + (hasRef ? 30 : 0);
    header.legend = { x: INLINE_PAD, y: legendY, w: W - 2 * INLINE_PAD - 70, barH: 18 };
    footY = legendY + 18 + 26 + 42;
    urlY = footY + (footN - 1) * footLineH + 44;
    H = Math.ceil(urlY + 12);
  } else {
    const top = t.safeTop + (tk === "story" ? 10 : 0);
    header.brand = { x: 48, y: top, k: s };
    header.titleLines = wrap(ind.title, F.title, W - 110, "serifSemiBold");
    header.titleBase = header.titleLines.map((_, i) => top + 128 * s + i * 56 * s);
    const ty = header.titleBase[header.titleBase.length - 1];
    header.subtitleLines = wrap(frame.subtitle, F.subtitle, W - 110);
    header.subtitleBase = header.subtitleLines.map((_, i) => ty + 44 * s + i * 32 * s);
    const sb = header.subtitleBase[header.subtitleBase.length - 1];
    const py = sb + 160 * s;
    header.yearBase = py - 74 * s;
    header.pill = { y: header.yearBase + 14 * s, h: 34 * s };
    header.legend = { x: 48, y: py - 76 * s, w: 520 * s, barH: 20 * s };
    const bottom = t.H - t.safeBottom;
    urlY = bottom - 4;
    const below = (t.timeline ? 92 * s : 40 * s) + (footN - 1) * 24 * s + 16 * s + 50 * s;
    panel = { x: 24, y: py, w: W - 48, h: bottom - below - tableH - py };
    tableY = panel.y + panel.h;
    timelineY = tableY + tableH + 30 * s;
    footY = tableY + tableH + (t.timeline ? 92 * s : 40 * s);
  }

  // ---- Brand tags inside the panel, opposite corners. Plates keep clear of them. ----
  const tg = tagSize(t);
  const tags: Box[] = [
    { x: panel.x + 8, y: panel.y + 8, w: tg.w, h: tg.h },
    { x: panel.x + panel.w - tg.w - 8, y: panel.y + panel.h - tg.h - 8, w: tg.w, h: tg.h }
  ];

  // ---- Projection ----
  const feats = frame.members.map((c) => {
    const f = geo.get(c);
    if (!f) throw new Error(`${c} (${areaName(c)}) has no boundary`);
    return f;
  });
  const focusInset = tk === "inline" ? [0.2, 0.17] : [0.26, 0.2];
  const ix = isFocus ? panel.w * focusInset[0] : useGutters ? t.gutter : 16;
  const iy = isFocus ? panel.h * focusInset[1] : tg.h + 16;
  const target = (isFocus ? geo.get(frame.focus!)! : { type: "FeatureCollection", features: feats }) as GeoPermissibleObjects;
  const proj = geoMercator().fitExtent([[panel.x + ix, panel.y + iy], [panel.x + panel.w - ix, panel.y + panel.h - iy]], target);
  const path = geoPath(proj);
  // Simplify in screen space: under half a CSS pixel on a phone, two thirds of a pixel on cards.
  const tol = tk === "inline" ? 0.75 : 0.66;
  // Paths are cut a little outside the panel (the camera push in clips zooms in, never out).
  const clip: Box = { x: panel.x - 8, y: panel.y - 8, w: panel.w + 16, h: panel.h + 16 };
  const shapes = feats.map((f) => ({ code: f.properties.code, d: svgPath(f, proj, tol, clip) }));
  const context: string[] = [];
  if (isFocus) {
    // Only councils whose box reaches the panel: the panel corners, unprojected, bound the view.
    const [lonW, latN] = proj.invert!([panel.x, panel.y])!, [lonE, latS] = proj.invert!([panel.x + panel.w, panel.y + panel.h])!;
    for (const [c, f] of geo) {
      if (frame.members.includes(c)) continue;
      const b = cachedBBox(c, f);
      if (b[0] > lonE || b[2] < lonW || b[1] > latN || b[3] < latS) continue;
      const [[x0, y0], [x1, y1]] = path.bounds(f);
      if (x1 < panel.x || x0 > panel.x + panel.w || y1 < panel.y || y0 > panel.y + panel.h) continue;
      context.push(svgPath(f, proj, tol * 1.6, clip));
    }
  }

  // ---- Plates, sized for the widest value and sub-line in any year ----
  const widest = (type: PlateType, withSub: boolean) => {
    let val = measure("n/a", type.val, "sansSemiBold"), sub = 0;
    for (const y of ind.years) for (const c of frame.members) {
      const v = ind.value(c, y);
      if (v != null) val = Math.max(val, measure(ind.format(v), type.val, "sansSemiBold"));
      if (!withSub) continue;
      const st = ind.status(c, y);
      const text = st === "ok" ? ind.sub(c, y) : ind.statusText[st] ?? null;
      if (text) sub = Math.max(sub, measure(text, type.sub, "sans"));
    }
    return { val, sub };
  };
  // Plates at full size first. If a gutter overflows or plates collide, balance the gutters
  // and step the plate type down; at the last step, any plate that still collides is left
  // off the map and its value stays in the table.
  const steps = tk === "inline" ? [1] : [1, 0.9, 0.8, 0.72];
  let result: { labels: Label[]; unlabelled: string[]; clashes: Set<string> } | null = null;
  for (const scale of steps) {
    result = placeLabels(scale);
    if (!result.clashes.size) break;
  }
  const labels = result!.labels.filter((l) => !result!.clashes.has(l.code));
  const unlabelled = [...result!.unlabelled, ...result!.clashes];

  function placeLabels(scale: number) {
    const cands: Label[] = feats.map((f) => {
      const code = f.properties.code;
      const role: Role = isFocus ? (code === frame.focus ? "focus" : "neighbour") : "group";
      const base = t.plate[role];
      const type: PlateType = { name: base.name * scale, val: base.val * scale, sub: base.sub * scale };
      const showSub = role !== "neighbour" && type.sub > 0;
      const nameFont: FontKey = role === "focus" ? "serifSemiBold" : "sans";
      const k = type.name / 19;
      const nameLines = splitName(areaName(code), type.name, (role === "focus" ? 210 : 145) * k, nameFont);
      const pad = PLATE_PAD * k;
      const wv = widest(type, showSub);
      const w = Math.max(...nameLines.map((l) => measure(l, type.name, nameFont)), wv.val, showSub ? wv.sub : 0) + 2 * pad;
      const h = plateMetrics(nameLines.length, type, showSub, pad).h;
      const p = projectedPole(f, proj);
      return { code, role, type, nameLines, nameFont, showSub, w, h, pad, anchor: { x: p.x, y: p.y }, r: p.r, mode: "plate", x: p.x, y: p.y };
    });

    const placed: Box[] = [...tags];
    const gap = 8 * Math.max(s, 0.6);
    const overlaps = (x: number, y: number, w: number, h: number) =>
      placed.some((q) => x - w / 2 < q.x + q.w + gap && x + w / 2 > q.x - gap && y - h / 2 < q.y + q.h + gap && y + h / 2 > q.y - gap);
    const outside = (x: number, y: number, w: number, h: number) =>
      x - w / 2 < panel.x + 6 || x + w / 2 > panel.x + panel.w - 6 || y - h / 2 < panel.y + 6 || y + h / 2 > panel.y + panel.h - 6;
    const labels: Label[] = [], ext: Label[] = [], unlabelled: string[] = [];
    cands.sort((a, b) => Number(b.role === "focus") - Number(a.role === "focus") || b.r - a.r);
    for (const c of cands) {
      let pos: Pt | null = null;
      if (c.r >= 14 * s || c.role === "focus") {
        const tries: Pt[] = [[0, 0]];
        for (const rad of [0.35, 0.7, 1.0, 1.4]) for (let i = 0; i < 12; i++) tries.push([Math.cos((i * Math.PI) / 6) * c.r * rad, Math.sin((i * Math.PI) / 6) * c.r * rad]);
        for (const [dx, dy] of tries) {
          const x = c.anchor.x + dx, y = c.anchor.y + dy;
          if (!overlaps(x, y, c.w, c.h) && !outside(x, y, c.w, c.h)) { pos = [x, y]; break; }
        }
      }
      if (!pos && c.role === "focus") {
        // The focus council always gets its plate: at its pole, pulled inside the panel.
        const x = Math.min(Math.max(c.anchor.x, panel.x + c.w / 2 + 6), panel.x + panel.w - c.w / 2 - 6);
        const y = Math.min(Math.max(c.anchor.y, panel.y + tg.h + 16 + c.h / 2), panel.y + panel.h - tg.h - 16 - c.h / 2);
        pos = [x, y];
      }
      if (pos) {
        placed.push({ x: pos[0] - c.w / 2, y: pos[1] - c.h / 2, w: c.w, h: c.h });
        labels.push({ ...c, mode: "plate", x: pos[0], y: pos[1] });
      } else if (useGutters) ext.push(c);
      else unlabelled.push(c.code);
    }

    // ---- A gutter label's leader must end on its own council, not under another plate ----
    for (const e of ext) {
      const covered = (x: number, y: number) => placed.some((q) => x > q.x - 6 && x < q.x + q.w + 6 && y > q.y - 6 && y < q.y + q.h + 6);
      if (!covered(e.anchor.x, e.anchor.y)) continue;
      const f = geo.get(e.code)!;
      const rings = polygonsOf(f).flat().map((r) => r.map((c) => proj(c as [number, number])!) as Pt[]);
      const pts = rings.flat();
      const [x0, x1] = [Math.min(...pts.map((p) => p[0])), Math.max(...pts.map((p) => p[0]))];
      const [y0, y1] = [Math.min(...pts.map((p) => p[1])), Math.max(...pts.map((p) => p[1]))];
      const step = Math.max(2, Math.max(x1 - x0, y1 - y0) / 40);
      let best: { x: number; y: number; d: number } | null = null;
      for (let x = x0; x <= x1; x += step) for (let y = y0; y <= y1; y += step) {
        if (!insideRings(rings, x, y) || covered(x, y)) continue;
        const d = Math.hypot(x - e.anchor.x, y - e.anchor.y);
        if (!best || d < best.d) best = { x, y, d };
      }
      if (best) e.anchor = { x: best.x, y: best.y };
    }

    // ---- Gutters: sorted by anchor height and pushed apart so leaders never cross ----
    const midX = panel.x + panel.w / 2;
    const minY = panel.y + tg.h + 16, maxY = panel.y + panel.h - tg.h - 16;
    // Balance the gutters: move the most central label across while one side overflows.
    const sides = new Map<Label, "L" | "R">(ext.map((e) => [e, e.anchor.x < midX ? "L" : "R"]));
    const need = (sd: "L" | "R") => ext.filter((e) => sides.get(e) === sd).reduce((acc, e) => acc + e.h + gap, -gap);
    const avail = maxY - minY;
    for (let guard = 0; guard < ext.length; guard++) {
      const full = need("L") > avail ? "L" : need("R") > avail ? "R" : null;
      if (!full) break;
      const other = full === "L" ? "R" : "L";
      const movable = ext.filter((e) => sides.get(e) === full).sort((p, q) => (full === "L" ? q.anchor.x - p.anchor.x : p.anchor.x - q.anchor.x))[0];
      if (!movable || need(other) + movable.h + gap > avail) break;
      sides.set(movable, other);
    }
    for (const side of ["L", "R"] as const) {
      const items = ext.filter((e) => sides.get(e) === side).sort((a, b) => a.anchor.y - b.anchor.y);
      let last = -Infinity, lastH = 0;
      for (const e of items) {
        e.y = Math.max(e.anchor.y, minY + e.h / 2, last + (lastH + e.h) / 2 + gap);
        last = e.y; lastH = e.h;
      }
      const over = last + lastH / 2 - maxY;
      if (over > 0) for (const e of items) e.y -= over;
      for (const e of items) {
        e.mode = "out"; e.side = side;
        e.x = side === "L" ? panel.x + 8 + e.w / 2 : panel.x + panel.w - 8 - e.w / 2;
        labels.push(e);
      }
    }

    // Clashes: plates that overlap another plate or a tag, or leave the panel.
    const clashes = new Set<string>();
    const boxOf = (l: Label): Box => ({ x: l.x - l.w / 2, y: l.y - l.h / 2, w: l.w, h: l.h });
    const hitBox = (a: Box, b: Box) => a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
    for (const l of labels) {
      const b = boxOf(l);
      if (b.x < panel.x || b.y < panel.y || b.x + b.w > panel.x + panel.w || b.y + b.h > panel.y + panel.h) clashes.add(l.code);
      if (tags.some((tg) => hitBox(b, tg))) clashes.add(l.code);
    }
    for (let i = 0; i < labels.length; i++) for (let j = i + 1; j < labels.length; j++) {
      if (!hitBox(boxOf(labels[i]), boxOf(labels[j]))) continue;
      // Keep the focus plate and plates on the map; let the gutter label go.
      const [a, b] = [labels[i], labels[j]];
      const drop = a.role === "focus" ? b : b.role === "focus" ? a : a.mode === "out" ? a : b.mode === "out" ? b : a.r < b.r ? a : b;
      clashes.add(drop.code);
    }
    return { labels, unlabelled, clashes };
  }

  const layout: Layout = {
    frame, tk, t, ind, W, H, panel, tags, shapes, context, labels, unlabelled, dense, header,
    tableY, timelineY, footY, footLineH, urlY
  };
  layoutCache.set(key, layout);
  return layout;
}

