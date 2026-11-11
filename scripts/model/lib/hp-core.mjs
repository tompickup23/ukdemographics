/**
 * The Hamilton-Perry projection step, shared by run_hp_single_year.mjs and
 * run_stochastic_hp.mjs.
 *
 * The two scripts used to carry their own copies of the ratio arithmetic, the
 * Brexit damp, the School Census calibration and the control-total cap, and the
 * copies drifted: the stochastic one computed its national ratios differently,
 * clamped the cap factor where the deterministic run skipped it, and had none of
 * the v8.1 options (base, control totals, cap mode, Wales, successors). Its
 * bands therefore described a different model from the projection they were
 * drawn around. Both scripts now call these functions, so the only difference
 * between them is the noise the stochastic run adds, and one simulation with the
 * noise off reproduces the deterministic run exactly
 * (tests/stochastic-zero-noise.test.mjs).
 *
 * The code below is the deterministic run's, moved here unchanged;
 * tests/hp-regression.test.mjs checks that the default run still reproduces the
 * published v8.0 projections value for value.
 */

export const SEXES = ["M", "F"];
export const PROJ_YEARS = [2031, 2041, 2051, 2061];

export const CALIBRATION_GROUPS = {
  white_british: ["WBI"],
  white_other: ["WIR", "WGT", "WRO", "WHO"],
  asian: ["IND", "PAK", "BAN", "CHI", "OAS"],
  black: ["BAF", "BCA", "OBL"],
  mixed: ["MWA", "MWF", "MWC", "MOM"],
  other: ["ARB", "OOT"],
};

/** The ratio guardrails, read from the environment variables v8.0 used. */
export function ratioSettings(env = process.env) {
  return {
    useShrinkage: env.CCR_SHRINKAGE !== "0",
    shrinkK: Number(env.CCR_SHRINK_K ?? 25),
    ceiling: Number(env.CCR_CEILING ?? 1.65),
    floor: Number(env.CCR_FLOOR ?? 0.05),
  };
}

export function isV80RatioSettings(s) {
  return s.useShrinkage && s.shrinkK === 25 && s.ceiling === 1.65 && s.floor === 0.05;
}

/**
 * Cohort change ratios Pop(age+10, 2021) / Pop(age, 2011) and child-woman
 * ratios, with optional empirical-Bayes shrinkage toward the national ratio.
 * See run_hp_single_year.mjs for why the shrinkage and the 1.65 ceiling.
 */
export function computeRatios(base2021, pop2011, areaCodes, groups, s) {
  const nationalCCRs = new Map(); // "eth|sex|fromAge" -> pop-weighted national ratio
  if (s.useShrinkage) {
    const num = new Map(), den = new Map();
    for (const code of areaCodes) {
      for (const eth of groups) {
        for (const sex of SEXES) {
          for (let fromAge = 0; fromAge <= 80; fromAge++) {
            const key = `${eth}|${sex}|${fromAge}`;
            num.set(key, (num.get(key) || 0) + (base2021.areas[code][eth]?.[sex]?.[fromAge + 10] || 0));
            den.set(key, (den.get(key) || 0) + (pop2011.get(`${code}|${eth}|${sex}|${fromAge}`) || 0));
          }
        }
      }
    }
    for (const [key, n] of num) {
      const d = den.get(key) || 0;
      nationalCCRs.set(key, d > 5 ? Math.max(s.floor, Math.min(s.ceiling, n / d)) : 1.0);
    }
  }

  const ccrs = new Map();
  const cwrs = new Map();
  for (const code of areaCodes) {
    for (const eth of groups) {
      // CWR: children / women of childbearing age
      let children = 0, women = 0;
      for (let age = 0; age <= 9; age++) {
        children += (base2021.areas[code][eth]?.M?.[age] || 0) + (base2021.areas[code][eth]?.F?.[age] || 0);
      }
      for (let age = 15; age <= 44; age++) {
        women += base2021.areas[code][eth]?.F?.[age] || 0;
      }
      cwrs.set(`${code}|${eth}`, women > 5 ? children / women / 10 : 0.03);

      for (const sex of SEXES) {
        for (let fromAge = 0; fromAge <= 80; fromAge++) {
          const toAge = fromAge + 10;
          const pop11 = pop2011.get(`${code}|${eth}|${sex}|${fromAge}`) || 0;
          const pop21 = base2021.areas[code][eth]?.[sex]?.[toAge] || 0;

          let ccr;
          if (s.useShrinkage) {
            const nat = nationalCCRs.get(`${eth}|${sex}|${fromAge}`) ?? 1.0;
            const local = pop11 > 0 ? pop21 / pop11 : nat;
            ccr = (pop11 * local + s.shrinkK * nat) / (pop11 + s.shrinkK);
            ccr = Math.max(s.floor, Math.min(s.ceiling, ccr));
          } else if (pop11 > 5) {
            ccr = pop21 / pop11;
            ccr = Math.max(s.floor, Math.min(s.ceiling, ccr));
          } else {
            ccr = 1.0;
          }
          ccrs.set(`${code}|${eth}|${sex}|${fromAge}`, ccr);
        }
      }
    }
  }
  return { ccrs, cwrs, nationalCCRs };
}

/** Brexit adjustment: White Other (WHO) ages 10 to 34, growth damped by 15%. */
export function applyBrexitDamp(ccrs, areaCodes) {
  let adjusted = 0;
  for (const code of areaCodes) {
    for (const sex of SEXES) {
      for (let fromAge = 10; fromAge <= 34; fromAge++) {
        const key = `${code}|WHO|${sex}|${fromAge}`;
        const ccr = ccrs.get(key);
        if (ccr && ccr > 1.0) {
          ccrs.set(key, 1.0 + (ccr - 1.0) * 0.85);
          adjusted++;
        }
      }
    }
  }
  return adjusted;
}

/**
 * DfE School Census calibration: where the school share of a broad group differs
 * from the Census 2021 child share by 1.5pp or more, move the ratios of ages 0 to
 * 5 by 20% of the gap. Returns the number of areas calibrated.
 */
export function applySchoolCalibration(ccrs, schoolData, base2021, s) {
  let calibratedAreas = 0;
  for (const sv of schoolData?.areas ?? []) {
    const code = sv.areaCode;
    if (!base2021.areas[code]) continue;

    for (const [group, ethCodes] of Object.entries(CALIBRATION_GROUPS)) {
      const comparison = sv.comparison?.[group];
      if (!comparison?.censusChildPct || !comparison?.schoolPct) continue;
      const gapPp = comparison.gapPp; // schoolPct - censusChildPct
      if (Math.abs(gapPp) < 1.5) continue;
      const dampFactor = 0.2;
      const adjustment = 1 + (gapPp / 100) * dampFactor;
      for (const eth of ethCodes) {
        for (const sex of SEXES) {
          for (let fromAge = 0; fromAge <= 5; fromAge++) {
            const key = `${code}|${eth}|${sex}|${fromAge}`;
            const ccr = ccrs.get(key);
            if (ccr) {
              ccrs.set(key, Math.max(s.floor, Math.min(s.ceiling, ccr * adjustment)));
            }
          }
        }
      }
    }
    calibratedAreas++;
  }
  return calibratedAreas;
}

export function newCapStats() {
  return { capped: 0, skippedOutOfRange: 0, noTarget: 0, emptyCells: 0 };
}

/**
 * Project one area from 2021 to 2061 in ten-year steps.
 *
 * ctx: { base2021, groups, ages, ccrs, cwrs, control, capMode, capStats, ageSex }
 *   control   a loadControlTotals() result, or null for no cap
 *   ageSex    true to keep each year's persons by sex and single year of age
 * perturb (optional, the stochastic run's noise):
 *   ccr(ccr, code, eth, sex, fromAge, year) and cwr(cwr, code, eth, year), each
 *   returning the ratio to use. Without it the ratios are used as computed.
 *
 * Returns { 2021: {total, eth}, 2031: {total, eth[, ageSex]}, ... }.
 */
export function projectArea(code, ctx, perturb) {
  const { base2021, groups, ages, ccrs, cwrs, control, capMode, capStats } = ctx;
  const timeline = {};

  // 2021 baseline
  let total2021 = 0;
  const eth2021 = {};
  for (const eth of groups) {
    eth2021[eth] = 0;
    for (const sex of SEXES) {
      eth2021[eth] += base2021.areas[code][eth]?.[sex]?.total || 0;
    }
    total2021 += eth2021[eth];
  }
  timeline[2021] = { total: total2021, eth: eth2021 };

  // Current population matrix
  let currentPop = {};
  for (const eth of groups) {
    currentPop[eth] = {};
    for (const sex of SEXES) {
      currentPop[eth][sex] = {};
      for (const age of ages) {
        currentPop[eth][sex][age] = base2021.areas[code][eth]?.[sex]?.[age] || 0;
      }
    }
  }

  for (const year of PROJ_YEARS) {
    const newPop = {};

    // Pass 1: advance every surviving cohort for BOTH sexes.
    // Births must not be computed inside this loop: the female 15-44 population
    // that drives them does not exist until the "F" iteration has run, so a
    // births block here sizes male births off the PREVIOUS step's women.
    for (const eth of groups) {
      newPop[eth] = {};
      for (const sex of SEXES) {
        newPop[eth][sex] = {};
        for (let toAge = 10; toAge <= 90; toAge++) {
          const fromAge = toAge - 10;
          let ccr = ccrs.get(`${code}|${eth}|${sex}|${fromAge}`) || 1.0;
          if (perturb) ccr = perturb.ccr(ccr, code, eth, sex, fromAge, year);
          newPop[eth][sex][toAge] = Math.round((currentPop[eth][sex][fromAge] || 0) * ccr);
        }
        // 90+ survivors
        newPop[eth][sex][90] = (newPop[eth][sex][90] || 0) +
          Math.round((currentPop[eth][sex][90] || 0) * 0.3);
      }
    }

    // Pass 2: births (ages 0-9), driven by the projected women of this step.
    for (const eth of groups) {
      let cwr = cwrs.get(`${code}|${eth}`) || 0.03;
      if (perturb) cwr = perturb.cwr(cwr, code, eth, year);
      let women = 0;
      for (let age = 15; age <= 44; age++) {
        women += newPop[eth].F[age] || 0;
      }
      const birthsPerYear = women * cwr;
      for (const sex of SEXES) {
        const sexRatio = sex === "M" ? 0.512 : 0.488;
        for (let age = 0; age <= 9; age++) {
          newPop[eth][sex][age] = Math.round(birthsPerYear * sexRatio);
        }
      }
    }

    // Control-total constraint.
    // "total" (v8.0): one factor per area and year, so every ethnic share and
    // the age structure the ratios produced are kept and only the level moves.
    // "age-sex": one factor per area, sex, single year of age and year (Hauer
    // 2019's within-cell ratio), so ethnic shares inside each age and sex cell
    // are kept and the age structure follows the control totals.
    if (control && capMode === "total") {
      const snppTarget = control.total(code, year);
      if (snppTarget && snppTarget > 0) {
        let modelTotal = 0;
        for (const eth of groups) for (const sex of SEXES) for (const age of ages) {
          modelTotal += newPop[eth][sex][age] || 0;
        }
        if (modelTotal > 0) {
          const scale = snppTarget / modelTotal;
          if (scale > 0.3 && scale < 3.0) {
            for (const eth of groups) for (const sex of SEXES) for (const age of ages) {
              newPop[eth][sex][age] = Math.round((newPop[eth][sex][age] || 0) * scale);
            }
            capStats.capped++;
          } else {
            capStats.skippedOutOfRange++;
          }
        }
      } else {
        capStats.noTarget++;
      }
    } else if (control && capMode === "age-sex") {
      if (control.total(code, year) === undefined) {
        capStats.noTarget++;
      } else {
        for (const sex of SEXES) for (const age of ages) {
          const target = control.cell(code, sex, age, year);
          if (target === undefined) throw new Error(`control totals lack ${code} ${sex} ${age} ${year}`);
          let modelCell = 0;
          for (const eth of groups) modelCell += newPop[eth][sex][age] || 0;
          if (modelCell > 0) {
            const scale = target / modelCell;
            for (const eth of groups) newPop[eth][sex][age] = Math.round((newPop[eth][sex][age] || 0) * scale);
          } else if (target > 0) {
            // No modelled person in this cell to carry the control total's
            // ethnic mix; left empty and counted rather than invented.
            capStats.emptyCells++;
          }
        }
        capStats.capped++;
      }
    }

    // Summarise
    let total = 0;
    const eth = {};
    for (const e of groups) {
      eth[e] = 0;
      for (const s of SEXES) for (const a of ages) eth[e] += newPop[e][s][a] || 0;
      total += eth[e];
    }
    timeline[year] = { total, eth };
    if (ctx.ageSex) {
      const ageSex = {};
      for (const s of SEXES) ageSex[s] = ages.map((a) => groups.reduce((sum, e) => sum + (newPop[e][s][a] || 0), 0));
      timeline[year].ageSex = ageSex;
    }
    currentPop = newPop;
  }
  return timeline;
}
