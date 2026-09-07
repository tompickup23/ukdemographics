/**
 * Compares every areaName in ethnic-projections.json against the ONS name
 * for the same area code, so a local-government rename (Shepway →
 * Folkestone and Hythe, 1 April 2018) doesn't sit unnoticed in the data for
 * years the way this one did.
 *
 * ONS source: data/geography/lad24-simplified.geojson — the LAD24 boundary
 * file fetched from ONS Open Geography (same ArcGIS FeatureServer family as
 * scripts/fetch/fetch-la-hierarchy.mjs), keyed by LAD24CD/LAD24NM. It's used
 * here rather than src/data/lookups/district-to-utla.json because that
 * lookup only carries the 164 non-metropolitan districts (E07) that need an
 * ASC/SEND county fallback — it has no entries for the E06 unitary, E08
 * metropolitan, E09 London borough or W06 Welsh unitary authorities that
 * make up the rest of ethnic-projections.json. The geojson's LAD24CD set
 * covers all five of those prefixes and matches the projections file's area
 * count exactly (318 for England + Wales as published here).
 *
 * ONS's own registry is not internally consistent on punctuation: some
 * authorities carry a qualifier ("Bristol, City of", "Kingston upon Hull,
 * City of", "Herefordshire, County of") and one carries a stop this site's
 * house style drops elsewhere ("St. Helens", while "St Albans" has none).
 * Those are not renames, so they're kept out of the real-mismatch list and
 * reported separately. A difference survives that filter only when the two
 * names disagree on more than punctuation and whitespace — e.g. an actual
 * word substitution such as Shepway → Folkestone and Hythe.
 */
import { readFileSync } from "node:fs";
import path from "node:path";

const PROJECTIONS_PATH = path.resolve("src/data/live/ethnic-projections.json");
const GEOJSON_PATH = path.resolve("data/geography/lad24-simplified.geojson");

/**
 * Authorities where the site's areaName and the ONS LAD24NM differ only in
 * punctuation, not in substance. Each entry is a known, deliberate case —
 * not something to launder a real rename through — and is checked against
 * both names on every run, so it fails loudly if either side changes.
 */
export const PUNCTUATION_ALLOWLIST = [
  {
    code: "E08000013",
    siteName: "St Helens",
    onsName: "St. Helens",
    // ONS's own LAD24 registry is inconsistent here: "St. Helens" carries a
    // stop but "St Albans" (E07000240) does not. This site drops the stop
    // for both, matching its own "St Albans" and every other "St " name in
    // ethnic-projections.json (Stevenage, Stoke-on-Trent, Stockport, ...).
    reason: "ONS carries a stop after 'St' for this authority only; house style drops it everywhere"
  }
];

/** Strip punctuation and collapse whitespace so "St. Helens" and "St Helens" compare equal. */
function normalise(name) {
  return name
    .toLowerCase()
    .replace(/[.,]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function loadOnsNames() {
  const geojson = JSON.parse(readFileSync(GEOJSON_PATH, "utf8"));
  const names = new Map();
  for (const feature of geojson.features) {
    const { LAD24CD, LAD24NM } = feature.properties ?? {};
    if (LAD24CD && LAD24NM) names.set(LAD24CD, LAD24NM);
  }
  return names;
}

/**
 * Returns every area code in ethnic-projections.json whose areaName disagrees
 * with the ONS LAD24 name, split into:
 *  - realMismatches: substantive differences (renames, typos) — these should
 *    fail a build.
 *  - punctuationMismatches: differences that disappear once punctuation and
 *    whitespace are normalised (ONS's own comma/stop inconsistencies).
 *  - missingFromOns: area codes with no LAD24 entry (outside England/Wales,
 *    or a boundary-change alias not carried in the LAD24 file).
 */
export function findAreaNameMismatches() {
  const projections = JSON.parse(readFileSync(PROJECTIONS_PATH, "utf8"));
  const onsNames = loadOnsNames();

  const realMismatches = [];
  const punctuationMismatches = [];
  const missingFromOns = [];

  for (const [code, area] of Object.entries(projections.areas ?? {})) {
    const siteName = area.areaName;
    const onsName = onsNames.get(code);

    if (!onsName) {
      missingFromOns.push({ code, siteName });
      continue;
    }

    if (siteName === onsName) continue;

    if (normalise(siteName) === normalise(onsName)) {
      punctuationMismatches.push({ code, siteName, onsName });
    } else {
      realMismatches.push({ code, siteName, onsName });
    }
  }

  return { realMismatches, punctuationMismatches, missingFromOns };
}
