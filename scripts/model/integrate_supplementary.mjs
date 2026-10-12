/**
 * Integrate all supplementary data dimensions into ethnic-projections.json
 *
 * Adds:
 * - English proficiency (TS029) — observed 2021
 * - Language (TS024) — observed 2021
 * - Convergence index (Index of Dissimilarity) — computed from ethnic composition
 */
import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { applyDiversityIndices } from "./lib/diversity-index.mjs";

const SITE_OUTPUT = path.resolve("src/data/live/ethnic-projections.json");
const PROFICIENCY_PATH = path.resolve("data/raw/census_base/ts029_english_proficiency_2021.csv");

const existing = JSON.parse(readFileSync(SITE_OUTPUT, "utf8"));

function parseCsvLine(line) {
  const f = []; let c = ""; let q = false;
  for (const ch of line) { if (ch === '"') q = !q; else if (ch === "," && !q) { f.push(c.trim()); c = ""; } else c += ch; }
  f.push(c.trim()); return f;
}

// ============================================================
// English Proficiency (TS029)
// ============================================================
console.log("Integrating English proficiency...");
const profLines = readFileSync(PROFICIENCY_PATH, "utf8").split("\n").filter(l => l.trim());

const proficiency = new Map();
for (let i = 1; i < profLines.length; i++) {
  const cols = parseCsvLine(profLines[i]);
  const code = cols[0], name = cols[2], pop = parseFloat(cols[3]);
  if (!code || isNaN(pop)) continue;
  if (!proficiency.has(code)) proficiency.set(code, { total: 0, english: 0, notEnglish: 0, canSpeak: 0, cannotSpeakWell: 0, cannotSpeak: 0 });
  const p = proficiency.get(code);

  // Every sub-row label starts with "Main language is not English", so the
  // four sub-rows have to be matched before the subtotal that contains them.
  // Testing the subtotal first counted it again inside its own parts, which
  // doubled notEnglish and left cannotSpeak at zero for every area.
  if (name?.includes("Total")) p.total = pop;
  else if (name?.includes("Main language is English")) p.english = pop;
  else if (name?.includes("Cannot speak English well")) p.cannotSpeakWell = pop;
  else if (name?.includes("Cannot speak English")) p.cannotSpeak = pop;
  else if (name?.includes("Can speak English")) p.canSpeak += pop;
  else if (name?.includes("Main language is not English")) p.notEnglish = pop;
}

let profCount = 0;
for (const [code, area] of Object.entries(existing.areas)) {
  const p = proficiency.get(code);
  if (!p || p.total === 0) continue;

  area.englishProficiency = {
    mainLanguageEnglishPct: Math.round(p.english / p.total * 1000) / 10,
    notEnglishPct: Math.round(p.notEnglish / p.total * 1000) / 10,
    cannotSpeakEnglishPct: Math.round(p.cannotSpeak / p.total * 1000) / 10,
    source: "Census 2021 TS029"
  };
  profCount++;
}
console.log(`  ${profCount} areas with English proficiency data`);

// ============================================================
// C2: Convergence/Divergence Index
// ============================================================
console.log("Computing convergence indices...");

// Index of Dissimilarity and entropy index, from the Census 2021 composition.
// The logic lives in lib/diversity-index.mjs so recompute_diversity_index.mjs
// can rerun it alone.
const divCount = applyDiversityIndices(existing.areas);
console.log(`  ${divCount} areas with diversity indices`);

// Update metadata
// modelVersion and methodology are owned by run_hp_single_year.mjs, which is
// the model. This script is a consumer of the model output, so it must not
// stamp its own version: ten scripts used to write this field and whichever
// ran last won, which is how the published file came to report a version
// three releases behind the projections it actually contained.

existing.lastUpdated = new Date().toISOString().slice(0, 10);

writeFileSync(SITE_OUTPUT, JSON.stringify(existing, null, 2), "utf8");

// Spot checks
for (const code of ["E07000117", "E06000008", "E08000025", "E09000002"]) {
  const a = existing.areas[code]; if (!a) continue;
  console.log(`\n${a.areaName}:`);
  if (a.englishProficiency) console.log(`  English: ${a.englishProficiency.mainLanguageEnglishPct}%, Cannot speak: ${a.englishProficiency.cannotSpeakEnglishPct}%`);
  if (a.diversityIndex) console.log(`  Entropy: ${a.diversityIndex.entropy}, Level: ${a.diversityIndex.diversityLevel}`);
}

console.log("\nDone.");
