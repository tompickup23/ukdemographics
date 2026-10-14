/**
 * One colour per ethnic group, used everywhere a group is drawn: the place page's
 * composition timeline, the map block's composition bars and swatches, and the share
 * cards. Fixed order, never re-sorted by value.
 *
 * Chosen 14 October 2026 (maps plan v2.2, issue I24) by search, not by eye:
 * - every pair is 0.09 or more apart in OKLab (src/lib/map/colour.ts seenDistance) in
 *   normal vision and under protanopia, deuteranopia and tritanopia; the palette it
 *   replaces had Black 0.040 from White Other under tritanopia and 0.091 from White
 *   British in normal vision, both violets;
 * - no red, and no brown or skin-like tone, for any group;
 * - White British stays the brand indigo of its map ramp, and White Other is a separate
 *   slate, not a shade of it;
 * - each fill stands 3:1 or more off the dark ground and has a label ink at 4.5:1.
 * tests/ethnic-palette.test.ts holds every one of these.
 *
 * `line` is the stroke for line charts on the light page, where the pale fills would not
 * reach 3:1 on white. Lines are labelled with the group name at their end, so colour is
 * never the only cue; the dark page draws lines in the fill colour.
 */
export const ETHNIC_GROUP_KEYS = ["white_british", "white_other", "asian", "black", "mixed", "other"] as const;
export type EthnicGroupKey = (typeof ETHNIC_GROUP_KEYS)[number];

export interface EthnicGroupColour {
  key: EthnicGroupKey;
  label: string;
  /** Segment, swatch and map-block colour, both schemes. */
  fill: string;
  /** Text drawn on the fill. */
  ink: "dark" | "light";
  /** Line chart stroke on the light page. */
  line: string;
}

export const ETHNIC_PALETTE: readonly EthnicGroupColour[] = [
  { key: "white_british", label: "White British", fill: "#7b74f2", ink: "dark", line: "#4338ca" },
  { key: "white_other", label: "White Other", fill: "#a7bedc", ink: "dark", line: "#3c4f62" },
  { key: "asian", label: "Asian", fill: "#f0b03e", ink: "dark", line: "#8a5a10" },
  { key: "black", label: "Black", fill: "#21b58f", ink: "dark", line: "#0b7f64" },
  { key: "mixed", label: "Mixed", fill: "#67edad", ink: "dark", line: "#2f7d1f" },
  { key: "other", label: "Other", fill: "#546a73", ink: "light", line: "#696e81" }
];

/** Ink hex values, matching --on-fill-light (dark ink) and --on-fill-dark (white). */
export const INK = { dark: "#05080a", light: "#ffffff" } as const;

export const ethnicColour = (key: string): EthnicGroupColour => {
  const c = ETHNIC_PALETTE.find((g) => g.key === key);
  if (!c) throw new Error(`no colour for ethnic group ${key}`);
  return c;
};
