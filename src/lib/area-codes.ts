/**
 * One authority, one area record.
 *
 * An ONS area code is not a stable key. A boundary change reissues it, and the
 * datasets that feed this site then disagree: some publish the authority under
 * its new code while the rest carry on under the old one. Nothing errors. The
 * authority simply arrives twice and is filed twice.
 *
 * That happened here. Barnsley sat in ethnic-projections.json as both E08000016
 * and E08000038, Sheffield as both E08000019 and E08000039, with different
 * projections under each: Barnsley's 2041 White British share read 85.7% under
 * one code and 77.6% under the other. /places listed 320 rows for 318
 * authorities, both national aggregates on the homepage counted 801,000 people
 * twice, and the Sheffield duplicate was counted twice in every "areas below
 * 50%" tally.
 *
 * The fix has two halves and both are needed. Codes are canonicalised in the
 * data by scripts/model/canonicalise_area_codes.mjs, so the area map holds one
 * record per authority. Codes arriving from a dataset that uses the other form
 * are resolved through canonicalAreaCode() at the point of lookup, so the
 * region lookup and the constituency crosswalk still find that record.
 *
 * The alias table, the reason this direction was chosen and the provenance are
 * in src/data/lookups/area-code-aliases.json, which is the single source both
 * this module and the Node scripts read.
 */
import rawAliases from "../data/lookups/area-code-aliases.json";

const aliasData = rawAliases as { aliases: Record<string, string> };

/** Alternative code to the code this site files the authority's record under. */
export const AREA_CODE_ALIASES: Readonly<Record<string, string>> = Object.freeze({
  ...aliasData.aliases
});

/** Every code that must never appear as a key in a generated area map. */
export const ALIAS_AREA_CODES: readonly string[] = Object.freeze(Object.keys(AREA_CODE_ALIASES));

/** Every code an area record may legitimately be filed under. */
export const CANONICAL_AREA_CODES: readonly string[] = Object.freeze([
  ...new Set(Object.values(AREA_CODE_ALIASES))
]);

/**
 * The code this site files an authority's record under. Returns the code
 * unchanged when it is not an alias, which is every code but two.
 */
export function canonicalAreaCode(code: string): string {
  return AREA_CODE_ALIASES[code] ?? code;
}

/** True when this code is an alternative form that must be resolved before use. */
export function isAliasAreaCode(code: string): boolean {
  return code in AREA_CODE_ALIASES;
}
