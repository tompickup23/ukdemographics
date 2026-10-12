/**
 * Index of Dissimilarity and entropy diversity index for each area, from the
 * Census 2021 composition in ethnic-projections.json.
 *
 * Moved out of integrate_supplementary.mjs (October 2026) so that the index
 * can be recomputed on its own, after a correction to the Census fields,
 * without re-running the rest of that script, which also rewrites
 * englishProficiency.
 *
 * D = 0.5 x sum |p_i - P| where p_i is the area share and P the national share,
 * on a 0 to 100 scale. Entropy H = -sum p_i ln(p_i) / ln(6), on 0 to 1.
 */

const GROUPS = ["white_british", "white_other", "asian", "black", "mixed", "other"];

/**
 * National composition from current.groups_absolute and current.total_population.
 *
 * `skipCodes` lists records that duplicate another record under a second ONS
 * code (Asylum Stats keeps Barnsley and Sheffield under both), so an authority
 * is counted once. With no duplicates in the file it changes nothing.
 */
export function nationalComposition(areas, skipCodes = new Set()) {
  const national = { white_british: 0, white_other: 0, asian: 0, black: 0, mixed: 0, other: 0, total: 0 };
  for (const [code, area] of Object.entries(areas)) {
    if (skipCodes.has(code)) continue;
    if (!area.current?.groups_absolute) continue;
    for (const g of Object.keys(national)) {
      if (g === "total") national.total += area.current.total_population || 0;
      else national[g] += area.current.groups_absolute[g] || 0;
    }
  }
  const nationalPct = {};
  for (const g of GROUPS) {
    nationalPct[g] = national.total > 0 ? national[g] / national.total * 100 : 0;
  }
  return nationalPct;
}

/** The diversityIndex fields for one area, given the national shares. */
export function diversityIndexFor(area, nationalPct) {
  let dissimilarity = 0;
  for (const g of GROUPS) {
    dissimilarity += Math.abs((area.current.groups[g] || 0) - nationalPct[g]);
  }
  dissimilarity = Math.round(dissimilarity / 2 * 10) / 10; // Scale to 0-100

  let entropy = 0;
  for (const g of GROUPS) {
    const p = (area.current.groups[g] || 0) / 100;
    if (p > 0) entropy -= p * Math.log(p);
  }
  entropy = Math.round(entropy / Math.log(6) * 100) / 100; // Normalise to 0-1

  let diversityLevel;
  if (entropy > 0.7) diversityLevel = "highly diverse";
  else if (entropy > 0.5) diversityLevel = "diverse";
  else if (entropy > 0.3) diversityLevel = "moderately diverse";
  else diversityLevel = "low diversity";

  return {
    dissimilarity,
    entropy,
    diversityLevel,
    source: "Computed from Census 2021 ethnic composition"
  };
}

/**
 * Set area.diversityIndex on every area with current.groups. Returns the count.
 * Writes into an existing diversityIndex object so its key order is kept.
 */
export function applyDiversityIndices(areas, { skipCodes = new Set() } = {}) {
  const nationalPct = nationalComposition(areas, skipCodes);
  let count = 0;
  for (const area of Object.values(areas)) {
    if (!area.current?.groups) continue;
    const next = diversityIndexFor(area, nationalPct);
    if (area.diversityIndex && typeof area.diversityIndex === "object") {
      Object.assign(area.diversityIndex, next);
    } else {
      area.diversityIndex = next;
    }
    count++;
  }
  return count;
}
