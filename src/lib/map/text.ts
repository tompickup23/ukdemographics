/**
 * Text measurement for the map renderer, from the fonts' own advance widths.
 *
 * resvg draws the text and cannot report how wide it came out, so plates and the footer
 * are sized from the TTF files themselves: cmap (format 4) maps each character to a
 * glyph, hmtx gives the glyph's advance. Kerning is ignored, which only ever makes the
 * measured width a little wider than the drawn one, so a plate sized from it never clips.
 */
import { readFileSync } from "node:fs";
import { FONT_SANS, FONT_SERIF, RESVG_FONT_FILES } from "./brand";

export type FontKey = "sans" | "sansSemiBold" | "serifSemiBold";

interface Metrics {
  unitsPerEm: number;
  advance: (codePoint: number) => number;
}

function parseTtf(buf: Buffer): Metrics {
  const tables = new Map<string, number>();
  const numTables = buf.readUInt16BE(4);
  for (let i = 0; i < numTables; i++) {
    const rec = 12 + i * 16;
    tables.set(buf.toString("latin1", rec, rec + 4), buf.readUInt32BE(rec + 8));
  }
  const at = (tag: string): number => {
    const off = tables.get(tag);
    if (off == null) throw new Error(`font has no ${tag} table`);
    return off;
  };
  const unitsPerEm = buf.readUInt16BE(at("head") + 18);
  const numberOfHMetrics = buf.readUInt16BE(at("hhea") + 34);
  const hmtx = at("hmtx");
  const advanceOfGlyph = (g: number) => buf.readUInt16BE(hmtx + 4 * Math.min(g, numberOfHMetrics - 1));

  // cmap: the Windows Unicode BMP subtable, format 4.
  const cmap = at("cmap");
  let sub = -1;
  for (let i = 0, n = buf.readUInt16BE(cmap + 2); i < n; i++) {
    const rec = cmap + 4 + i * 8;
    const platform = buf.readUInt16BE(rec), encoding = buf.readUInt16BE(rec + 2);
    const off = cmap + buf.readUInt32BE(rec + 4);
    if (((platform === 3 && encoding === 1) || platform === 0) && buf.readUInt16BE(off) === 4) { sub = off; break; }
  }
  if (sub < 0) throw new Error("font has no format 4 cmap");
  const segX2 = buf.readUInt16BE(sub + 6), seg = segX2 / 2;
  const ends = sub + 14, starts = ends + segX2 + 2, deltas = starts + segX2, ranges = deltas + segX2;
  const glyphOf = (cp: number): number => {
    for (let i = 0; i < seg; i++) {
      if (buf.readUInt16BE(ends + 2 * i) < cp) continue;
      const start = buf.readUInt16BE(starts + 2 * i);
      if (start > cp) return 0;
      const delta = buf.readInt16BE(deltas + 2 * i), rangeOff = buf.readUInt16BE(ranges + 2 * i);
      if (rangeOff === 0) return (cp + delta) & 0xffff;
      const g = buf.readUInt16BE(ranges + 2 * i + rangeOff + 2 * (cp - start));
      return g === 0 ? 0 : (g + delta) & 0xffff;
    }
    return 0;
  };
  const cache = new Map<number, number>();
  return {
    unitsPerEm,
    advance: (cp) => {
      let a = cache.get(cp);
      if (a == null) { a = advanceOfGlyph(glyphOf(cp)); cache.set(cp, a); }
      return a;
    }
  };
}

let fonts: Record<FontKey, Metrics> | null = null;
function metrics(key: FontKey): Metrics {
  if (!fonts) {
    const [regular, semiBold, serif] = RESVG_FONT_FILES.map((f) => parseTtf(readFileSync(f)));
    fonts = { sans: regular, sansSemiBold: semiBold, serifSemiBold: serif };
  }
  return fonts[key];
}

/** The font a text element is drawn in, from its family and weight. */
export function fontKey(family: string, weight: number): FontKey {
  if (family === FONT_SERIF) return "serifSemiBold";
  return weight >= 600 ? "sansSemiBold" : "sans";
}

/** Width of `str` in user units at `size`, plus any letter spacing. */
export function measure(str: string, size: number, key: FontKey = "sans", letterSpacing = 0): number {
  const m = metrics(key);
  let units = 0, n = 0;
  for (const ch of String(str)) { units += m.advance(ch.codePointAt(0)!); n++; }
  return (units / m.unitsPerEm) * size + letterSpacing * Math.max(0, n - 1);
}

/** Greedy word wrap to `maxWidth`. A single word wider than the line keeps its own line. */
export function wrap(text: string, size: number, maxWidth: number, key: FontKey = "sans"): string[] {
  const lines: string[] = [];
  let cur = "";
  for (const word of text.split(" ")) {
    const next = cur ? `${cur} ${word}` : word;
    if (cur && measure(next, size, key) > maxWidth) { lines.push(cur); cur = word; } else cur = next;
  }
  if (cur) lines.push(cur);
  return lines;
}

/** Escape text for an SVG text node or attribute. */
export const esc = (s: string): string =>
  String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

export { FONT_SANS, FONT_SERIF };
