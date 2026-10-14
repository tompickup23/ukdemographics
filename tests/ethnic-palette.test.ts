/**
 * The ethnic group palette (maps plan v2.2, issue I24): separable in every colour vision,
 * no red, legible labels, and the one palette every surface draws from.
 */
import fs from "node:fs";
import { describe, expect, it } from "vitest";
import { ETHNIC_GROUP_KEYS, ETHNIC_PALETTE, INK } from "../src/lib/ethnic-palette";
import { VISIONS, contrast, seenDistance } from "../src/lib/map/colour";
import { GROUPS } from "../src/lib/map/place";

const DARK_GROUND = "#0f1317", DARK_PANEL = "#141a1f", WHITE = "#ffffff";

/** OKLCH hue in degrees, for the no-red rule. */
function hue(h: string): number {
  const lin = [1, 3, 5].map((i) => { const c = parseInt(h.slice(i, i + 2), 16) / 255; return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4; });
  const l = Math.cbrt(0.4122214708 * lin[0] + 0.5363325363 * lin[1] + 0.0514459929 * lin[2]);
  const m = Math.cbrt(0.2119034982 * lin[0] + 0.6806995451 * lin[1] + 0.1073969566 * lin[2]);
  const s = Math.cbrt(0.0883024619 * lin[0] + 0.2817188376 * lin[1] + 0.6299787005 * lin[2]);
  const a = 1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s, b = 0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s;
  return ((Math.atan2(b, a) * 180) / Math.PI + 360) % 360;
}
const chroma = (h: string) => {
  const lin = [1, 3, 5].map((i) => { const c = parseInt(h.slice(i, i + 2), 16) / 255; return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4; });
  const l = Math.cbrt(0.4122214708 * lin[0] + 0.5363325363 * lin[1] + 0.0514459929 * lin[2]);
  const m = Math.cbrt(0.2119034982 * lin[0] + 0.6806995451 * lin[1] + 0.1073969566 * lin[2]);
  const s = Math.cbrt(0.0883024619 * lin[0] + 0.2817188376 * lin[1] + 0.6299787005 * lin[2]);
  return Math.hypot(1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s, 0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s);
};

describe("ethnic group palette", () => {
  it("covers the six groups in the fixed order", () => {
    expect(ETHNIC_PALETTE.map((g) => g.key)).toEqual([...ETHNIC_GROUP_KEYS]);
  });

  it("keeps every pair of fills 0.09 or more apart in normal vision and three colour vision deficiencies", () => {
    const bad: string[] = [];
    for (const v of VISIONS) for (let i = 0; i < ETHNIC_PALETTE.length; i++) for (let j = i + 1; j < ETHNIC_PALETTE.length; j++) {
      const [p, q] = [ETHNIC_PALETTE[i], ETHNIC_PALETTE[j]];
      const d = seenDistance(p.fill, q.fill, v);
      if (d < 0.09) bad.push(`${v} ${p.label}/${q.label} ${d.toFixed(3)}`);
    }
    expect(bad).toEqual([]);
  });

  it("uses no red for any group: no saturated hue between 340 and 45 degrees", () => {
    for (const g of ETHNIC_PALETTE) for (const c of [g.fill, g.line]) {
      const h = hue(c);
      if (chroma(c) > 0.04) expect(h > 45 && h < 340, `${g.label} ${c} hue ${h.toFixed(0)}`).toBe(true);
    }
  });

  it("gives each fill 3:1 against the dark ground and a label ink at 4.5:1", () => {
    for (const g of ETHNIC_PALETTE) {
      expect(contrast(g.fill, DARK_GROUND), `${g.label} on the ground`).toBeGreaterThanOrEqual(3);
      expect(contrast(g.fill, DARK_PANEL), `${g.label} on the panel`).toBeGreaterThanOrEqual(3);
      expect(contrast(g.fill, INK[g.ink]), `${g.label} label ink`).toBeGreaterThanOrEqual(4.5);
    }
  });

  it("draws light-page lines at 3:1 or more against white", () => {
    for (const g of ETHNIC_PALETTE) expect(contrast(g.line, WHITE), `${g.label} line`).toBeGreaterThanOrEqual(3);
  });

  it("is the palette the map block and the timeline draw with", () => {
    expect(GROUPS.map((g) => [g.key, g.colour])).toEqual(ETHNIC_PALETTE.map((g) => [g.key, g.fill]));
    const timeline = fs.readFileSync("src/components/EthnicityTimeline.astro", "utf8");
    expect(timeline).toContain("ETHNIC_PALETTE");
    expect(timeline).not.toMatch(/#[0-9a-f]{6}/i);
  });
});

describe("line chart tokens", () => {
  it("match the palette in both schemes", () => {
    const css = fs.readFileSync("src/styles/global.css", "utf8");
    const dark = css.slice(css.indexOf("--eth-line-white-british: #7b74f2"));
    for (const g of ETHNIC_PALETTE) {
      const name = `--eth-line-${g.key.replace("_", "-")}`;
      expect(css, `${name} light`).toContain(`${name}: ${g.line};`);
      expect(dark, `${name} dark`).toContain(`${name}: ${g.fill};`);
    }
  });
});
