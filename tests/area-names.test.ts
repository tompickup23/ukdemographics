import { describe, expect, it } from "vitest";

import { findAreaNameMismatches, PUNCTUATION_ALLOWLIST } from "../scripts/lib/area-name-check.mjs";

// Guards against a repeat of the Shepway → Folkestone and Hythe rename sitting
// unnoticed in ethnic-projections.json: Shepway District Council was renamed
// on 1 April 2018, E07000112 didn't change, and the site carried the old
// name for eight years because nothing compared it to the ONS name. See
// scripts/lib/area-name-check.mjs for the comparison method.
describe("ethnic-projections.json area names vs ONS", () => {
  it("has no area name that substantively disagrees with the ONS LAD24 name", () => {
    const { realMismatches } = findAreaNameMismatches();

    // A genuine mismatch here means either a stale name (fix the data, add a
    // redirect in astro.config.mjs, and update this test) or an unlisted
    // punctuation quirk (add it to PUNCTUATION_ALLOWLIST with a comment
    // explaining it, the way St Helens/St. Helens is below).
    expect(realMismatches).toEqual([]);
  });

  it("only reports punctuation-only differences that are explicitly allow-listed", () => {
    const { punctuationMismatches } = findAreaNameMismatches();
    const allowlistedCodes = new Set(PUNCTUATION_ALLOWLIST.map((entry) => entry.code));

    const unlisted = punctuationMismatches.filter((mismatch) => !allowlistedCodes.has(mismatch.code));

    // A new punctuation-only difference is still worth a human decision: ONS
    // could have genuinely renamed the authority in a way that happens to
    // read as punctuation-only (unlikely, but the allow-list is the place to
    // record that decision was made, not to wave it through silently).
    expect(unlisted).toEqual([]);
  });

  it("keeps the allow-list itself honest: every entry is a real punctuation-only pair", () => {
    // If an allow-listed authority is ever renamed for real, its ONS name
    // will stop being a punctuation-only variant of the site's name and this
    // catches it, rather than the entry quietly shielding a genuine rename.
    const { punctuationMismatches, realMismatches } = findAreaNameMismatches();
    const reported = new Set([...punctuationMismatches, ...realMismatches].map((m) => m.code));

    for (const entry of PUNCTUATION_ALLOWLIST) {
      expect(punctuationMismatches.some((m) => m.code === entry.code)).toBe(true);
      expect(realMismatches.some((m) => m.code === entry.code)).toBe(false);
    }

    // St Helens (E08000013): ONS's own LAD24 registry carries a stop after
    // "St" here but not for "St Albans" (E07000240). House style drops the
    // stop for both, matching every other "St " name in the file.
    expect(reported.has("E08000013")).toBe(true);
  });
});
