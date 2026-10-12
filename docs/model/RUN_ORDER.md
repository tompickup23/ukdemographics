# Model run order

Written 12 October 2026 from each script's own reads and writes (`readFileSync` and `writeFileSync` targets, and the fields of `src/data/live/ethnic-projections.json` each one assigns). It confirms, with three corrections, the order inferred in the refresh audit (Reports `UKD_Refresh_work/B_pipelines.md` s1). Nothing here has been run end to end for a publish since v8.0 (13 and 14 August 2026).

## 0. Inputs

```
node scripts/model/link_inputs.mjs            # or: npm run model:link
node scripts/model/link_inputs.mjs --check    # verify only
```

`data/model/INPUTS.json` names every gitignored input, the store that holds it (by default `~/asylumstats/data` or `~/ukdemographics/data`) and its sha256. The script symlinks what is missing into the checkout and fails on a missing file or a changed hash. It never copies, moves or overwrites a held file: the LGR Zenodo tools and other repos read `~/asylumstats/data/raw/snpp/` and `~/asylumstats/data/model/` directly.

On 12 October 2026 all 32 inputs verified, and `run_hp_single_year.mjs` on main, run with `HP_OUTPUT` pointing at a scratch file, reproduced every field it writes for all 318 published areas exactly (41,841 values compared, none differ). The only difference in the file is the top-level `methodology` string, to which `run_stochastic_hp.mjs` appends its own sentence after the forward model has run.

**Warning about symlinks.** A script that writes to a path the link step has symlinked writes through the link into the store. `build_single_year_base.mjs` writes `data/model/base_single_year_2021.json`, which is linked to the held copy other repos read. Do not run it in a linked checkout until it takes an output path (planned in the base rebuild PR).

## 1. Build the base

| Step | Script | Reads | Writes |
|---|---|---|---|
| 1.1 | `build_single_year_base.mjs` | Census 2021 custom dataset (single year of age by 20 groups by sex) | `data/model/base_single_year_2021.json`, `_12group.json` |

## 2. School calibration input

| Step | Script | Reads | Writes |
|---|---|---|---|
| 2.1 | `validate_schools.mjs` | base, DfE pupils by ethnicity, `current.groups` from `ethnic-projections.json` | `src/data/live/school-validation.json` |

`current.groups` for modelled areas is itself written by the forward model from the base, so step 2.1 gives the same result before or after step 3.1 for those areas. It differs for areas the model does not cover, whose `current.groups` come from the transform.

## 3. Forward model and uncertainty

| Step | Script | Reads | Writes (fields of `ethnic-projections.json`) |
|---|---|---|---|
| 3.1 | `run_hp_single_year.mjs` | base, DC2101EW, NEWETHPOP 2011, SNPP persons CSV, `school-validation.json` | `current.groups`, `current.groups_detail`, `current.groups_absolute_detail`, `projections`, `projections_detail`, `thresholds`, `headlineStat`; top-level `methodology`, `modelVersion`, `lastUpdated` |
| 3.2 | `run_stochastic_hp.mjs` | the same inputs, `model-validation.json` | `stochastic`, `confidenceBand2051`; appends to `methodology`. Over an hour; holds `.stochastic-run.lock` |
| 3.3 | `run_projection_v2.mjs` | `data/model/base_population_2021.json`, `net_migration_rates.json`, SNPP persons CSV, `model-validation.json` | `scenarioRange2051`, `modelSpread2051.cohortComponent` only |

Step 3.3 doubled its SNPP target until the fix in the v2 PR (it summed the "All ages" row with every single-year row). Do not run it from a branch without that fix.

The forward model projects an area only if its code is in both the 2021 base and NEWETHPOP's 2011 file. With the current base that is 278 codes, of which 269 are written: the other nine (E07000028, E07000031, E07000164, E07000165, E07000168, E07000169, E07000187, E07000188, E07000189) are districts abolished in April 2023 and have no record on the site.

## 4. Enrichment (each reads and rewrites `ethnic-projections.json` in place)

Run in this order. Each writes only the fields listed, so the order among them matters only where a later one reads an earlier one's output; the order below respects every such read found.

| Step | Script | Extra inputs | Fields written |
|---|---|---|---|
| 4.1 | `project_religion_nativity.mjs` | KS204, KS209, TS004, TS030 | `religion`, `nativity`, `foreignBornPct2021`, `foreignBornPct2051`, `muslimPct2051` |
| 4.2 | `apply_methodology_fixes.mjs` | KS204, TS004 | `nativityDecomposition`, `covidCaveat`, top-level `knownLimitations` |
| 4.3 | `integrate_socioeconomic.mjs` | RM018, RM043, RM049, RM134 | `economicActivity`, `health`, `housingTenure`, `qualifications` |
| 4.4 | `integrate_supplementary.mjs` | TS029 raw CSV | `englishProficiency`, `diversityIndex` |
| 4.5 | `sync_english_proficiency.mjs` | committed `census-english-proficiency.json` | `englishProficiency`, `currentProficiency`; also `language-projections.json` |
| 4.6 | `compute_shift_share.mjs` | none | `shiftShare` |
| 4.7 | `improve_mixing.mjs` | TS023 | `kaufmannMixing`, `interEthHH`, `totalHH`, top-level `academicReferences` |
| 4.8 | `build_nationality_ethnicity_map.mjs` | TS022 | `data/model/nationality_ethnicity_lookup.json`, `nationality-ethnicity-map.json` |
| 4.9 | `integrate_asylum_ethnicity.mjs` | `nationality_ethnicity_lookup.json`, `grant-rates-nationality.json`, `local-route-latest.json` | `asylumEthnicImpact` |
| 4.10 | `integrate_schools_compare.mjs` | DfE pupils CSV, **read from the hard-coded path `/tmp/data/spc_pupils_ethnicity_and_language.csv`** | `schoolEthnicity`, `impactProjections`, top-level `compareRankings` |
| 4.11 | `apply_spatial_smoothing.mjs` | `data/model/region_groups.json` | `smoothedProjections`, `migrationProfile` |

Corrections to the inferred order:

- `sync_english_proficiency.mjs` must run **after** `integrate_supplementary.mjs`, which rewrites `englishProficiency` from the raw TS029 CSV and would otherwise undo the 7 September 2026 fix for the four April 2023 unitaries.
- `apply_methodology_fixes.mjs` was missing from the inferred order. It writes three fields no other script writes.
- `integrate_schools_compare.mjs` reads its DfE file from `/tmp/data/`, not from `data/raw/dfe_schools/`. Copy or link the file there, or fix the path, before running it.

## 5. Canonical codes and reconciliation

| Step | Script | Writes |
|---|---|---|
| 5.1 | `canonicalise_area_codes.mjs` | folds or drops alias records (E08000038 and E08000039) in every file under `src/data/live` |
| 5.2 | `reconcile_derived.mjs` | repoints `modelSpread2051.hamiltonPerry` at the live projection; `--check` reports drift |

## 6. Derived dashboards

| Step | Script | Writes |
|---|---|---|
| 6.1 | `generate_national_dashboards.mjs` | `economic-profile.json`, `school-pressure.json`, `housing-demand.json`, `health-demand.json`, `dependency-ratios.json`, `language-projections.json`, `fiscal-resilience.json`, `crime-correlation.json` |

Step 6.1 rewrites `health-demand.json`, whose `healthDemandScore` is weighted by ethnic composition and is not a health measure. It also rewrites `crime-correlation.json`, which decision D7 retires, and `language-projections.json` after step 4.5 has corrected it. Do not run it for v8.1 until those three outputs are decided; run the parts that are needed instead.

## 7. Validation (after the forward model)

| Step | Script | Reads | Writes |
|---|---|---|---|
| 7.1 | `validate_out_of_sample.mjs` | ST101 (2001), DC2101EW, `current.groups` | `out-of-sample-validation.json` |
| 7.2 | `validate_backcast.mjs` | base, DC2101EW, NEWETHPOP 2011 and 2021 | `model-validation.json` (circular by construction; kept for continuity) |

The out-of-sample result is published before any forward view (economy plan s8 rule 7).

## Scripts not in the run

These still write `projections` or `headlineStat` and would overwrite the forward model's output. They belong to retired models and must not be run:

- `run_projection.mjs` (five-year cohort-component model; also writes `data/model/projections.json`)
- `run_hamilton_perry.mjs` (five-year Hamilton-Perry, before the single-year model)
- `run_ensemble.mjs`
- `build_scenario_summary.mjs` reads the retired cohort-component output and writes `scenario-summaries.json`

Feeders of the retired cohort-component chain, which v8.1 does not need: `build_base_population.mjs`, `build_components.mjs`, `build_migration_matrix.mjs`, `build_net_migration_rates.mjs`, `integrate_census_migration.mjs`, `extract_fertility_rates.mjs`, `compute_school_fertility_proxy.mjs`. `extract_grant_rates.mjs` is not part of the model: it builds the committed `grant-rates-nationality.json` that step 4.9 reads, from the Home Office files in `data/raw/uk_routes`. `run_projection_v2.mjs` reads two of their held outputs (`base_population_2021.json`, `net_migration_rates.json`), which are in the manifest.
