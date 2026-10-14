/**
 * One SVG renderer for every output: the web map (inline), share cards (portrait, story,
 * og) and clip frames. Every text element is recorded with the colour it sits on, so the
 * QA gates can check contrast, dashes and branding by code rather than by eye.
 *
 * The brand sits in five places: the header row, two tags inside the map panel (opposite
 * corners), the footer URL, and the end card on clips. Cropping them off means cropping
 * the title, the legend or the map.
 *
 * resvg crashed on clip-path in the prototype, so the panel is cut out with a
 * ground-coloured mask instead, and the header is drawn after the mask.
 */
import { BRAND_NAME, BRAND_SOURCED, BRAND_TAGLINE, COLORS, FONT_SANS, FONT_SERIF, SITE_DOMAIN, markRects } from "./brand";
import { contrast, mix, oklabLightness } from "./colour";
import { areaName, type Frame } from "./geo";
import { KIND_TAG, colourFor, projectionsEnabled, type Indicator, type Kind, type Status } from "./indicators";
import { INLINE_PAD, buildLayout, footerLines, plateMetrics, tagSize, type Box, type Layout } from "./layout";
import { esc, measure, wrap } from "./text";
import type { TemplateKey } from "./templates";

export const C = {
  ground: COLORS.bg,
  text: COLORS.text,
  muted: COLORS.muted,
  accent: COLORS.accent,
  accentLight: COLORS.accentLight,
  plate: COLORS.bg,
  panel: "#12171c",
  context: "#1b2229",
  na: "#2a3038",
  naStripe: "#4b535c",
  plateName: "#cfd6db",
  plateSub: "#c3cbd1",
  estimatePill: "#262d35",
  brandTile: "#171c21"
} as const;

export interface TextRecord {
  content: string;
  fill: string;
  bg: string;
  size: number;
  weight: number;
  family: string;
  x: number;
  y: number;
  role?: "value" | "name" | "sub";
  anchor?: "start" | "middle" | "end";
  /** The plate a text sits on, so lines stacked in one plate are not flagged as overlapping. */
  plate?: string;
}

export interface DrawnValue {
  code: string;
  name: string;
  year: number;
  value: number | null;
  display: string;
  sub: string | null;
  kind: Kind;
  status: Status;
  labelled: boolean;
}

export interface RenderResult {
  svg: string;
  texts: TextRecord[];
  drawn: DrawnValue[];
  brand: number;
  brandInPanel: number;
  fills: Record<string, string>;
  alt: string;
  layout: Layout;
  /** Inline maps rendered for one measure of a two-measure map (see place.ts). */
  measure?: MeasureParts;
}

/**
 * The parts of an inline map that belong to one measure, so a second measure can be
 * merged into the first map's SVG with the geometry drawn once (decision D7):
 * per-council attributes for the shape and its <title>, attributes for the map's own
 * <title> and root, and the measure-specific chunks, in drawing order.
 */
export interface MeasureParts {
  key: string;
  shapeAttrs: Record<string, string>;
  titleAttrs: Record<string, string>;
  altAttrs: string;
  rootAttrs: string;
  chunks: string[];
  height: number;
}

export interface FrameState {
  fromYear: number;
  toYear: number;
  /** 0 to 1 between fromYear and toYear. Values are never shown between years. */
  t: number;
  labelYear: number;
  labelAlpha: number;
  /** Timeline position, in year steps from the first year. */
  pos: number;
  zoom: number;
}

const ease = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2);
const n2 = (v: number) => +v.toFixed(2);

class Canvas {
  texts: TextRecord[] = [];
  brand = 0;
  brandInPanel = 0;
  txt(o: {
    x: number; y: number; size: number; fill: string; bg: string; content: string; family?: string; weight?: number;
    anchor?: "start" | "middle" | "end"; ls?: number; opacity?: number; attrs?: string; role?: TextRecord["role"]; plate?: string;
  }): string {
    const family = o.family ?? FONT_SANS, weight = o.weight ?? 400;
    this.texts.push({ content: String(o.content), fill: o.fill, bg: o.bg, size: o.size, weight, family, x: o.x, y: o.y, role: o.role, anchor: o.anchor ?? "start", plate: o.plate });
    return `<text x="${n2(o.x)}" y="${n2(o.y)}" font-family="${family}" font-weight="${weight}" font-size="${n2(o.size)}" fill="${o.fill}"` +
      `${o.anchor && o.anchor !== "start" ? ` text-anchor="${o.anchor}"` : ""}${o.ls ? ` letter-spacing="${n2(o.ls)}"` : ""}` +
      `${o.opacity != null && o.opacity < 1 ? ` opacity="${n2(o.opacity)}"` : ""}${o.attrs ?? ""}>${esc(o.content)}</text>`;
  }
  mark(inPanel: boolean) { this.brand++; if (inPanel) this.brandInPanel++; }
}

const val = (ind: Indicator, c: string, y: number) => (ind.status(c, y) === "ok" ? ind.value(c, y) : null);
/** The base colour behind a council: its class, or the n/a grey (which the map hatches). */
const baseFill = (ind: Indicator, c: string, y: number) => { const v = val(ind, c, y); return v == null ? C.na : colourFor(ind, v); };
const display = (ind: Indicator, c: string, y: number) => { const v = val(ind, c, y); return v == null ? "n/a" : ind.format(v); };
const subText = (ind: Indicator, c: string, y: number) => {
  const st = ind.status(c, y);
  return st === "ok" ? ind.sub(c, y) : ind.statusText[st] ?? null;
};
const plateBg = (fill: string) => mix(fill, C.plate, 0.92);

/** "Census 2021", "mid-2025 estimate", "2031 projection". */
export function yearPhrase(ind: Indicator, y: number): string {
  const k = ind.kind(y);
  return k === "census" ? `Census ${y}` : k === "estimate" ? `mid-${y} estimate` : `${y} projection`;
}

function brandRow(cv: Canvas, x: number, y: number, k: number, F: Layout["t"]["font"]): string {
  cv.mark(false);
  const tile = 56 * k;
  return `<g transform="translate(${n2(x)},${n2(y)})"><rect width="${n2(tile)}" height="${n2(tile)}" rx="${n2(10 * k)}" fill="${C.brandTile}"/>` +
    `<g transform="translate(${n2(6 * k)},${n2(6 * k)})">${markRects(44 * k)}</g></g>` +
    cv.txt({ x: x + 72 * k, y: y + 26 * k, size: F.brandName, family: FONT_SERIF, weight: 600, fill: C.text, bg: C.ground, content: BRAND_NAME }) +
    cv.txt({ x: x + 72 * k, y: y + 50 * k, size: F.brandTag, fill: C.muted, bg: C.ground, content: BRAND_TAGLINE });
}

function panelTags(cv: Canvas, L: Layout): string {
  const tg = tagSize(L.t);
  let o = "";
  for (const b of L.tags) {
    cv.mark(true);
    o += `<g transform="translate(${n2(b.x)},${n2(b.y)})"><rect width="${n2(b.w)}" height="${n2(b.h)}" rx="${n2(b.h / 2)}" fill="${C.ground}" opacity="0.92"/>` +
      `<g transform="translate(${n2(8 * tg.k)},${n2(5 * tg.k)})">${markRects(20 * tg.k)}</g></g>` +
      cv.txt({ x: b.x + 33 * tg.k, y: b.y + 21 * tg.k, size: L.t.font.tag, weight: 600, fill: C.text, bg: C.ground, content: SITE_DOMAIN });
  }
  return o;
}

const PILL: Record<Kind, { bg: string; fg: string; stroke: string }> = {
  census: { bg: C.text, fg: C.ground, stroke: "" },
  estimate: { bg: C.estimatePill, fg: C.text, stroke: ` stroke="${C.muted}" stroke-width="1.5"` },
  projection: { bg: C.ground, fg: C.accentLight, stroke: ` stroke="${C.accentLight}" stroke-width="2" stroke-dasharray="6 5"` }
};
function kindPill(cv: Canvas, x: number, y: number, h: number, size: number, kind: Kind, anchorEnd: boolean, yearAttrs = ""): string {
  const label = KIND_TAG[kind], ls = size * 0.07;
  const w = measure(label, size, "sansSemiBold", ls) + h * 0.9;
  const x0 = anchorEnd ? x - w : x, sty = PILL[kind];
  return `<rect x="${n2(x0)}" y="${n2(y)}" width="${n2(w)}" height="${n2(h)}" rx="${n2(h / 2)}" fill="${sty.bg}"${sty.stroke}/>` +
    cv.txt({ x: x0 + w / 2, y: y + h * 0.68, size, weight: 600, fill: sty.fg, bg: sty.bg, content: label, anchor: "middle", ls, attrs: yearAttrs });
}

function legend(cv: Canvas, L: Layout, year: number, hasNA: boolean): string {
  const { ind, t } = L, { x, y, w, barH } = L.header.legend, F = t.font;
  const n = ind.scale.colours.length, bw = w / n;
  let o = "";
  ind.scale.colours.forEach((c, i) => { o += `<rect x="${n2(x + i * bw + 1)}" y="${n2(y)}" width="${n2(bw - 2)}" height="${n2(barH)}" rx="3" fill="${c}"/>`; });
  ind.scale.breaks.forEach((_, i) => {
    o += cv.txt({ x: x + (i + 1) * bw, y: y + barH + F.legend * 1.25, size: F.legend, fill: C.muted, bg: C.ground, content: ind.scale.labels[i], anchor: "middle" });
  });
  const step = ind.scale.breaks[1] - ind.scale.breaks[0];
  const lo = ind.scale.breaks[0] - step, hi = ind.scale.breaks[ind.scale.breaks.length - 1] + step;
  const refMark = (ref: { label: string; value: number }) => {
    const pos = x + ((ref.value - lo) / (hi - lo)) * w;
    const label = `${ref.label}: ${ref.value.toFixed(1)}%`;
    const lw = measure(label, F.reference);
    const lx = Math.min(Math.max(pos, x + lw / 2), x + w - lw / 2);
    return `<rect x="${n2(pos - 2)}" y="${n2(y - barH * 0.4)}" width="4" height="${n2(barH * 1.6)}" fill="${C.text}"/>` +
      cv.txt({ x: lx, y: y - barH * 0.4 - F.reference * 0.45, size: F.reference, fill: C.text, bg: C.ground, content: label, anchor: "middle" });
  };
  if (L.tk === "inline") {
    // The web map switches year, so it carries each year's reference line, one group per
    // distinct reference, shown for the years it belongs to (as the footer is).
    const groups = new Map<string, { ref: { label: string; value: number }; years: number[] }>();
    for (const yr of ind.years) {
      const ref = ind.reference(yr);
      if (!ref) continue;
      const k = `${ref.label}|${ref.value}`;
      groups.set(k, { ref, years: [...(groups.get(k)?.years ?? []), yr] });
    }
    for (const { ref, years } of groups.values()) {
      const shown = years.includes(year), before = cv.texts.length;
      o += `<g data-years="${years.join(" ")}"${shown ? "" : ` display="none"`}>${refMark(ref)}</g>`;
      if (!shown) cv.texts.splice(before); // hidden lines are checked when their own year renders
    }
  } else {
    const ref = ind.reference(year);
    if (ref) o += refMark(ref);
  }
  if (hasNA) {
    const nx = x + w + 18 * Math.max(L.t.s, 0.6);
    o += `<rect x="${n2(nx)}" y="${n2(y)}" width="${n2(bw * 0.7)}" height="${n2(barH)}" rx="3" fill="${mapIds(L).na}" stroke="${C.muted}" stroke-opacity="0.35"/>`;
    o += cv.txt({ x: nx, y: y + barH + F.legend * 1.25, size: F.legend, fill: C.muted, bg: C.ground, content: "n/a" });
  }
  return o;
}

function timeline(cv: Canvas, L: Layout, pos: number): string {
  const { ind, t } = L, s = t.s, ys = ind.years, n = ys.length;
  const x = 72, w = L.W - 144, y = L.timelineY, step = w / Math.max(1, n - 1);
  let o = "";
  const lastObs = ys.reduce((a, yr, i) => (ind.kind(yr) !== "projection" ? i : a), 0);
  o += `<line x1="${x}" y1="${n2(y)}" x2="${n2(x + lastObs * step)}" y2="${n2(y)}" stroke="${C.muted}" stroke-width="${n2(3 * s)}"/>`;
  if (lastObs < n - 1) o += `<line x1="${n2(x + lastObs * step)}" y1="${n2(y)}" x2="${n2(x + w)}" y2="${n2(y)}" stroke="${C.accentLight}" stroke-width="${n2(3 * s)}" stroke-dasharray="${n2(8 * s)} ${n2(7 * s)}"/>`;
  ys.forEach((yr, i) => {
    o += `<circle cx="${n2(x + i * step)}" cy="${n2(y)}" r="${n2(4.5 * s)}" fill="${ind.kind(yr) === "projection" ? C.accentLight : C.muted}"/>`;
    if (n <= 6 || yr % 5 === 0 || i === 0 || i === n - 1)
      o += cv.txt({ x: x + i * step, y: y + 30 * s, size: t.font.timeline, fill: C.muted, bg: C.ground, content: String(yr), anchor: "middle" });
  });
  o += `<circle cx="${n2(x + pos * step)}" cy="${n2(y)}" r="${n2(11 * s)}" fill="${C.accent}" stroke="${C.ground}" stroke-width="${n2(4 * s)}"/>`;
  return o;
}

/**
 * data-f-YEAR / data-t-YEAR attributes for the web map's year switcher (inline only).
 * With a measure key m they are data-m-f-YEAR and data-m-t-YEAR, so two measures can
 * share one element.
 */
const perYear = (L: Layout, attr: "f" | "t" | "a", fn: (y: number) => string | null, m?: string) =>
  L.tk !== "inline" ? "" : L.ind.years.map((y) => { const v = fn(y); return v == null ? "" : ` data-${m ? `${m}-` : ""}${attr}-${y}="${esc(v)}"`; }).join("");

/** Ids for one map's patterns, unique per frame and template. */
function mapIds(L: Layout) {
  const hatchId = `ukd-hatch-${L.frame.id}-${L.tk}`, naId = `ukd-na-${L.frame.id}-${L.tk}`;
  return { hatchId, naId, na: `url(#${naId})` };
}

export function render(L: Layout, st: FrameState, opts: { measure?: string } = {}): RenderResult {
  const ids = mapIds(L);
  const m = L.tk === "inline" ? opts.measure : undefined;
  const parts: MeasureParts | undefined = m ? { key: m, shapeAttrs: {}, titleAttrs: {}, altAttrs: "", rootAttrs: "", chunks: [], height: L.H } : undefined;
  // A measure's own chunk: wrapped in a group the switcher shows or hides, and marked so
  // place.ts can merge another measure's chunk in beside it.
  const chunk = (body: string) => {
    if (!parts) return body;
    const i = parts.chunks.length, g = `<g data-measure="${m}">${body}</g>`;
    parts.chunks.push(g);
    return `<!--m${i}-->${g}<!--/m${i}-->`;
  };
  const fillAt = (ind: Indicator, c: string, y: number) => (val(ind, c, y) == null ? ids.na : colourFor(ind, val(ind, c, y)!));
  const { t, ind, frame, panel, W, H } = L, s = t.s, F = t.font, cv = new Canvas(), tk = L.tk;
  const isFocus = frame.type === "focus";
  const year = st.labelYear, kind = ind.kind(year);
  const hasNA = ind.years.some((y) => frame.members.some((c) => ind.status(c, y) !== "ok"));
  const radius = 18 * Math.max(s, 0.75);
  const fills: Record<string, string> = {};
  const inline = tk === "inline";

  const rootYears = m ? ` data-${m}-years="${ind.years.join(" ")}" data-${m}-year="${year}" data-${m}-h="${H}"` : ` data-years="${ind.years.join(" ")}" data-year="${year}"`;
  if (parts) parts.rootAttrs = rootYears;
  let o = `<svg xmlns="http://www.w3.org/2000/svg"${inline ? ` class="ukd-map"${rootYears}` : ` width="${W}" height="${H}"`} viewBox="0 0 ${W} ${H}" role="img" aria-labelledby="ukd-map-title-${frame.id}-${tk}">`;
  const altText = alt(L, year);
  const altAttrs = m ? perYear(L, "a", (y) => alt(L, y), m) : "";
  if (parts) parts.altAttrs = altAttrs;
  o += `<title id="ukd-map-title-${frame.id}-${tk}"${m ? ' data-alt=""' : ""}${altAttrs}>${esc(altText)}</title>`;
  // Pattern ids carry the frame and template, so two maps on one page never share one.
  o += `<defs><pattern id="${ids.hatchId}" width="12" height="12" patternUnits="userSpaceOnUse" patternTransform="rotate(45)"><rect width="4.5" height="12" fill="${C.ground}" opacity="0.5"/></pattern>` +
    `<pattern id="${ids.naId}" width="8" height="8" patternUnits="userSpaceOnUse" patternTransform="rotate(45)"><rect width="8" height="8" fill="${C.na}"/><rect width="2.5" height="8" fill="${C.naStripe}"/></pattern></defs>`;
  o += `<rect width="${W}" height="${H}" fill="${C.ground}"/>`;

  // ---- Map, with a slow camera push for video ----
  const cx = panel.x + panel.w / 2, cy = panel.y + panel.h / 2, z = st.zoom;
  o += `<rect x="${n2(panel.x)}" y="${n2(panel.y)}" width="${n2(panel.w)}" height="${n2(panel.h)}" fill="${C.panel}"/>`;
  o += z !== 1 ? `<g transform="translate(${n2(cx)},${n2(cy)}) scale(${z.toFixed(4)}) translate(${n2(-cx)},${n2(-cy)})">` : "<g>";
  for (const d of L.context) o += `<path d="${d}" fill="${C.context}" stroke="${C.ground}" stroke-width="${n2(1.5 * s)}"/>`;
  const projectedNow = ind.kind(st.t >= 0.5 ? st.toYear : st.fromYear) === "projection";
  for (const sh of L.shapes) {
    const a = baseFill(ind, sh.code, st.fromYear), b = baseFill(ind, sh.code, st.toYear);
    // Between years the colours blend; on a year, n/a is hatched, because the grey alone
    // sits close to the darkest class.
    const settled = st.t === 0 || st.t >= 1 || a === b, at = st.t >= 1 ? b : a;
    const f = !settled ? mix(a, b, ease(st.t)) : at === C.na ? ids.na : at;
    fills[sh.code] = f;
    const name = esc(areaName(sh.code));
    // The focus council's geometry sits in defs once, unpainted, and is drawn twice by
    // reference: filled here, outlined below. A use cannot repaint a painted original.
    const isF = isFocus && sh.code === frame.focus;
    const fAttrs = perYear(L, "f", (y) => fillAt(ind, sh.code, y), m);
    const tAttrs = m ? perYear(L, "t", (y) => `${areaName(sh.code)}: ${display(ind, sh.code, y)}`, m) : "";
    if (parts) { parts.shapeAttrs[sh.code] = fAttrs; parts.titleAttrs[sh.code] = tAttrs; }
    const attrs = `fill="${f}" stroke="${C.ground}" stroke-width="${n2(2 * s)}" stroke-linejoin="round" data-code="${sh.code}"${fAttrs}`;
    const title = `<title${m ? ` data-tc="${sh.code}"` : ""}${tAttrs}>${name}: ${esc(display(ind, sh.code, year))}</title>`;
    o += isF
      ? `<defs><path id="ukd-focus-${frame.id}-${tk}" d="${sh.d}"/></defs><use href="#ukd-focus-${frame.id}-${tk}" ${attrs}>${title}</use>`
      : `<path d="${sh.d}" ${attrs}>${title}</path>`;
    if (projectedNow) o += `<path d="${sh.d}" fill="url(#${ids.hatchId})"/>`;
  }
  if (isFocus) {
    o += `<use href="#ukd-focus-${frame.id}-${tk}" fill="none" stroke="${C.text}" stroke-width="${n2(4 * s)}" stroke-linejoin="round" pointer-events="none"/>`;
  }

  // ---- Labels: every leader first, then every plate, so no line crosses a plate ----
  const a = st.labelAlpha;
  let leaders = "", plates = "";
  for (const lb of L.labels) {
    if (a <= 0.01) continue;
    const M = plateMetrics(lb.nameLines.length, lb.type, lb.showSub, lb.pad);
    const y0 = lb.y - lb.h / 2, x0 = lb.x - lb.w / 2;
    const plate = lb.mode === "plate";
    const bg = plate ? plateBg(baseFill(ind, lb.code, year)) : C.ground;
    const tx = plate ? lb.x : lb.side === "L" ? x0 + lb.pad : x0 + lb.w - lb.pad;
    const anc = plate ? "middle" : lb.side === "L" ? "start" : "end";
    if (!plate) {
      const edge = lb.side === "L" ? x0 + lb.w : x0, ex = lb.side === "L" ? edge + 10 : edge - 10;
      const pts = `${n2(lb.anchor.x)},${n2(lb.anchor.y)} ${n2(ex)},${n2(lb.y)} ${n2(edge)},${n2(lb.y)}`;
      leaders += `<g opacity="${a.toFixed(3)}"><polyline points="${pts}" fill="none" stroke="${C.ground}" stroke-width="${n2(5 * s)}" stroke-linejoin="round"/>` +
        `<polyline points="${pts}" fill="none" stroke="${C.text}" stroke-width="${n2(1.6 * s)}" stroke-linejoin="round"/>` +
        `<circle cx="${n2(lb.anchor.x)}" cy="${n2(lb.anchor.y)}" r="${n2(4.5 * s)}" fill="${C.text}" stroke="${C.ground}" stroke-width="2"/></g>`;
    }
    const stroke = lb.role === "focus" ? ` stroke="${C.accent}" stroke-width="${n2(2.5 * Math.max(s, 0.8))}"` : ` stroke="#ffffff" stroke-opacity="0.14"`;
    let p = `<g opacity="${a.toFixed(3)}" data-plate="${lb.code}"><rect x="${n2(x0)}" y="${n2(y0)}" width="${n2(lb.w)}" height="${n2(lb.h)}" rx="${n2(8 * Math.max(s, 0.7))}" fill="${C.plate}" fill-opacity="0.92"${stroke}/>`;
    lb.nameLines.forEach((nl, i) => {
      p += cv.txt({ x: tx, y: y0 + M.base[i], size: lb.type.name, family: lb.nameFont === "serifSemiBold" ? FONT_SERIF : FONT_SANS, weight: lb.nameFont === "serifSemiBold" ? 600 : 400, fill: C.plateName, bg, content: nl, anchor: anc, role: "name", plate: lb.code });
    });
    p += cv.txt({ x: tx, y: y0 + M.valBase, size: lb.type.val, weight: 600, fill: C.text, bg, content: display(ind, lb.code, year), anchor: anc, role: "value", plate: lb.code, attrs: perYear(L, "t", (y) => display(ind, lb.code, y), m) });
    if (lb.showSub) {
      const sub = subText(ind, lb.code, year);
      if (sub != null || inline) p += cv.txt({ x: tx, y: y0 + M.subBase, size: lb.type.sub, fill: C.plateSub, bg, content: sub ?? "", anchor: anc, role: "sub", plate: lb.code, attrs: perYear(L, "t", (y) => subText(ind, lb.code, y) ?? "", m) });
    }
    plates += p + "</g>";
  }
  o += chunk(leaders + plates) + "</g>";

  // ---- Mask: ground everywhere outside the rounded panel (no clip-path in resvg) ----
  const P = panel, r = radius;
  o += `<path fill-rule="evenodd" fill="${C.ground}" d="M0 0H${W}V${H}H0Z M${n2(P.x + r)} ${n2(P.y)}H${n2(P.x + P.w - r)}A${n2(r)} ${n2(r)} 0 0 1 ${n2(P.x + P.w)} ${n2(P.y + r)}V${n2(P.y + P.h - r)}A${n2(r)} ${n2(r)} 0 0 1 ${n2(P.x + P.w - r)} ${n2(P.y + P.h)}H${n2(P.x + r)}A${n2(r)} ${n2(r)} 0 0 1 ${n2(P.x)} ${n2(P.y + P.h - r)}V${n2(P.y + r)}A${n2(r)} ${n2(r)} 0 0 1 ${n2(P.x + r)} ${n2(P.y)}Z"/>`;
  o += panelTags(cv, L);
  const restStart = o.length;
  if (kind === "projection") o += `<rect x="${n2(P.x)}" y="${n2(P.y)}" width="${n2(P.w)}" height="${n2(P.h)}" rx="${n2(r)}" fill="none" stroke="${C.accentLight}" stroke-opacity="0.7" stroke-width="2" stroke-dasharray="12 9"/>`;

  // ---- Header, drawn after the mask ----
  const H_ = L.header;
  const yearAttrs = perYear(L, "t", (y) => String(y), m);
  const pillAttrs = perYear(L, "t", (y) => KIND_TAG[ind.kind(y)], m);
  if (tk === "og") {
    o += brandRow(cv, H_.brand.x, H_.brand.y, H_.brand.k, F);
    H_.titleLines.forEach((l, i) => { o += cv.txt({ x: 40, y: H_.titleBase[i], size: F.title, family: FONT_SERIF, weight: 600, fill: C.text, bg: C.ground, content: l }); });
    H_.subtitleLines.forEach((l, i) => { o += cv.txt({ x: 40, y: H_.subtitleBase[i], size: F.subtitle, fill: C.muted, bg: C.ground, content: l }); });
    o += cv.txt({ x: 40, y: H_.yearBase, size: F.year, family: FONT_SERIF, weight: 600, fill: C.text, bg: C.ground, content: String(year) });
    o += kindPill(cv, 40, H_.pill.y, H_.pill.h, F.pill, kind, false);
    o += legend(cv, L, year, hasNA);
  } else if (inline) {
    o += brandRow(cv, H_.brand.x, H_.brand.y, H_.brand.k, F);
    o += cv.txt({ x: W - INLINE_PAD, y: H_.yearBase, size: F.year, family: FONT_SERIF, weight: 600, fill: C.text, bg: C.ground, content: String(year), anchor: "end", attrs: yearAttrs });
    H_.titleLines.forEach((l, i) => { o += cv.txt({ x: INLINE_PAD, y: H_.titleBase[i], size: F.title, family: FONT_SERIF, weight: 600, fill: C.text, bg: C.ground, content: l }); });
    H_.subtitleLines.forEach((l, i) => { o += cv.txt({ x: INLINE_PAD, y: H_.subtitleBase[i], size: F.subtitle, fill: C.muted, bg: C.ground, content: l }); });
    o += kindPill(cv, INLINE_PAD, H_.pill.y, H_.pill.h, F.pill, kind, false, pillAttrs);
    o += legend(cv, L, year, hasNA);
  } else {
    o += brandRow(cv, H_.brand.x, H_.brand.y, H_.brand.k, F);
    H_.titleLines.forEach((l, i) => { o += cv.txt({ x: 48, y: H_.titleBase[i], size: F.title, family: FONT_SERIF, weight: 600, fill: C.text, bg: C.ground, content: l }); });
    H_.subtitleLines.forEach((l, i) => { o += cv.txt({ x: 48, y: H_.subtitleBase[i], size: F.subtitle, fill: C.muted, bg: C.ground, content: l }); });
    o += cv.txt({ x: W - 48, y: H_.yearBase, size: F.year, family: FONT_SERIF, weight: 600, fill: C.text, bg: C.ground, content: String(year), anchor: "end" });
    o += kindPill(cv, W - 48, H_.pill.y, H_.pill.h, F.pill, kind, true);
    o += legend(cv, L, year, hasNA);
  }

  // ---- Below the map: the A to Z table of bordering councils, the timeline, the footer ----
  const tableRows = frame.members.filter((c) => c !== frame.focus);
  if (isFocus && t.table && tableRows.length) {
    const rows = tableRows;
    const cols = 2, colW = (W - 96) / cols, rh = 34 * s, yb = L.tableY;
    o += cv.txt({ x: 48, y: yb + 38 * s, size: F.tableHead, weight: 600, fill: C.muted, bg: C.ground, content: frame.relation === "nearby" ? "NEAREST COUNCILS, A TO Z" : "BORDERING COUNCILS, A TO Z", ls: 1.5 * s });
    rows.forEach((c, i) => {
      const x = 48 + (i % cols) * colW, y = yb + 70 * s + Math.floor(i / cols) * rh;
      o += `<rect x="${n2(x)}" y="${n2(y - 16 * s)}" width="${n2(16 * s)}" height="${n2(16 * s)}" rx="3" fill="${fillAt(ind, c, year)}" stroke="${C.muted}" stroke-opacity="0.4"/>`;
      o += cv.txt({ x: x + 26 * s, y, size: F.tableRow, fill: C.text, bg: C.ground, content: areaName(c) });
      o += cv.txt({ x: x + colW - 30, y, size: F.tableRow, weight: 600, fill: C.text, bg: C.ground, content: display(ind, c, year), anchor: "end" });
    });
  }
  if (t.timeline) o += timeline(cv, L, st.pos);

  const footX = tk === "og" ? 40 : inline ? INLINE_PAD : 48;
  const footW = W - 2 * footX;
  const footFor = (y: number) => footerLines(ind, frame, y, F.foot, tk === "og" ? 440 : footW, tk === "og");
  if (inline) {
    // One group per distinct footer, shown for the years it belongs to.
    const groups = new Map<string, number[]>();
    for (const y of ind.years) { const k = footFor(y).join("\n"); groups.set(k, [...(groups.get(k) ?? []), y]); }
    for (const [k, ys] of groups) {
      const shown = ys.includes(year);
      o += `<g data-years="${ys.join(" ")}"${shown ? "" : ` display="none"`}>`;
      k.split("\n").forEach((l, i) => {
        const el = cv.txt({ x: footX, y: L.footY + i * L.footLineH, size: F.foot, fill: C.muted, bg: C.ground, content: l });
        o += el;
        if (!shown) cv.texts.pop(); // hidden lines are checked when their own year renders
      });
      o += "</g>";
    }
  } else {
    footFor(year).forEach((l, i) => { o += cv.txt({ x: footX, y: L.footY + i * L.footLineH, size: F.foot, fill: C.muted, bg: C.ground, content: l }); });
  }
  cv.mark(false);
  o += cv.txt({ x: footX, y: L.urlY, size: F.url, weight: 600, fill: C.accent, bg: C.ground, content: SITE_DOMAIN });
  const sourcedX = tk === "og" ? footX + measure(SITE_DOMAIN, F.url, "sansSemiBold") + 14 : W - footX;
  o += cv.txt({ x: sourcedX, y: L.urlY, size: F.sourced, fill: C.muted, bg: C.ground, content: BRAND_SOURCED, anchor: tk === "og" ? "start" : "end" });
  if (parts) o = o.slice(0, restStart) + chunk(o.slice(restStart));
  o += "</svg>";

  const drawn: DrawnValue[] = [...frame.members].sort((p, q) => areaName(p).localeCompare(areaName(q))).map((code) => {
    const v = val(ind, code, year);
    return {
      code, name: areaName(code), year, value: v, display: display(ind, code, year), sub: subText(ind, code, year),
      kind: ind.kind(year), status: ind.status(code, year), labelled: L.labels.some((l) => l.code === code)
    };
  });
  return { svg: o, texts: cv.texts, drawn, brand: cv.brand, brandInPanel: cv.brandInPanel, fills, alt: altText, layout: L, measure: parts };
}

/** One sentence per map: what it shows, when, and every council's value, A to Z. */
export function alt(L: Layout, year: number): string {
  const { ind, frame } = L;
  const rows = [...frame.members].sort((p, q) => areaName(p).localeCompare(areaName(q))).map((c) => `${areaName(c)} ${display(ind, c, year)}`);
  // The title keeps its capitals: "White British" is a name.
  return `Map: ${ind.title}, ${yearPhrase(ind, year)}. ${frame.subtitle}. ${rows.join("; ")}.`;
}

/** A still: one year, labels fully shown. */
export function renderStill(frame: Frame, ind: Indicator, tk: TemplateKey, year: number, opts: { measure?: string } = {}): RenderResult {
  if (!ind.years.includes(year)) throw new Error(`${ind.id} has no ${year}`);
  const L = buildLayout(frame, tk, ind);
  return render(L, { fromYear: year, toYear: year, t: 0, labelYear: year, labelAlpha: 1, pos: ind.years.indexOf(year), zoom: 1 }, opts);
}

// ---------- QA gates: fail loudly rather than ship an unreadable or unsourced card ----------
export const DASHES = /[\u2013\u2014]| - |&mdash;|&ndash;/;
/** No ranking language: areas are never ordered by a value. */
export const RANKING_WORDS = /\b(highest|lowest|fastest|slowest|most|least|top|bottom|largest|smallest|biggest|ranked|ranking|rank|league)\b/i;
/** Neutral verbs for population and ethnicity: a share "fell" or "rose", nothing more. */
export const LOADED_WORDS = /\b(spread|spreading|replaced|replacement|influx|flood|swamp\w*|invasion|takeover|overrun|surge|plummet\w*|soar\w*)\b/i;

const boxesOverlap = (a: Box, b: Box) => a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;

export function qa(res: RenderResult): string[] {
  const errs: string[] = [];
  const L = res.layout, { ind, t } = L;
  for (const tx of res.texts) {
    const need = tx.size >= 24 || (tx.size >= 18.66 && tx.weight >= 600) ? 3 : 4.5;
    const c = contrast(tx.fill, tx.bg);
    if (c < need) errs.push(`contrast ${c.toFixed(2)} < ${need} for "${tx.content}" (${tx.fill} on ${tx.bg})`);
    if (DASHES.test(tx.content)) errs.push(`dash in "${tx.content}"`);
    if (RANKING_WORDS.test(tx.content)) errs.push(`ranking word in "${tx.content}"`);
    if (LOADED_WORDS.test(tx.content)) errs.push(`loaded word in "${tx.content}"`);
    if (L.tk === "story" && tx.content && (tx.y - tx.size < t.safeTop || tx.y > L.H - t.safeBottom))
      errs.push(`text in the story safe zone: "${tx.content}" at y ${tx.y.toFixed(0)}`);
    if (L.tk === "inline" && tx.role === "value" && tx.size < 26) errs.push(`inline value "${tx.content}" at ${tx.size} units, under 26`);
    if (tx.content && tx.x - 0.5 > L.W) errs.push(`text off the canvas: "${tx.content}"`);
  }
  // No two text elements may overlap, except lines stacked inside one plate.
  const boxes = res.texts.filter((x) => x.content).map((x) => {
    const w = measure(x.content, x.size, x.family === FONT_SERIF ? "serifSemiBold" : x.weight >= 600 ? "sansSemiBold" : "sans");
    const left = x.anchor === "middle" ? x.x - w / 2 : x.anchor === "end" ? x.x - w : x.x;
    return { x: left, y: x.y - x.size * 0.78, w, h: x.size * 0.98, tx: x };
  });
  for (let i = 0; i < boxes.length; i++) for (let j = i + 1; j < boxes.length; j++) {
    if (boxes[i].tx.plate && boxes[i].tx.plate === boxes[j].tx.plate) continue;
    if (boxesOverlap(boxes[i], boxes[j])) errs.push(`text overlaps: "${boxes[i].tx.content}" and "${boxes[j].tx.content}"`);
  }
  if (RANKING_WORDS.test(res.alt) || LOADED_WORDS.test(res.alt)) errs.push("ranking or loaded word in the alt text");
  if (res.brand < 4 || res.brandInPanel < 2) errs.push(`branding: ${res.brand} marks, ${res.brandInPanel} inside the map`);
  const Ls = ind.scale.colours.map(oklabLightness);
  if (ind.scale.type === "sequential" && !Ls.every((l, i) => i === 0 || l > Ls[i - 1])) errs.push("sequential ramp not rising in lightness");
  // Plates: inside the panel, clear of each other and of the brand tags, text inside the plate.
  const P = L.panel;
  const plates = L.labels.map((lb) => ({ code: lb.code, x: lb.x - lb.w / 2, y: lb.y - lb.h / 2, w: lb.w, h: lb.h, lb }));
  for (const p of plates) {
    if (p.x < P.x || p.y < P.y || p.x + p.w > P.x + P.w || p.y + p.h > P.y + P.h) errs.push(`plate for ${areaName(p.code)} leaves the panel`);
    for (const tg of L.tags) if (boxesOverlap(p, tg)) errs.push(`plate for ${areaName(p.code)} covers a brand tag`);
    const textW = Math.max(...p.lb.nameLines.map((l) => measure(l, p.lb.type.name, p.lb.nameFont)),
      ...(p.lb.showSub ? [measure(res.drawn.find((d) => d.code === p.code)?.sub ?? "", p.lb.type.sub)] : []),
      measure(res.drawn.find((d) => d.code === p.code)?.display ?? "", p.lb.type.val, "sansSemiBold"));
    if (textW > p.w - 2 * p.lb.pad + 0.5) errs.push(`text wider than the plate for ${areaName(p.code)}`);
  }
  for (let i = 0; i < plates.length; i++) for (let j = i + 1; j < plates.length; j++)
    if (boxesOverlap(plates[i], plates[j])) errs.push(`plates overlap: ${areaName(plates[i].code)} and ${areaName(plates[j].code)}`);
  for (const d of res.drawn) {
    if (d.kind === "projection" && !projectionsEnabled()) errs.push(`projected year ${d.year} drawn with MAPS_PROJECTIONS off`);
  }
  // A labelled value must match what the registry says, character for character.
  for (const tx of res.texts.filter((x) => x.role === "value")) {
    if (!res.drawn.some((d) => d.display === tx.content)) errs.push(`value "${tx.content}" not in the manifest`);
  }
  return errs;
}

export function renderChecked(frame: Frame, ind: Indicator, tk: TemplateKey, year: number): RenderResult {
  const res = renderStill(frame, ind, tk, year);
  const errs = qa(res);
  if (errs.length) throw new Error(`QA failed for ${ind.id}/${frame.id}/${tk}-${year}:\n  ${errs.join("\n  ")}`);
  return res;
}

// ---------- Clip end card: the fifth brand place ----------
export function endCard(L: Layout, lastSvg: string): string {
  const { W, H } = L, s = L.t.s, ind = L.ind;
  const inner = lastSvg.replace(/^<svg[^>]*>/, "").replace(/<\/svg>$/, "");
  const m = 200 * s;
  let o = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}"><g opacity="0.06">${inner}</g>`;
  o += `<rect width="${W}" height="${H}" fill="${C.ground}" opacity="0.7"/>`;
  o += `<g transform="translate(${n2(W / 2 - m / 2)},${n2(H * 0.3)})">${markRects(m)}</g>`;
  const line = (y: number, size: number, fill: string, text: string, weight = 400, family = FONT_SANS) =>
    `<text x="${W / 2}" y="${n2(y)}" text-anchor="middle" font-family="${family}" font-weight="${weight}" font-size="${n2(size)}" fill="${fill}">${esc(text)}</text>`;
  o += line(H * 0.3 + m + 80 * s, 58 * s, C.text, BRAND_NAME, 600, FONT_SERIF);
  o += line(H * 0.3 + m + 140 * s, 40 * s, C.accent, SITE_DOMAIN, 600);
  o += line(H * 0.3 + m + 190 * s, 26 * s, C.muted, BRAND_SOURCED);
  let y = H * 0.3 + m + 260 * s;
  for (const src of [...new Set(ind.years.map((yr) => ind.source(yr)))])
    for (const l of wrap(src, 19 * s, W - 160)) { o += line(y, 19 * s, C.muted, l); y += 27 * s; }
  return o + "</svg>";
}

