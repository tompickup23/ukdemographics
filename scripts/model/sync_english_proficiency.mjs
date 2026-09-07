/**
 * Recompute the englishProficiency block in ethnic-projections.json, and the
 * currentProficiency copy of it in language-projections.json, from the
 * committed NOMIS TS029 file src/data/live/census-english-proficiency.json.
 *
 * integrate_supplementary.mjs owns these fields, but it reads a raw NOMIS CSV
 * under data/raw/census_base/, which is gitignored and absent from a fresh
 * checkout. That script's row classification used to count the "Main language
 * is not English" subtotal a second time inside its own four sub-rows, so
 * every area shipped a doubled notEnglishPct and a cannotSpeakEnglishPct of
 * zero. The classification is fixed, and this script applies the same result
 * to the committed data without the raw file.
 *
 * The three fields carry exactly the definitions integrate_supplementary.mjs
 * writes, to one decimal place:
 *   mainLanguageEnglishPct  main language is English, share of residents 3+
 *   notEnglishPct           main language is not English, share of residents 3+
 *   cannotSpeakEnglishPct   cannot speak English at all, share of residents 3+
 *
 * Run: node scripts/model/sync_english_proficiency.mjs
 */
import { readFileSync, writeFileSync } from "node:fs";

const CENSUS_PATH = "src/data/live/census-english-proficiency.json";
const PROJECTIONS_PATH = "src/data/live/ethnic-projections.json";
const LANGUAGE_PATH = "src/data/live/language-projections.json";

const census = JSON.parse(readFileSync(CENSUS_PATH, "utf8"));

const pct = (part, total) => Math.round((part / total) * 1000) / 10;

const blocks = new Map();
for (const [code, a] of Object.entries(census.areas)) {
  if (!a.total) continue;
  blocks.set(code, {
    mainLanguageEnglishPct: pct(a.mainEnglish ?? 0, a.total),
    notEnglishPct: pct(a.total - (a.mainEnglish ?? 0), a.total),
    cannotSpeakEnglishPct: pct(a.mainNotEnglishCannot ?? 0, a.total),
    source: "Census 2021 TS029",
  });
}

const projections = JSON.parse(readFileSync(PROJECTIONS_PATH, "utf8"));
let changed = 0;
let missing = 0;
for (const [code, area] of Object.entries(projections.areas)) {
  const block = blocks.get(code);
  if (!block) {
    delete area.englishProficiency;
    missing++;
    continue;
  }
  const before = JSON.stringify(area.englishProficiency ?? null);
  area.englishProficiency = { ...block };
  if (before !== JSON.stringify(area.englishProficiency)) changed++;
}
writeFileSync(PROJECTIONS_PATH, JSON.stringify(projections, null, 2), "utf8");
console.log(
  `${PROJECTIONS_PATH}: ${changed} areas rewritten, ${missing} with no TS029 row.`,
);

// language-projections.json copies the same block, minus the source string.
const language = JSON.parse(readFileSync(LANGUAGE_PATH, "utf8"));
let langChanged = 0;
for (const [code, area] of Object.entries(language.areas)) {
  if (!area.dataAvailable) continue;
  const block = blocks.get(code);
  if (!block) continue;
  const { source, ...levels } = block;
  const before = JSON.stringify(area.currentProficiency ?? null);
  area.currentProficiency = levels;
  if (before !== JSON.stringify(area.currentProficiency)) langChanged++;
}
writeFileSync(LANGUAGE_PATH, JSON.stringify(language, null, 2), "utf8");
console.log(`${LANGUAGE_PATH}: ${langChanged} areas rewritten.`);
