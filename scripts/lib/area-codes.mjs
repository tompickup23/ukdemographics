/**
 * Node-side twin of src/lib/area-codes.ts. Both read the same table from
 * src/data/lookups/area-code-aliases.json, so there is one source and no copy
 * to keep in step: a second hand-maintained copy of a mapping is how the two
 * halves of a fix drift apart.
 *
 * See src/lib/area-codes.ts for what the aliases are for.
 */
import { readFileSync } from "node:fs";
import path from "node:path";

const ALIAS_PATH = path.resolve("src/data/lookups/area-code-aliases.json");

const aliasFile = JSON.parse(readFileSync(ALIAS_PATH, "utf8"));

/** Alternative code to the code this site files the authority's record under. */
export const AREA_CODE_ALIASES = Object.freeze({ ...aliasFile.aliases });

/** Every code that must never appear as a key in a generated area map. */
export const ALIAS_AREA_CODES = Object.freeze(Object.keys(AREA_CODE_ALIASES));

/**
 * The code this site files an authority's record under. Returns the code
 * unchanged when it is not an alias, which is every code but two.
 */
export function canonicalAreaCode(code) {
  return AREA_CODE_ALIASES[code] ?? code;
}

/** True when this code is an alternative form that must be resolved before use. */
export function isAliasAreaCode(code) {
  return Object.prototype.hasOwnProperty.call(AREA_CODE_ALIASES, code);
}
