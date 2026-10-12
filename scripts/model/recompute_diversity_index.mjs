/**
 * Recompute diversityIndex alone in ethnic-projections.json.
 *
 * Runs the same calculation as integrate_supplementary.mjs (shared through
 * lib/diversity-index.mjs) and touches nothing else: not englishProficiency,
 * not lastUpdated. Use it after the Census fields change.
 *
 *   node scripts/model/recompute_diversity_index.mjs [--file <path>] [--aliases <path>]
 *
 * --aliases names the area-code alias table. A record filed under an alias
 * code whose canonical code is also in the file is a duplicate of that
 * authority and is left out of the national composition, so the authority is
 * counted once. The UK Demographics file has no such duplicates; the Asylum
 * Stats file keeps Barnsley and Sheffield under both codes.
 */
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { applyDiversityIndices } from "./lib/diversity-index.mjs";
import { writeJsonLike } from "../lib/json-like.mjs";

function arg(name, fallback) {
  const i = process.argv.indexOf(name);
  return i >= 0 ? process.argv[i + 1] : fallback;
}

const file = path.resolve(arg("--file", "src/data/live/ethnic-projections.json"));
const aliasPath = path.resolve(arg("--aliases", "src/data/lookups/area-code-aliases.json"));

const original = readFileSync(file, "utf8");
const data = JSON.parse(original);

const aliases = existsSync(aliasPath) ? JSON.parse(readFileSync(aliasPath, "utf8")).aliases ?? {} : {};
const skipCodes = new Set(
  Object.entries(aliases)
    .filter(([alias, canonical]) => data.areas[alias] && data.areas[canonical])
    .map(([alias]) => alias)
);

const before = new Map(Object.entries(data.areas).map(([c, a]) => [c, JSON.stringify(a.diversityIndex)]));
const count = applyDiversityIndices(data.areas, { skipCodes });
const changed = Object.entries(data.areas).filter(([c, a]) => JSON.stringify(a.diversityIndex) !== before.get(c)).length;

writeJsonLike(file, data, original);
console.log(`${count} areas with diversity indices; ${changed} changed; national composition skips ${[...skipCodes].join(", ") || "none"}`);
