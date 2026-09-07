/**
 * Derive Census 2021 English proficiency entries for the unitary authorities
 * created by the April 2023 Local Government Reorganisation.
 *
 * NOMIS publishes TS029 on 2022 local authority districts (TYPE154), which is
 * 331 areas and does not include Cumberland, Westmorland and Furness, North
 * Yorkshire or Somerset. Those four authorities are exact unions of 2022
 * districts, so their Census counts are the sums of the districts they
 * replaced and every percentage recomputes from those sums with the same
 * formulas fetch-nomis-census.mjs uses.
 *
 * The predecessor lists come from src/data/lookups/lad22-to-lad23.json, which
 * scripts/fetch/fetch-lad-successors.mjs builds from the ONS Open Geography
 * Portal LAD22_LAD23_UK_LU_v1 lookup. Nothing here is typed in by hand.
 *
 * fetch-nomis-census.mjs calls applySuccessorAggregates() as its final build
 * step, so a re-fetch reproduces these entries. Run this file directly to
 * patch the committed JSON without re-fetching NOMIS:
 *
 *   node scripts/build/derive-census-english-successors.mjs
 */
import { readFileSync, writeFileSync } from "node:fs";

const LOOKUP_PATH = "src/data/lookups/lad22-to-lad23.json";
const TARGET_PATH = "src/data/live/census-english-proficiency.json";

const COUNT_FIELDS = [
  "total",
  "mainEnglish",
  "mainNotEnglishVeryWell",
  "mainNotEnglishWell",
  "mainNotEnglishNotWell",
  "mainNotEnglishCannot",
];

/**
 * Add one entry per April 2023 successor authority to an English proficiency
 * dataset, summing the counts of its predecessor districts. Mutates and
 * returns the dataset. Successors already carrying their own NOMIS row are
 * left alone, so a future NOMIS release on 2023 geography wins.
 */
export function applySuccessorAggregates(data) {
  const lookup = JSON.parse(readFileSync(LOOKUP_PATH, "utf8"));
  const added = [];

  for (const [code, entry] of Object.entries(lookup.successors)) {
    if (data.areas[code]) continue;

    const parts = entry.predecessors.filter((p) => data.areas[p.code]);
    if (parts.length !== entry.predecessors.length) {
      const absent = entry.predecessors
        .filter((p) => !data.areas[p.code])
        .map((p) => p.code)
        .join(", ");
      throw new Error(
        `${code} ${entry.successorName} cannot be derived: no source rows for ${absent}`,
      );
    }

    const agg = { areaName: entry.successorName };
    for (const field of COUNT_FIELDS) {
      agg[field] = parts.reduce(
        (sum, p) => sum + (data.areas[p.code][field] ?? 0),
        0,
      );
    }

    // Same formulas as buildEnglishProficiency() in fetch-nomis-census.mjs.
    agg.cannotSpeakWellPct = +(
      ((agg.mainNotEnglishNotWell + agg.mainNotEnglishCannot) / agg.total) *
      100
    ).toFixed(2);
    agg.nonEnglishPct = +(
      ((agg.total - agg.mainEnglish) / agg.total) *
      100
    ).toFixed(2);

    agg.derivedFrom = entry.predecessors.map((p) => ({
      code: p.code,
      name: p.name,
    }));
    agg.sourceNote = `Aggregated from the 2021 districts of ${entry.predecessors
      .map((p) => p.name)
      .join(", ")}. ${entry.successorName} was created on 1 April 2023 and has no Census 2021 output of its own.`;

    data.areas[code] = agg;
    added.push(`${code} ${entry.successorName}`);
  }

  return { data, added };
}

// Direct run: patch the committed dataset in place.
if (import.meta.url === `file://${process.argv[1]}`) {
  const data = JSON.parse(readFileSync(TARGET_PATH, "utf8"));
  const { added } = applySuccessorAggregates(data);
  writeFileSync(TARGET_PATH, JSON.stringify(data, null, 2) + "\n");
  console.log(
    `${Object.keys(data.areas).length} areas in ${TARGET_PATH}; added ${added.length}.`,
  );
  for (const a of added) console.log(`  ${a}`);
}
