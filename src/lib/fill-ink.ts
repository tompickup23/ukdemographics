/**
 * Ink for text drawn on a filled shape, chosen by contrast and never by eye.
 *
 * A hex fill gets white or the dark ground, whichever stands further off it. A token fill
 * changes between the light and dark pages, so it gets the matching `--on-*` token from
 * global.css, which changes with it. Any other fill returns null and the stylesheet's
 * own colour applies. tests/fill-ink.test.ts holds every party colour to 4.5:1.
 */
import { contrast } from "./map/colour";

export const INK_ON_DARK_FILL = "#ffffff";
export const INK_ON_LIGHT_FILL = "#0f1317";

const TOKEN_INK: Record<string, string> = {
  "var(--accent)": "var(--on-accent)",
  "var(--coral)": "var(--on-coral)",
};

const HEX = /^#[0-9a-f]{6}$/i;

export function inkOnFill(fill: string): string | null {
  const value = fill.trim();
  if (HEX.test(value)) {
    return contrast(INK_ON_DARK_FILL, value) >= contrast(INK_ON_LIGHT_FILL, value) ? INK_ON_DARK_FILL : INK_ON_LIGHT_FILL;
  }
  return TOKEN_INK[value] ?? null;
}
