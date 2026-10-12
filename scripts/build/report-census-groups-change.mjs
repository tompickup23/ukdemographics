/**
 * Change report for the October 2026 Census group rebase: what moves on the
 * published pages when ethnic-projections.json goes from --old to --new.
 *
 *   git show origin/main:src/data/live/ethnic-projections.json > /tmp/old.json
 *   node scripts/build/report-census-groups-change.mjs --old /tmp/old.json \
 *     [--old-label "main at abc1234"] [--new src/data/live/ethnic-projections.json] \
 *     [--exclude E08000016,E08000019] \
 *     [--out docs/corrections/census-groups-2026-10.md]
 *
 * Page logic is mirrored, not imported, where the page module reads JSON
 * through Vite: the direct answer's top three (src/lib/search-listing.ts
 * topGroups), the chart's >3% line rule (src/pages/places/[slug].astro) and
 * the homepage 2011 figure (src/pages/index.astro natAgg). The plausibility
 * horizon is imported from src/lib/projection-plausibility.ts.
 */
import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { plausibleThrough } from "../../src/lib/projection-plausibility.ts";
import { applyDiversityIndices } from "../model/lib/diversity-index.mjs";

function arg(name, fallback) {
  const i = process.argv.indexOf(name);
  return i >= 0 ? process.argv[i + 1] : fallback;
}

const OLD = path.resolve(arg("--old"));
const NEW = path.resolve(arg("--new", "src/data/live/ethnic-projections.json"));
const OUT = arg("--out", null);
const OLD_LABEL = arg("--old-label", null);
const EXCLUDE = new Set((arg("--exclude", "") || "").split(",").filter(Boolean));

const oldData = JSON.parse(readFileSync(OLD, "utf8"));
const newData = JSON.parse(readFileSync(NEW, "utf8"));
const codes = Object.keys(newData.areas).filter((c) => !EXCLUDE.has(c));
const G = ["white_british", "white_other", "asian", "black", "mixed", "other"];
const LABEL = { white_british: "White British", white_other: "White Other", asian: "Asian", black: "Black", mixed: "Mixed", other: "Other" };

const f1 = (n) => (n == null ? "" : n.toFixed(1));
const f2 = (n) => (n == null ? "" : n.toFixed(2));
const sgn = (n) => (n > 0 ? "+" : "") + n.toFixed(2);

// --- page logic mirrors ------------------------------------------------------

function topGroups(groups, n) {
  return Object.entries(groups ?? {})
    .filter((e) => typeof e[1] === "number" && e[0] in LABEL)
    .sort((a, b) => b[1] - a[1])
    .slice(0, n);
}
const topText = (groups) => topGroups(groups, 3).map(([g, v]) => `${LABEL[g]} (${v.toFixed(1)}%)`).join(", ");
const topIds = (groups) => topGroups(groups, 3).map(([g]) => LABEL[g]).join(", ");

function drawsLine(area, group) {
  const horizon = plausibleThrough(area);
  const points = [area.baseline.groups, area.current.groups];
  for (const [y, row] of Object.entries(area.projections ?? {})) {
    if (horizon !== null && Number(y) <= horizon) points.push(row);
  }
  return Math.max(...points.map((p) => p?.[group] ?? 0)) > 3;
}

function homepage2011(data) {
  let pop = 0, wb2011 = 0, wb2021 = 0;
  for (const c of codes) {
    const a = data.areas[c];
    const p = a?.current?.total_population ?? 0;
    if (!p) continue;
    pop += p;
    wb2011 += (a.baseline.groups.white_british ?? 0) * p;
    wb2021 += (a.current.groups.white_british ?? 0) * p;
  }
  return { wb2011: wb2011 / pop, wb2021: wb2021 / pop };
}

function national(data, field, year) {
  const s = { total: 0 };
  for (const g of G) s[g] = 0;
  for (const c of codes) {
    const p = data.areas[c][field];
    if (p.year !== year || !p.groups_absolute) continue;
    s.total += p.total_population;
    for (const g of G) s[g] += p.groups_absolute[g];
  }
  return s;
}

function shiftShareNational(data) {
  let wb11 = 0, wb21 = 0, t11 = 0, t21 = 0;
  for (const c of codes) {
    const a = data.areas[c];
    if (a.baseline.year === a.current.year) continue;
    wb11 += a.baseline.groups_absolute?.white_british || 0;
    wb21 += a.current.groups_absolute?.white_british || 0;
    t11 += a.baseline.total_population || 0;
    t21 += a.current.total_population || 0;
  }
  const p11 = t11 > 0 ? (wb11 / t11) * 100 : 80;
  const p21 = t21 > 0 ? (wb21 / t21) * 100 : 74;
  return { p11, p21, change: p21 - p11, fallback: !(t11 > 0) };
}

// --- comparisons ---------------------------------------------------------------

const rows = [];
const changed = { b2011: 0, b2021: 0, c2021: 0, abs2021: 0, abs2011: 0, total2011: 0 };
const topChanges = [];
const topTextChanges = [];
const flips = [];
const horizonChanges = [];

for (const c of codes) {
  const o = oldData.areas[c], n = newData.areas[c];
  if (n.baseline.year === 2011 && JSON.stringify(o.baseline.groups) !== JSON.stringify(n.baseline.groups)) changed.b2011++;
  if (n.baseline.year === 2021 && JSON.stringify(o.baseline.groups) !== JSON.stringify(n.baseline.groups)) changed.b2021++;
  if (JSON.stringify(o.current.groups) !== JSON.stringify(n.current.groups)) changed.c2021++;
  if (JSON.stringify(o.current.groups_absolute) !== JSON.stringify(n.current.groups_absolute)) changed.abs2021++;
  if (n.baseline.year === 2011 && JSON.stringify(o.baseline.groups_absolute) !== JSON.stringify(n.baseline.groups_absolute)) changed.abs2011++;
  if (n.baseline.year === 2011 && o.baseline.total_population !== n.baseline.total_population) changed.total2011++;

  if (topIds(o.current.groups) !== topIds(n.current.groups)) {
    topChanges.push({ c, name: n.areaName, before: topText(o.current.groups), after: topText(n.current.groups) });
  } else if (topText(o.current.groups) !== topText(n.current.groups)) {
    topTextChanges.push({ c, name: n.areaName, before: topText(o.current.groups), after: topText(n.current.groups) });
  }

  if (n.baseline.year === 2011) {
    const od = o.current.groups.black - o.baseline.groups.black;
    const nd = n.current.groups.black - n.baseline.groups.black;
    if (Math.sign(od) !== Math.sign(nd)) {
      flips.push({ c, name: n.areaName, od, nd, line: drawsLine(n, "black") || drawsLine(o, "black") });
    }
  }

  if (plausibleThrough(o) !== plausibleThrough(n)) horizonChanges.push(`${c} ${n.areaName}: ${plausibleThrough(o)} to ${plausibleThrough(n)}`);

  rows.push({
    c,
    name: n.areaName,
    by: n.baseline.year,
    modelled: !!n.projections_detail,
    ob11: o.baseline.groups.black, nb11: n.baseline.groups.black,
    om11: o.baseline.groups.mixed, nm11: n.baseline.groups.mixed,
    ob21: o.current.groups.black, nb21: n.current.groups.black,
    om21: o.current.groups.mixed, nm21: n.current.groups.mixed,
    oab21: o.current.groups_absolute.black / o.current.total_population * 100,
    nab21: n.current.groups_absolute.black / n.current.total_population * 100
  });
}

const blackLinePages = codes.filter((c) => newData.areas[c].baseline.year === 2011 && (drawsLine(newData.areas[c], "black") || drawsLine(oldData.areas[c], "black"))).length;

// Diversity: the published values were computed when the file held 320 records
// (Barnsley and Sheffield twice). Split the move into that base change and the fix.
const oldRecomputed = JSON.parse(JSON.stringify(oldData));
applyDiversityIndices(oldRecomputed.areas);
const div = { dis: 0, disFromBase: 0, disFromFix: 0, ent: 0, level: [], maxDis: 0, maxDisArea: "", maxFix: 0, maxFixArea: "", maxEnt: 0 };
for (const c of codes) {
  const o = oldData.areas[c].diversityIndex, r = oldRecomputed.areas[c].diversityIndex, n = newData.areas[c].diversityIndex;
  if (!o || !n) continue;
  if (o.dissimilarity !== n.dissimilarity) div.dis++;
  if (o.dissimilarity !== r.dissimilarity) div.disFromBase++;
  if (r.dissimilarity !== n.dissimilarity) div.disFromFix++;
  if (o.entropy !== n.entropy) div.ent++;
  if (o.diversityLevel !== n.diversityLevel) div.level.push(`${c} ${newData.areas[c].areaName}: "${o.diversityLevel}" to "${n.diversityLevel}" (entropy ${o.entropy} to ${n.entropy})`);
  const d = Math.abs(n.dissimilarity - o.dissimilarity);
  if (d > div.maxDis) { div.maxDis = d; div.maxDisArea = `${newData.areas[c].areaName} (${o.dissimilarity} to ${n.dissimilarity})`; }
  const fx = Math.abs(n.dissimilarity - r.dissimilarity);
  if (fx > div.maxFix) { div.maxFix = fx; div.maxFixArea = newData.areas[c].areaName; }
  div.maxEnt = Math.max(div.maxEnt, Math.abs(n.entropy - o.entropy));
}

const nat = {
  o21: national(oldData, "current", 2021), n21: national(newData, "current", 2021),
  o11: national(oldData, "baseline", 2011), n11: national(newData, "baseline", 2011)
};
// Before the fix every 2011 total was 0, so the 2011 "before" share is taken
// over the sum of the stored counts instead.
const share = (s, g) => {
  const denom = s.total > 0 ? s.total : G.reduce((t, k) => t + s[k], 0);
  return denom > 0 ? (s[g] / denom) * 100 : null;
};
const hpOld = homepage2011(oldData), hpNew = homepage2011(newData);
const ssOld = shiftShareNational(oldData), ssNew = shiftShareNational(newData);

// --- markdown -------------------------------------------------------------------

const L = [];
L.push(`# Census 2011 and 2021 groups: change report`);
L.push("");
L.push(`Generated by \`scripts/build/report-census-groups-change.mjs\` on ${new Date().toISOString().slice(0, 10)}, comparing ${OLD_LABEL ?? `\`${path.basename(OLD)}\``} (the file before the fix) with the rebased \`src/data/live/ethnic-projections.json\`. Every count below is a count of local authority records in that file (${codes.length} areas) unless it says otherwise. Shares are percentages of all usual residents, as the file stores them (two decimal places); the direct answer and charts round them to one.`);
L.push("");
L.push("Status: draft. Not to be merged before the 1 November 2026 Search Console export (listing test, PR 68). Figures change on published pages, so merging needs Tom's yes and a dated correction note.");
L.push("");
L.push("## What was wrong");
L.push("");
L.push("`scripts/transform/transform-ethnicity.mjs` tested for \"african\" and \"caribbean\" before it tested for Mixed, so the Census categories \"Mixed or Multiple ethnic groups: White and Black African\" and \"White and Black Caribbean\" (2011: \"Mixed/multiple ethnic groups: ...\") were counted as Black. Its total test also missed the 2011 label \"All usual residents\", so every 2011 baseline total was 0. Barnsley and Sheffield carried 2011 baselines with no Other group, from an earlier source.");
L.push("");
L.push("The fix classifies by the high-level group before the colon (`scripts/lib/census-ethnic-groups.mjs`) and rebases only the Census fields from the TS021 and KS201EW extracts (`scripts/build/rebase-census-groups.mjs`; input hashes in `data/raw/manifests/census_ethnic_groups.json`). Modelled areas keep their 2021 shares, which the model wrote from its own base and which were already right.");
L.push("");
L.push("## Fields changed");
L.push("");
L.push("| Field | Areas changed |");
L.push("|---|---:|");
L.push(`| \`baseline.groups\` where the baseline is 2011 | ${changed.b2011} |`);
L.push(`| \`baseline.groups_absolute\` where the baseline is 2011 | ${changed.abs2011} |`);
L.push(`| \`baseline.total_population\` where the baseline is 2011 (was 0) | ${changed.total2011} |`);
L.push(`| \`baseline.groups\` where the baseline is 2021 (the unitaries formed after 2011; year unchanged) | ${changed.b2021} |`);
L.push(`| \`current.groups\` (only areas with no model output) | ${changed.c2021} |`);
L.push(`| \`current.groups_absolute\` | ${changed.abs2021} |`);
L.push(`| \`diversityIndex.dissimilarity\` | ${div.dis} |`);
L.push(`| \`diversityIndex.entropy\` | ${div.ent} |`);
L.push(`| \`diversityIndex.diversityLevel\` | ${div.level.length} |`);
L.push("");
L.push("Projections, stochastic output, `lastUpdated`, `areaName`, the area set and the key structure are unchanged. Outside Black and Mixed, only Barnsley and Sheffield move (their 2011 Other group, and their 2021 counts, which disagreed with TS021 in every group).");
L.push("");
L.push("## National shares (sum of the file's areas)");
L.push("");
L.push("| | Before | After |");
L.push("|---|---:|---:|");
for (const [label, o, n] of [["2021", nat.o21, nat.n21], ["2011", nat.o11, nat.n11]]) {
  for (const g of ["black", "mixed", "white_british"]) {
    L.push(`| ${label} ${LABEL[g]} | ${f2(share(o, g))}% | ${f2(share(n, g))}% |`);
  }
}
L.push("");
L.push(`2021 is summed over ${nat.n21.total.toLocaleString("en-GB")} residents in ${codes.length} areas. 2011 is summed over the areas with a 2011 baseline; before the fix the 2011 totals were 0, so the 2011 "before" figure is the sum of the stored counts.`);
L.push("");
L.push("## Pages whose direct-answer top three change");
L.push("");
L.push(`The three largest groups in the opening paragraph (\`buildPlaceDirectAnswer\`, from \`current.groups\`). Only the ${changed.c2021} areas with no model output can change. ${topChanges.length} change which groups are named; ${topTextChanges.length} more keep the same groups with a different share.`);
L.push("");
L.push("| Area | Before | After |");
L.push("|---|---|---|");
for (const t of topChanges) L.push(`| ${t.name} (${t.c}) | ${t.before} | ${t.after} |`);
L.push("");
if (topTextChanges.length) {
  L.push("Same groups, different share shown:");
  L.push("");
  L.push("| Area | Before | After |");
  L.push("|---|---|---|");
  for (const t of topTextChanges) L.push(`| ${t.name} (${t.c}) | ${t.before} | ${t.after} |`);
  L.push("");
}
L.push("## Pages whose 2011 to 2021 Black direction flips");
L.push("");
const flipLine = flips.filter((f) => f.line);
const toRise = flips.filter((f) => f.od < 0 && f.nd > 0);
const toFall = flips.filter((f) => f.od > 0 && f.nd < 0);
L.push(`${flips.length} of the ${codes.filter((c) => newData.areas[c].baseline.year === 2011).length} areas with a 2011 baseline change direction: ${toRise.length} were shown falling and now rise (${toRise.filter((f) => f.line).length} of them draw a Black line), ${toFall.length} ${toFall.length === 1 ? "was" : "were"} shown rising and now ${toFall.length === 1 ? "falls" : "fall"} (${toFall.filter((f) => f.line).length} with a line)${flips.length - toRise.length - toFall.length ? `, and ${flips.length - toRise.length - toFall.length} move to or from no change` : ""}. A group's line is drawn on the place chart when it exceeds 3% in any shown year; ${blackLinePages} pages with a 2011 point draw a Black line before or after the fix.`);
L.push("");
L.push("| Area | Black 2011 to 2021 before (pp) | After (pp) | Black line drawn |");
L.push("|---|---:|---:|---|");
for (const f of flips.sort((a, b) => a.name.localeCompare(b.name))) L.push(`| ${f.name} (${f.c}) | ${sgn(f.od)} | ${sgn(f.nd)} | ${f.line ? "yes" : "no"} |`);
L.push("");
L.push("## Projection horizon");
L.push("");
L.push(horizonChanges.length ? `The plausibility horizon moves for: ${horizonChanges.join("; ")}.` : "The plausibility horizon (`plausibleThrough`, which reads `current.groups` as its base) changes for no area.");
L.push("");
L.push("## Diversity index");
L.push("");
L.push(`Recomputed alone with \`scripts/model/recompute_diversity_index.mjs\`, the same calculation as \`integrate_supplementary.mjs\`, now shared through \`scripts/model/lib/diversity-index.mjs\`.`);
L.push("");
L.push(`- Dissimilarity changes on ${div.dis} areas, by at most ${div.maxDis.toFixed(1)} points (${div.maxDisArea}).`);
L.push(`- Two causes. The published values were computed while the file held 320 records, with Barnsley and Sheffield twice; recomputing the old data over today's 318 alone moves ${div.disFromBase} areas. The Census fix then moves ${div.disFromFix} areas against that recomputation, by at most ${div.maxFix.toFixed(1)} points (${div.maxFixArea}).`);
L.push(`- Entropy changes on ${div.ent} areas (the areas with no model output), by at most ${div.maxEnt.toFixed(2)}.`);
L.push(`- Level label changes: ${div.level.length ? div.level.join("; ") : "none"}.`);
L.push("");
L.push("## Findings and figures this makes stale (not edited here)");
L.push("");
L.push("No finding or prose is edited in this change. These need a later dated correction, after the fact-check skill:");
L.push("");
L.push(`1. **Shift-share national effect, -6.4pp** (\`shiftShare.nationalEffectPp\` on every area with a 2011 baseline, and the finding \`src/content/findings/shift-share-what-drives-change.md\`). \`compute_shift_share.mjs\` fell back to a typed 80% for 2011 because every 2011 total was 0. With the totals now present the same calculation gives ${ssNew.p11.toFixed(2)}% to ${ssNew.p21.toFixed(2)}%, ${ssNew.change.toFixed(1)}pp. \`shiftShare\` is not regenerated in this change, so the published -6.4pp stays until that correction.`);
L.push(`2. **Homepage 2011 White British, 80.0%** (\`src/pages/index.astro\` natAgg, 2011 shares weighted by 2021 population, including the 11 areas whose baseline is 2021). It reads ${hpOld.wb2011.toFixed(2)}% before and ${hpNew.wb2011.toFixed(2)}% after this change; the move is Barnsley and Sheffield. KS201EW gives 80.49% for England and Wales; the weighting is a separate correction.`);
L.push("3. **Barnsley and Sheffield `shiftShare`** (`totalChangePp`, `structuralEffectPp`, `localEffectPp`) was computed from the old 2011 White British (Sheffield 84.03%, now 80.85% from KS201EW: 446,837 of 552,698). It is not regenerated here.");
L.push("4. **`annualChangePp` for Black and Mixed** holds the old transform's values. Only its White British value is read by a page.");
L.push("5. **Asylum Stats `/national/`** draws its 2021 point from `groups_absolute`; it moves when the Asylum Stats file is rebased (separate PR).");
L.push("");
L.push("No finding in `src/content/findings/` quotes an area's Black or Mixed share.");
L.push("");
L.push("## Per area: Black and Mixed shares before and after");
L.push("");
L.push("2011 is `baseline.groups` (2021 for the eleven unitaries formed after 2011, marked *). 2021 is `current.groups`, which changes only for areas with no model output; the last two columns give the 2021 Black share implied by `current.groups_absolute`, which was wrong for every area.");
L.push("");
L.push("| Code | Area | Model | 2011 Black | 2011 Mixed | 2021 Black | 2021 Mixed | 2021 Black from counts |");
L.push("|---|---|---|---|---|---|---|---|");
for (const r of rows.sort((a, b) => a.name.localeCompare(b.name))) {
  const arrow = (a, b) => (a === b ? f2(a) : `${f2(a)} to ${f2(b)}`);
  L.push(`| ${r.c} | ${r.name}${r.by === 2021 ? " *" : ""} | ${r.modelled ? "yes" : "no"} | ${arrow(r.ob11, r.nb11)} | ${arrow(r.om11, r.nm11)} | ${arrow(r.ob21, r.nb21)} | ${arrow(r.om21, r.nm21)} | ${f2(r.oab21)} to ${f2(r.nab21)} |`);
}
L.push("");

const md = L.join("\n");
if (OUT) {
  writeFileSync(OUT, md, "utf8");
  console.log(`Written ${OUT}`);
}
console.log(JSON.stringify({ changed, topChanges: topChanges.length, topTextChanges: topTextChanges.length, flips: flips.length, flipsWithLine: flipLine.length, toRise: [toRise.length, toRise.filter((f) => f.line).length], toFall: [toFall.length, toFall.filter((f) => f.line).length], blackLinePages, horizonChanges, div: { dis: div.dis, fromBase: div.disFromBase, fromFix: div.disFromFix, maxDis: div.maxDis, maxFix: div.maxFix, ent: div.ent, level: div.level }, homepage2011: [hpOld.wb2011, hpNew.wb2011], shiftShare: [ssOld, ssNew], nat: { o21b: share(nat.o21, "black"), n21b: share(nat.n21, "black"), o11b: share(nat.o11, "black"), n11b: share(nat.n11, "black") } }, null, 1));
