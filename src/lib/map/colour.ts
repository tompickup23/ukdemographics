/** Colour arithmetic for the map renderer and its QA gates. Hex colours only (#rrggbb). */

const rgb = (h: string): [number, number, number] => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16)) as [number, number, number];
const toHex = (a: number[]): string =>
  "#" + a.map((v) => Math.round(Math.max(0, Math.min(255, v))).toString(16).padStart(2, "0")).join("");

/** Straight sRGB blend: `t` of the way from `a` to `b`. */
export function mix(a: string, b: string, t: number): string {
  const [x, y] = [rgb(a), rgb(b)];
  return toHex(x.map((v, i) => v + (y[i] - v) * t));
}

const linear = (c: number) => { c /= 255; return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4; };

/** WCAG 2 relative luminance. */
export function luminance(h: string): number {
  const [r, g, b] = rgb(h).map(linear);
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/** WCAG 2 contrast ratio between two colours. */
export function contrast(a: string, b: string): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((p, q) => q - p);
  return (hi + 0.05) / (lo + 0.05);
}

/** OKLab lightness, 0 to 1: the check that a sequential ramp gets steadily lighter. */
export function oklabLightness(h: string): number {
  const [r, g, b] = rgb(h).map(linear);
  const l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b);
  const m = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b);
  const s = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b);
  return 0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s;
}

// ---------- Colour vision ----------
// Machado, Oliveira and Fernandes (2009), "A physiologically-based model for simulation of
// color vision deficiency", IEEE TVCG 15(6), severity 1.0 matrices, applied in linear RGB.
const CVD: Record<"protan" | "deutan" | "tritan", number[][]> = {
  protan: [[0.152286, 1.052583, -0.204868], [0.114503, 0.786281, 0.099216], [-0.003882, -0.048116, 1.051998]],
  deutan: [[0.367322, 0.860646, -0.227968], [0.280085, 0.672501, 0.047413], [-0.01182, 0.04294, 0.968881]],
  tritan: [[1.255528, -0.076749, -0.178779], [-0.078411, 0.930809, 0.147602], [0.004733, 0.691367, 0.3039]]
};
export type Vision = "normal" | keyof typeof CVD;
export const VISIONS: Vision[] = ["normal", "protan", "deutan", "tritan"];

function oklab([r, g, b]: number[]): [number, number, number] {
  const l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b);
  const m = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b);
  const s = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b);
  return [0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s, 1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s, 0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s];
}

/** OKLab distance between two colours as seen with the given colour vision. */
export function seenDistance(a: string, b: string, vision: Vision = "normal"): number {
  const see = (h: string) => {
    const c = rgb(h).map(linear);
    if (vision === "normal") return oklab(c);
    return oklab(CVD[vision].map((row) => Math.max(0, Math.min(1, row[0] * c[0] + row[1] * c[1] + row[2] * c[2]))));
  };
  const [p, q] = [see(a), see(b)];
  return Math.hypot(p[0] - q[0], p[1] - q[1], p[2] - q[2]);
}
