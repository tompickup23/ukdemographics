/**
 * Build a per-constituency (PCON) dataset for UK Demographics from inputs
 * that already exist on this machine. One-shot: re-run only when the
 * underlying GE or crosswalk files change.
 *
 * Inputs (read from sibling repo paths):
 *   UK Elections (~/ukelections/):
 *     data/features/la-ge2024-shares.json   — pcon_ballots keyed by slug
 *                                              with party shares + total votes
 *     data/ons-pcon24-lad25-postcode-crosswalk.json
 *                                            — pcon24cd ↔ lad25cd rows with
 *                                              pcon_postcode_share
 *   UK Demographics (this repo):
 *     src/data/live/pip-pcon.json            — byPconCode {code, name, ...}
 *
 * Output:
 *   src/data/live/pcon-dataset.json
 *
 * Shape per row keyed by E14/W14/S14/N06 PCON code:
 *   {
 *     code, name, slug, country,
 *     ge2024: { shares: {party:share}, totalVotes, winner, runnerUp,
 *               majorityPp },
 *     constituentLas: [{ladCode, postcodeShare}]
 *   }
 *
 * Name matching is fuzzy — we strip punctuation, lowercase, and compare.
 * Any unmatched PCONs are logged so they can be hand-mapped.
 */
import { readFileSync, writeFileSync } from "node:fs";

const UKE = "/Users/tompickup/ukelections";
const OUT = "src/data/live/pcon-dataset.json";

const pconBallots = JSON.parse(
  readFileSync(`${UKE}/data/features/la-ge2024-shares.json`, "utf8"),
).pcon_ballots;
const crosswalk = JSON.parse(
  readFileSync(`${UKE}/data/ons-pcon24-lad25-postcode-crosswalk.json`, "utf8"),
).rows;
const pipByCode = JSON.parse(
  readFileSync("src/data/live/pip-pcon.json", "utf8"),
).byPconCode;

// Build a slug → code lookup from PIP. PIP uses E14XXXXXXX codes (English),
// S14/W14/N06 for Scotland/Wales/Northern Ireland.
function slugify(name) {
  return name
    .toLowerCase()
    .replace(/&/g, "and")
    .replace(/[''.,]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");
}

const slugToCode = {};
const codeToName = {};
for (const [code, row] of Object.entries(pipByCode)) {
  const sl = slugify(row.name);
  slugToCode[sl] = code;
  codeToName[code] = row.name;
}

// LA postcode shares grouped by PCON.
const lasByPcon = {};
for (const r of crosswalk) {
  (lasByPcon[r.pcon24cd] = lasByPcon[r.pcon24cd] ?? []).push({
    ladCode: r.lad25cd,
    postcodeShare: r.pcon_postcode_share,
  });
}

// Sort constituent LAs by postcode share desc.
for (const list of Object.values(lasByPcon)) {
  list.sort((a, b) => b.postcodeShare - a.postcodeShare);
}

const out = {};
const unmatched = [];
for (const [ballotKey, ballot] of Object.entries(pconBallots)) {
  // Key format: "parl.<slug>.2024-07-04"
  const m = ballotKey.match(/^parl\.(.+)\.2024-07-04$/);
  if (!m) continue;
  const slug = m[1];
  const code = slugToCode[slug];
  if (!code) {
    unmatched.push(slug);
    continue;
  }

  const shares = ballot.shares ?? {};
  // Compute winner + runner-up + majority pp.
  const sorted = Object.entries(shares).sort(([, a], [, b]) => b - a);
  const [winnerParty, winnerShare] = sorted[0] ?? [null, 0];
  const [runnerParty, runnerShare] = sorted[1] ?? [null, 0];
  const majorityPp = winnerShare && runnerShare ? +(((winnerShare - runnerShare) * 100).toFixed(2)) : null;

  out[code] = {
    code,
    name: codeToName[code],
    slug,
    country: code.startsWith("E14")
      ? "England"
      : code.startsWith("W") ? "Wales" : code.startsWith("S") ? "Scotland" : code.startsWith("N") ? "Northern Ireland" : "UK",
    ge2024: {
      shares,
      totalVotes: ballot.total_votes ?? null,
      winner: winnerParty,
      winnerSharePct: +((winnerShare ?? 0) * 100).toFixed(2),
      runnerUp: runnerParty,
      runnerUpSharePct: +((runnerShare ?? 0) * 100).toFixed(2),
      majorityPp,
    },
    constituentLas: lasByPcon[code] ?? [],
  };
}

const result = {
  source: "Composite — GE 2024 shares from UKE backtest, PCON↔LAD24/LAD25 crosswalk from ONS, PCON names from DWP Stat-Xplore (via PIP)",
  generatedAt: new Date().toISOString(),
  constituencyCount: Object.keys(out).length,
  unmatchedSlugs: unmatched,
  pcons: out,
};

writeFileSync(OUT, JSON.stringify(result, null, 2) + "\n");
console.log(
  `Wrote ${Object.keys(out).length} constituencies (${unmatched.length} slug→code unmatched) → ${OUT}`,
);
if (unmatched.length > 0) {
  console.log("First unmatched:", unmatched.slice(0, 10).join(", "));
}
