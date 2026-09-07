#!/usr/bin/env node
/**
 * Prints every areaName in ethnic-projections.json that disagrees with the
 * ONS LAD24 name for the same code, split into real renames and punctuation-
 * only differences. See scripts/lib/area-name-check.mjs for the method and
 * why the ONS name comes from data/geography/lad24-simplified.geojson rather
 * than src/data/lookups/district-to-utla.json.
 *
 *   node scripts/check/check-area-names.mjs
 *
 * Exits 1 if any real (non-punctuation) mismatch is found.
 */
import { findAreaNameMismatches, PUNCTUATION_ALLOWLIST } from "../lib/area-name-check.mjs";

const { realMismatches, punctuationMismatches, missingFromOns } = findAreaNameMismatches();

console.log("Area name audit — ethnic-projections.json vs ONS LAD24NM\n");

if (realMismatches.length === 0) {
  console.log("No real mismatches found.");
} else {
  console.log(`${realMismatches.length} real mismatch(es):`);
  for (const { code, siteName, onsName } of realMismatches) {
    console.log(`  ${code}: site says "${siteName}", ONS says "${onsName}"`);
  }
}

console.log(`\n${punctuationMismatches.length} punctuation-only difference(s):`);
for (const { code, siteName, onsName } of punctuationMismatches) {
  const known = PUNCTUATION_ALLOWLIST.some((entry) => entry.code === code);
  const flag = known ? "(allow-listed)" : "(NOT allow-listed — add to scripts/lib/area-name-check.mjs)";
  console.log(`  ${code}: site says "${siteName}", ONS says "${onsName}" ${flag}`);
}

if (missingFromOns.length > 0) {
  console.log(`\n${missingFromOns.length} code(s) with no LAD24 entry (outside England/Wales, or a reissued alias):`);
  for (const { code, siteName } of missingFromOns) {
    console.log(`  ${code}: "${siteName}"`);
  }
}

if (realMismatches.length > 0) {
  console.log("\nFAIL: real mismatches found.");
  process.exit(1);
}

console.log("\nOK.");
