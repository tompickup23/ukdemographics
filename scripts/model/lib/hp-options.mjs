/**
 * Run options for scripts/model/run_hp_single_year.mjs.
 *
 * Every option has a default that reproduces the published v8.0 run, so a run
 * with no flags is the v8.0 run. Each can be set as a command-line flag or as
 * an environment variable; the flag wins. The environment variables that
 * already existed (HP_OUTPUT, BREXIT_DAMP, CCR_SHRINKAGE, CCR_SHRINK_K,
 * CCR_CEILING, CCR_FLOOR) keep working.
 *
 *   --groups detailed|all-persons   HP_GROUPS              detailed
 *   --snpp-cap on|off               HP_SNPP_CAP            on
 *   --cap-mode total|age-sex        HP_CAP_MODE            total
 *   --control-totals <file>         HP_CONTROL_TOTALS      data/raw/snpp/2022 SNPP Population persons.csv
 *   --brexit-damp on|off            BREXIT_DAMP (1/0)      on in detailed mode, off in all-persons
 *   --school-calibration on|off     HP_SCHOOL_CALIBRATION  on in detailed mode, off in all-persons
 *   --base <file>                   HP_BASE                data/model/base_single_year_2021.json
 *   --dc2101ew <file>               HP_DC2101EW            data/raw/census_2011_ethnicity_age/dc2101ew_ethnicity_sex_age_la.csv
 *   --newethpop-2011 <file>         HP_NEWETHPOP_2011      data/raw/newethpop/.../Population2011_LEEDS2.csv
 *   --countries-2011 E[,W]          HP_COUNTRIES_2011      E
 *   --successors-2011 on|off        HP_SUCCESSORS_2011     off (on: authorities whose code changed
 *                                                          since 2011 take summed 2011 counts)
 *   --school-validation <file>      HP_SCHOOL_VALIDATION   src/data/live/school-validation.json
 *   --site-input <file>             HP_SITE_INPUT          src/data/live/ethnic-projections.json
 *   --output <file>                 HP_OUTPUT              the site input file
 *   --format site|raw               HP_FORMAT              site (raw in all-persons mode)
 *   --model-version <string>        HP_MODEL_VERSION       8.0-out-of-sample-calibrated
 *   --run-record <file>             HP_RUN_RECORD          <output>.run.json, or data/model/runs/ for a site write
 *
 * "all-persons" sums the 20 groups into one before ratios are computed, which is
 * the economy model's use of this engine (UK State plan, E1 part 2). The Brexit
 * damp and the School Census calibration act on named ethnic groups and cannot
 * run in that mode; asking for them is an error. An all-persons run cannot write
 * the site file.
 */
import path from "node:path";

export const DEFAULTS = Object.freeze({
  groups: "detailed",
  snppCap: true,
  capMode: "total",
  controlTotals: "data/raw/snpp/2022 SNPP Population persons.csv",
  base: "data/model/base_single_year_2021.json",
  dc2101ew: "data/raw/census_2011_ethnicity_age/dc2101ew_ethnicity_sex_age_la.csv",
  newethpop2011: "data/raw/newethpop/extracted/2DataArchive/OutputData/Population/Population2011_LEEDS2.csv",
  countries2011: ["E"],
  schoolValidation: "src/data/live/school-validation.json",
  siteInput: "src/data/live/ethnic-projections.json",
  modelVersion: "8.0-out-of-sample-calibrated",
});

const onOff = (value, name) => {
  if (value === undefined) return undefined;
  const v = String(value).toLowerCase();
  if (["on", "1", "true", "yes"].includes(v)) return true;
  if (["off", "0", "false", "no"].includes(v)) return false;
  throw new Error(`${name}: expected on or off, got "${value}"`);
};

export function parseHpOptions(argv = process.argv.slice(2), env = process.env) {
  const flags = {};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (!a.startsWith("--")) throw new Error(`unexpected argument "${a}"`);
    const [name, inline] = a.slice(2).split("=", 2);
    const value = inline ?? argv[++i];
    if (value === undefined) throw new Error(`--${name} needs a value`);
    flags[name] = value;
  }
  const known = new Set([
    "groups", "snpp-cap", "cap-mode", "control-totals", "brexit-damp", "school-calibration",
    "base", "dc2101ew", "newethpop-2011", "countries-2011", "successors-2011", "school-validation", "site-input",
    "output", "format", "model-version", "run-record",
  ]);
  for (const k of Object.keys(flags)) if (!known.has(k)) throw new Error(`unknown flag --${k}`);

  const pick = (flag, envName, fallback) => flags[flag] ?? (envName ? env[envName] : undefined) ?? fallback;

  const groups = pick("groups", "HP_GROUPS", DEFAULTS.groups);
  if (!["detailed", "all-persons"].includes(groups)) throw new Error(`--groups: expected detailed or all-persons, got "${groups}"`);
  const allPersons = groups === "all-persons";

  const capMode = pick("cap-mode", "HP_CAP_MODE", DEFAULTS.capMode);
  if (!["total", "age-sex"].includes(capMode)) throw new Error(`--cap-mode: expected total or age-sex, got "${capMode}"`);

  // BREXIT_DAMP has always meant "off only when 0".
  const brexitEnv = env.BREXIT_DAMP === undefined ? undefined : env.BREXIT_DAMP !== "0";
  const brexitDamp = onOff(flags["brexit-damp"], "--brexit-damp") ?? brexitEnv ?? !allPersons;
  const schoolCalibration =
    onOff(flags["school-calibration"], "--school-calibration") ??
    onOff(env.HP_SCHOOL_CALIBRATION, "HP_SCHOOL_CALIBRATION") ??
    !allPersons;
  if (allPersons && brexitDamp) throw new Error("the Brexit damp acts on White Other and cannot run in all-persons mode");
  if (allPersons && schoolCalibration) throw new Error("the School Census calibration acts on ethnic groups and cannot run in all-persons mode");

  const snppCap = onOff(flags["snpp-cap"], "--snpp-cap") ?? onOff(env.HP_SNPP_CAP, "HP_SNPP_CAP") ?? DEFAULTS.snppCap;

  const resolve = (p) => path.resolve(p);
  const siteInput = resolve(pick("site-input", "HP_SITE_INPUT", DEFAULTS.siteInput));
  const output = resolve(pick("output", "HP_OUTPUT", siteInput));
  const format = pick("format", "HP_FORMAT", allPersons ? "raw" : "site");
  if (!["site", "raw"].includes(format)) throw new Error(`--format: expected site or raw, got "${format}"`);
  if (allPersons && format === "site") throw new Error("an all-persons run cannot write the site file; use --format raw");

  const countries2011 = String(pick("countries-2011", "HP_COUNTRIES_2011", DEFAULTS.countries2011.join(",")))
    .split(",").map((s) => s.trim()).filter(Boolean);

  const opts = {
    groups,
    allPersons,
    snppCap,
    capMode,
    controlTotals: resolve(pick("control-totals", "HP_CONTROL_TOTALS", DEFAULTS.controlTotals)),
    brexitDamp,
    schoolCalibration,
    base: resolve(pick("base", "HP_BASE", DEFAULTS.base)),
    dc2101ew: resolve(pick("dc2101ew", "HP_DC2101EW", DEFAULTS.dc2101ew)),
    newethpop2011: resolve(pick("newethpop-2011", "HP_NEWETHPOP_2011", DEFAULTS.newethpop2011)),
    countries2011,
    successors2011:
      onOff(flags["successors-2011"], "--successors-2011") ?? onOff(env.HP_SUCCESSORS_2011, "HP_SUCCESSORS_2011") ?? false,
    schoolValidation: resolve(pick("school-validation", "HP_SCHOOL_VALIDATION", DEFAULTS.schoolValidation)),
    siteInput,
    output,
    format,
    modelVersion: pick("model-version", "HP_MODEL_VERSION", DEFAULTS.modelVersion),
  };
  const record = pick("run-record", "HP_RUN_RECORD", undefined);
  opts.runRecord = record
    ? resolve(record)
    : output === siteInput
      ? resolve(`data/model/runs/hp-${new Date().toISOString().replace(/[:.]/g, "-")}.json`)
      : `${output}.run.json`;
  return opts;
}

/** True when every option that changes the numbers is at its v8.0 value. */
export function isV80Configuration(opts) {
  return (
    opts.groups === DEFAULTS.groups &&
    opts.snppCap === DEFAULTS.snppCap &&
    opts.capMode === DEFAULTS.capMode &&
    opts.controlTotals === path.resolve(DEFAULTS.controlTotals) &&
    opts.brexitDamp === true &&
    opts.schoolCalibration === true &&
    opts.base === path.resolve(DEFAULTS.base) &&
    opts.countries2011.join(",") === DEFAULTS.countries2011.join(",") &&
    opts.successors2011 === false
  );
}
