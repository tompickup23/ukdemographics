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

function arg(name, fallback) {
  const i = process.argv.indexOf(name);
  return i >= 0 ? process.argv[i + 1] : fallback;
}

// --file: the projection file to update (default: this site's).
// --skip: codes left out of the national composition because they duplicate
// another record for the same authority. Asylum Stats files Barnsley and
// Sheffield under two codes each; pass the retired pair there so each
// authority is counted once. Skipped records still get their own shiftShare.
const SITE_OUTPUT = path.resolve(arg("--file", "src/data/live/ethnic-projections.json"));
const SKIP = new Set((arg("--skip", "") || "").split(",").filter(Boolean));
const original = readFileSync(SITE_OUTPUT, "utf8");
const existing = JSON.parse(original);

// Compute national-level change, on constant geography: the areas with a 2011
// baseline, each counted in both years. Since October 2026 that is all 318:
// the eleven councils formed since 2011 carry the sum of their 2011 districts
// (scripts/build/rebase-census-groups.mjs), so the base is England and Wales,
// 56,075,912 residents in 2011, and the national change matches ONS's 80.5% to
// 74.4%. Until then they were left out and the base was 307 areas (-6.2pp). Until October 2026 every 2011 total
// was 0 (the ethnicity transform missed the 2011 label "All usual residents"),
// and the script fell back to a typed 80% for 2011 and 74% for 2021, so the
// published national effect was not computed from the Census at all. There is
// no fallback now: a missing total stops the script.
let natWBI_2011 = 0, natWBI_2021 = 0, natTotal_2011 = 0, natTotal_2021 = 0, natAreas = 0;
const missing = [];
for (const [code, area] of Object.entries(existing.areas)) {
  if (!area.baseline || !area.current || area.baseline.year === area.current.year) continue;
  if (SKIP.has(code)) continue;
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

// The same rule as src/lib/shift-share-driver.ts, which the place page prints
// from; tests/shift-share.test.ts checks the stored label against it. The driver
// is the largest component with the sign of the total change, so a component
// working against the change is never named as its driver. Until October 2026
// the largest component in size was named whatever its sign, and 20 areas where
// the local effect raised the White British share were labelled "local migration".
function dominantDriver(s) {
  const sign = Math.sign(s.totalChangePp);
  const none = "none, the components cancel out";
  if (sign === 0) return none;
  const parts = [
    { name: "national trend", value: s.nationalEffectPp },
    { name: "age structure", value: s.structuralEffectPp },
    { name: "local migration", value: s.localEffectPp },
  ];
  const bySize = (a, b) => Math.abs(b.value) - Math.abs(a.value);
  const same = parts.filter((p) => Math.sign(p.value) === sign).sort(bySize);
  if (same.length === 0) return none;
  const size = Math.abs(same[0].value);
  const leaders = same.filter((p) => Math.abs(p.value) === size).map((p) => p.name);
  let label = leaders.length > 1 ? `${leaders.join(" and ")}, equally` : leaders[0];
  const opposing = parts.filter((p) => Math.sign(p.value) === -sign).sort(bySize);
  if (opposing.length > 0 && Math.abs(opposing[0].value) >= size) label += `, offset by ${opposing[0].name}`;
  return label;
}

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

  const rounded = {
    totalChangePp: Math.round(totalChange * 10) / 10,
    nationalEffectPp: Math.round(nationalEffect * 10) / 10,
    structuralEffectPp: Math.round(structuralEffect * 10) / 10,
    localEffectPp: Math.round(localEffect * 10) / 10,
  };
  area.shiftShare = { ...rounded, dominantDriver: dominantDriver(rounded) };
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
