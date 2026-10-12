/**
 * Census ethnic group labels to the six groups this site publishes.
 *
 * Census 2021 TS021 and Census 2011 KS201EW label every detailed category as
 * "<high-level group>: <sub-category>". The high-level group, the text before
 * the colon, decides where a category goes. Matching on words anywhere in the
 * label is what went wrong before October 2026: "Mixed or Multiple ethnic
 * groups: White and Black African" contains "african", and a test for Black
 * that ran before the test for Mixed counted every person in the two Mixed
 * White and Black categories as Black.
 *
 * Shared by scripts/transform/transform-ethnicity.mjs and the Census rebase in
 * scripts/build/rebase-census-groups.mjs, so the two cannot drift apart.
 */

export const GROUP_KEYS = Object.freeze([
  "white_british",
  "white_other",
  "asian",
  "black",
  "mixed",
  "other"
]);

/** Labels of the all-persons row: TS021 2021, KS201EW 2011, and older forms. */
const TOTAL_LABELS = new Set([
  "total",
  "total: all usual residents",
  "all usual residents"
]);

/**
 * Classify one Census label.
 *
 * Returns { kind: "total" }, { kind: "parent" } for a high-level subtotal row
 * (no colon, counted again by its children), { kind: "group", group } for a
 * detailed category, or { kind: "unknown" } when the label is not recognised.
 */
export function classifyCensusEthnicLabel(label) {
  const name = String(label ?? "").toLowerCase().trim();
  if (!name) return { kind: "unknown" };
  if (TOTAL_LABELS.has(name) || name.includes("all categories")) return { kind: "total" };

  const colon = name.indexOf(":");
  if (colon < 0) return { kind: "parent" };

  const prefix = name.slice(0, colon).trim();
  const sub = name.slice(colon + 1).trim();

  if (prefix.startsWith("white")) {
    // "English/Welsh/Scottish/Northern Irish/British" (2011) and
    // "English, Welsh, Scottish, Northern Irish or British" (2021).
    if (sub.includes("british") && sub.includes("english")) return { kind: "group", group: "white_british" };
    return { kind: "group", group: "white_other" };
  }
  if (prefix.startsWith("mixed")) return { kind: "group", group: "mixed" };
  if (prefix.startsWith("asian")) return { kind: "group", group: "asian" };
  if (prefix.startsWith("black")) return { kind: "group", group: "black" };
  if (prefix.startsWith("other ethnic group")) return { kind: "group", group: "other" };

  return { kind: "unknown" };
}

/**
 * The transform's original contract: "total", one of GROUP_KEYS, or null for a
 * row that is not counted (a parent subtotal or an unrecognised label).
 */
export function mapEthnicGroup(label) {
  const c = classifyCensusEthnicLabel(label);
  if (c.kind === "total") return "total";
  if (c.kind === "group") return c.group;
  return null;
}
