/**
 * The methodology string written into ethnic-projections.json.
 *
 * run_hp_single_year.mjs used to write the v8.0 text whatever options it ran
 * with, and printed a warning on a non-default run (V81_READINESS.md, blocker 5).
 * The text now follows the options and inputs actually used: the 2021 base
 * (observed, summed and IPF-estimated authorities, read from the base file), the
 * 2011 base (countries, successor sums), the control totals (their own metadata
 * names each year's source, the post-2047 straight-line extension and the files),
 * the cap mode and its counts, the ratio settings and the two adjustments.
 *
 * A run in the v8.0 configuration still writes the v8.0 text byte for byte, and
 * run_stochastic_hp.mjs still appends the v8.0 sentence after it
 * (tests/hp-methodology.test.mjs checks both against the published file).
 *
 * Every figure in a composed string is a count from the run itself, a setting,
 * or a published v8.0 figure already in the v8.0 text. Nothing is estimated here.
 */
import path from "node:path";
import { isV80Configuration } from "./hp-options.mjs";
import { isV80RatioSettings } from "./hp-core.mjs";

export const V80_METHODOLOGY =
  "Hamilton-Perry v8.0 single-year-of-age model with 20 ethnic groups. Census 2021 base from ONS custom dataset (direct observations, no IPF). Census 2011 base from DC2101EW (18 groups, 21 age bands, interpolated to single-year; Roma split from Gypsy/Traveller using 2021 proportions). 91 age groups x 20 ethnic groups x 2 sexes. SNPP 2022-based envelope constraint (linear extrapolation beyond 2047). Cohort change ratios shrunk toward the national ratio by cell size (K=25) with a growth ceiling of 1.65 per decade, both selected on an out-of-sample test that fits 2001 to 2011 and forecasts 2021 at 16 ethnic groups: MAE 1.56pp on the White British share across 285 areas, bias +0.05pp. The previous settings (freeze at a 2011 base of five or fewer, ceiling 5.0) scored MAE 2.82pp with a bias of -2.13pp on the same test. Brexit WHO adjustment (-15% growth ages 10-34). DfE School Census 2024/25 calibration (20% damped adjustment for ages 0-5). Monte Carlo stochastic: 1000 simulations, sharing this model's ratio settings and population envelope. The stochastic run does not apply the School Census calibration, so a minority of areas disagree at the margin and their bands are withheld rather than drawn.";

export const V80_STOCHASTIC_SENTENCE =
  " Monte Carlo stochastic projection (1000 simulations, CCR σ=0.02 calibrated from the v8.0 out-of-sample validation: White British MAE 1.56pp with a bias of +0.05pp over 285 areas). Reports median + 80%/95% prediction intervals.";

/** True when the run is the v8.0 run: every option and every ratio setting at its v8.0 value. */
export function isV80Run(opts, settings) {
  return isV80Configuration(opts) && isV80RatioSettings(settings);
}

const list = (items) =>
  items.length <= 1 ? items.join("") : `${items.slice(0, -1).join(", ")} and ${items[items.length - 1]}`;

const named = (codes, names) => codes.map((c) => (names?.[c] ? `${names[c]} (${c})` : c));

function sourceLine(src) {
  const publisher = /^wg_/.test(src.id ?? "") ? "Welsh Government" : "ONS";
  const variant = [src.variant, src.projection]
    .filter(Boolean)
    .map((v) => v.replace(/^Projection:\s*/, ""))
    .filter((v) => !String(src.used ?? "").toLowerCase().startsWith(v.toLowerCase()))
    .join(", ");
  const date = String(src.published ?? "").match(/\d{1,2} [A-Z][a-z]+ \d{4}/)?.[0];
  return [
    `${publisher}, ${src.title}${variant ? ` (${variant})` : ""}`,
    src.used,
    date ? `published ${date}` : null,
    src.file ? path.basename(src.file) : null,
  ]
    .filter(Boolean)
    .join(", ");
}

// The control-totals file states its extension rule once per source, in the same
// words up to "This is UKD's assumption; ". Say the rule once and name each source.
function mergeAssumptions(assumptions) {
  const marker = "This is UKD's assumption; ";
  const groups = new Map();
  const loose = [];
  for (const a of assumptions) {
    const i = a.indexOf(marker);
    if (i < 0) { loose.push(a); continue; }
    const head = a.slice(0, i + marker.length);
    const tail = a.slice(i + marker.length).replace(/\.$/, "");
    if (!groups.has(head)) groups.set(head, []);
    groups.get(head).push(tail);
  }
  return [...[...groups].map(([head, tails]) => `${head}${list(tails)}.`), ...loose];
}

function controlTotalsText(control, opts, capStats) {
  if (!control) return ["No population control total is applied (cap off)."];
  const out = [];
  if (control.kind === "snpp-csv") {
    const last = control.label.match(/beyond (\d{4})/)?.[1] ?? "its last year";
    out.push(
      `Control totals: ONS 2022-based subnational population projections for England, area totals (${path.basename(control.file)}), extended beyond ${last} in a straight line from each authority's 2043 to 2047 change.`,
    );
  } else {
    const meta = control.meta ?? {};
    out.push(`Control totals: ${control.label}${meta.construction ? `. ${meta.construction}` : "."}`);
    if (meta.yearSources?.length) {
      out.push(`By year: ${meta.yearSources.map((y) => `${y.years} (${y.areas}), ${y.source}`).join("; ")}.`);
    }
    out.push(...mergeAssumptions(meta.assumptions ?? []));
    if (meta.sources?.length) out.push(`Sources: ${meta.sources.map(sourceLine).join("; ")}.`);
  }
  if (opts.capMode === "age-sex") {
    out.push(
      `Cap mode age-sex: one factor per authority, sex, single year of age and year (the within-cell ratio of Hauer, 2019), so ethnic shares within each age and sex cell are kept and the age structure follows the control totals` +
        (capStats.emptyCells
          ? `; ${capStats.emptyCells} authority, sex, age and year cells had a positive control total and no modelled person, and are left empty rather than filled`
          : "") +
        (capStats.noTarget ? `; ${capStats.noTarget} authority-years had no control total and are not capped` : "") +
        ".",
    );
  } else {
    out.push(
      `Cap mode total: one factor per authority and year, so the ethnic shares and the age structure the ratios produce are kept and only the level moves` +
        (capStats.skippedOutOfRange
          ? `; ${capStats.skippedOutOfRange} authority-years whose factor fell outside 0.3 to 3.0 are not capped`
          : "") +
        (capStats.noTarget ? `; ${capStats.noTarget} authority-years had no control total and are not capped` : "") +
        ".",
    );
  }
  return out;
}

/**
 * @param {object} c
 * @param {object} c.opts            parseHpOptions() result
 * @param {object} c.settings        ratioSettings() result
 * @param {object} c.base2021        the parsed 2021 base file
 * @param {string[]} c.projected     codes written to the site file
 * @param {Record<string,string>} [c.names]  code -> area name, for the lists
 * @param {string[]} [c.successorsSummed]    codes given summed 2011 counts
 * @param {object|null} c.control    loadControlTotals() result, or null
 * @param {object} c.capStats
 * @param {object|null} c.schoolData the parsed school-validation file, if read
 * @param {number} [c.calibratedAreas]
 */
export function methodologyText(c) {
  const { opts, settings, base2021, projected, names, control, capStats, schoolData } = c;
  if (isV80Run(opts, settings)) return V80_METHODOLOGY;

  const parts = [];
  const nE = projected.filter((p) => p.startsWith("E")).length;
  const nW = projected.filter((p) => p.startsWith("W")).length;
  parts.push(
    `Hamilton-Perry single-year-of-age model, version ${opts.modelVersion}, with 20 ethnic groups, projecting ${projected.length} authorities (${nE} in England${nW ? `, ${nW} in Wales` : ""}).`,
  );

  // 2021 base
  const estimated = Object.keys(base2021.estimatedAreas ?? {}).filter((code) => projected.includes(code));
  const summed = Object.keys(base2021.aggregatedAreas ?? {}).filter((code) => projected.includes(code));
  if (base2021.estimatedAreas === undefined) {
    parts.push("Census 2021 base from ONS custom dataset (direct observations, no IPF).");
  } else {
    const observed = projected.length - estimated.length;
    parts.push(
      `Census 2021 base from the ONS custom dataset (single year of age by 20 ethnic groups by sex): ${observed} authorities are direct observations` +
        (summed.length ? `, of which ${summed.length} April 2023 ${summed.length === 1 ? "unitary is the sum" : "unitaries are the sums"} of ${summed.length === 1 ? "its" : "their"} 2022 districts: ${list(named(summed, names))}` : "") +
        ".",
    );
    if (estimated.length) {
      parts.push(
        `The bases of ${estimated.length} authorities are estimates, not observations: the custom dataset suppresses them (ONS disclosure control) or suppresses one of the 2022 districts they replaced, so their cells are fitted by iterative proportional fitting to Census 2021 RM032 (ethnic group by age band by sex) and TS009 (single year of age by sex), seeded with the observed English or Welsh single-year profile. They are ${list(named(estimated, names))}.`,
      );
    }
  }

  // 2011 base
  const wales2011 = opts.countries2011.includes("W");
  parts.push(
    `Census 2011 base from DC2101EW (18 groups, 21 age bands, interpolated to single-year; Roma split from Gypsy/Traveller using 2021 proportions)${wales2011 ? ", for English and Welsh authorities" : ""}.`,
  );
  const succ = (c.successorsSummed ?? []).filter((code) => projected.includes(code));
  if (succ.length) {
    parts.push(
      `${succ.length} authorities whose code changed after 2011 take the summed 2011 counts of the districts they replaced (ONS lookup LAD22_LAD23_UK_LU_v1 for April 2023, and for 2019 to 2021 a list checked against ONS mid-2011 estimates on April 2023 boundaries, MYEB1): ${list(named(succ, names))}.`,
    );
  }
  parts.push("91 age groups x 20 ethnic groups x 2 sexes.");

  parts.push(...controlTotalsText(control, opts, capStats));

  // Ratio settings
  if (isV80RatioSettings(settings)) {
    parts.push(
      "Cohort change ratios shrunk toward the national ratio by cell size (K=25) with a growth ceiling of 1.65 per decade, both selected on the v8.0 out-of-sample test that fits 2001 to 2011 and forecasts 2021 at 16 ethnic groups: MAE 1.56pp on the White British share across 285 English areas with unchanged codes, bias +0.05pp.",
    );
  } else {
    parts.push(
      `Cohort change ratios ${settings.useShrinkage ? `shrunk toward the national ratio by cell size (K=${settings.shrinkK})` : "frozen at 1.0 where the 2011 cell held five people or fewer"}, with a growth ceiling of ${settings.ceiling} and a floor of ${settings.floor} per decade. These are not the settings selected on the out-of-sample test.`,
    );
  }

  parts.push(opts.brexitDamp ? "Brexit adjustment to White Other: growth damped by 15% at ages 10 to 34." : "No Brexit adjustment.");

  if (!opts.schoolCalibration) {
    parts.push("No School Census calibration.");
  } else if (schoolData?.areas) {
    parts.push(
      `School Census calibration from ${schoolData.source ?? path.basename(opts.schoolValidation)}: 20% of the gap between school and Census 2021 child shares, applied to ages 0 to 5, in ${c.calibratedAreas ?? 0} authorities.`,
    );
  } else {
    parts.push("School Census calibration was asked for but its file was not found, so none is applied.");
  }
  return parts.join(" ");
}

/** The sentence run_stochastic_hp.mjs appends to the methodology. */
export function stochasticSentence({ opts, settings, simulations }) {
  if (isV80Run(opts, settings) && simulations === 1000) return V80_STOCHASTIC_SENTENCE;
  return ` Monte Carlo stochastic projection (${simulations} simulations) run through the same code and options as the projection, with each cohort change ratio perturbed by a normal error whose standard deviation is 0.02 plus 0.25 over the square root of its 2011 cell size, widened by the square root of the horizon in decades, and each child-woman ratio by one of 0.02 plus 0.15 over the square root of its 2021 women aged 15 to 44. The 0.02 comes from the v8.0 out-of-sample test (White British MAE 1.56pp over 285 areas) and has not been re-derived for this configuration. Reports the median and 80% and 95% prediction intervals.`;
}
