/**
 * C1: Shift-Share Decomposition
 *
 * Decomposes each area's ethnic composition change (2011→2021) into:
 * 1. National effect: change attributable to national-level ethnic trends
 * 2. Age structure effect: change due to having a younger/older ethnic age profile
 * 3. Local effect: residual (migration attraction, local factors)
 *
 * Following Franklin (2014, Population Space and Place)
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import { writeJsonLike } from "../lib/json-like.mjs";

const SITE_OUTPUT = path.resolve("src/data/live/ethnic-projections.json");
const original = readFileSync(SITE_OUTPUT, "utf8");
const existing = JSON.parse(original);

// Compute national-level change, on constant geography: the areas with a 2011
// baseline, each counted in both years. Until October 2026 every 2011 total
// was 0 (the ethnicity transform missed the 2011 label "All usual residents"),
// and the script fell back to a typed 80% for 2011 and 74% for 2021, so the
// published national effect was not computed from the Census at all. There is
// no fallback now: a missing total stops the script.
let natWBI_2011 = 0, natWBI_2021 = 0, natTotal_2011 = 0, natTotal_2021 = 0, natAreas = 0;
const missing = [];
for (const [code, area] of Object.entries(existing.areas)) {
  if (!area.baseline || !area.current || area.baseline.year === area.current.year) continue;
  const b = area.baseline, c = area.current;
  if (!(b.total_population > 0) || !(c.total_population > 0) ||
      b.groups_absolute?.white_british == null || c.groups_absolute?.white_british == null) {
    missing.push(`${code} ${area.areaName}`);
    continue;
  }
  natWBI_2011 += b.groups_absolute.white_british;
  natWBI_2021 += c.groups_absolute.white_british;
  natTotal_2011 += b.total_population;
  natTotal_2021 += c.total_population;
  natAreas++;
}
if (missing.length || natTotal_2011 === 0 || natTotal_2021 === 0) {
  throw new Error(`Census totals or White British counts missing for ${missing.length} areas (${missing.slice(0, 5).join("; ")}). Run scripts/build/rebase-census-groups.mjs first.`);
}

const natWBI_pct_2011 = natWBI_2011 / natTotal_2011 * 100;
const natWBI_pct_2021 = natWBI_2021 / natTotal_2021 * 100;
const natWBI_change = natWBI_pct_2021 - natWBI_pct_2011; // negative = national WBI decline

console.log(`National base: ${natAreas} areas with a 2011 baseline; ${natTotal_2011} residents in 2011, ${natTotal_2021} in 2021`);
console.log(`National WBI: ${natWBI_pct_2011.toFixed(1)}% → ${natWBI_pct_2021.toFixed(1)}% (${natWBI_change.toFixed(1)}pp)`);

let count = 0;
for (const [code, area] of Object.entries(existing.areas)) {
  if (!area.baseline || !area.current || area.baseline.year === area.current.year) continue;
  if (!area.baseline.groups || !area.current.groups) continue;

  const localWBI_2011 = area.baseline.groups.white_british || 0;
  const localWBI_2021 = area.current.groups.white_british || 0;
  const totalChange = localWBI_2021 - localWBI_2011;

  // National effect: how much change is explained by national-level WBI decline
  const nationalEffect = natWBI_change;

  // Structural effect: difference from national due to local age/ethnic composition
  // Areas with younger minority populations see faster change than national average
  const structuralEffect = (localWBI_2011 - natWBI_pct_2011) * (natWBI_change / natWBI_pct_2011);

  // Local effect: residual (migration, local factors)
  const localEffect = totalChange - nationalEffect - structuralEffect;

  area.shiftShare = {
    totalChangePp: Math.round(totalChange * 10) / 10,
    nationalEffectPp: Math.round(nationalEffect * 10) / 10,
    structuralEffectPp: Math.round(structuralEffect * 10) / 10,
    localEffectPp: Math.round(localEffect * 10) / 10,
    dominantDriver: Math.abs(nationalEffect) >= Math.abs(localEffect) && Math.abs(nationalEffect) >= Math.abs(structuralEffect)
      ? "national trend"
      : Math.abs(localEffect) >= Math.abs(structuralEffect)
        ? "local migration"
        : "age structure"
  };
  count++;
}

console.log(`Computed shift-share for ${count} areas`);

// Spot checks
for (const code of ["E07000117", "E06000008", "E08000025"]) {
  const a = existing.areas[code];
  if (!a?.shiftShare) continue;
  console.log(`\n${a.areaName}:`);
  console.log(`  Total change: ${a.shiftShare.totalChangePp}pp`);
  console.log(`  National effect: ${a.shiftShare.nationalEffectPp}pp`);
  console.log(`  Structural: ${a.shiftShare.structuralEffectPp}pp`);
  console.log(`  Local: ${a.shiftShare.localEffectPp}pp`);
  console.log(`  Dominant driver: ${a.shiftShare.dominantDriver}`);
}

writeJsonLike(SITE_OUTPUT, existing, original);
console.log("\nUpdated ethnic-projections.json");
