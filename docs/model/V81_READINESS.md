# Model v8.1: readiness

Written 12 October 2026, at the end of the preparation for phase 3 of the UKD refresh plan (Reports repo, `UKD_Data_Refresh_Plan_2026-10-11.md`, decisions D3 to D6, delegated by Tom on 12 October). Nothing in this document has been published and no live data file has changed. v8.0 (13 and 14 August 2026) is still what the site shows.

Updated 21 October 2026: blockers 2 to 5 are closed in code on branch `model/v81-prep-2026-10-21` (draft PR, not merged without Tom's yes), and blocker 6 is written up below as a decision for Tom. v8.1 has not been run and no model output has been published.

## What is ready

| Piece | Where | State |
|---|---|---|
| Input manifest and link script | `data/model/INPUTS.json`, `scripts/model/link_inputs.mjs` | 37 inputs with sha256; all verified on 12 Oct |
| Run order | `docs/model/RUN_ORDER.md` | From each script's reads and writes |
| v2 envelope fix | `scripts/model/lib/snpp.mjs`, `run_projection_v2.mjs` | Sums only the "All ages" row; test failed on the old read |
| Forward model options | `scripts/model/lib/hp-options.mjs`, `run_hp_single_year.mjs` | All-persons mode, cap on or off, cap by total or by age and sex, control-totals file, Brexit and School Census blocks, every path, run record |
| v8.0 regression | `tests/hp-regression.test.mjs` | A default run reproduces all 269 modelled areas exactly |
| Control totals (D3, D4) | `scripts/model/build_control_totals.mjs` | Builds `data/model/control_totals_v81.json` and the 3596 sensitivity file; tested against the sources |
| Base with Wales and the suppressed areas (D6) | `build_single_year_base.mjs` options, `lib/rm032-fallback.mjs`, `scripts/model/geography/lad11-successors.json` | A scratch run projects all 318 authorities |
| Shared projection step (21 Oct) | `scripts/model/lib/hp-core.mjs` | The deterministic run's ratio, adjustment, cap and projection code, moved unchanged; both runs call it |
| Stochastic options and zero-noise check (21 Oct) | `run_stochastic_hp.mjs`, `tests/stochastic-zero-noise.test.mjs` | Same options as the forward model; one simulation with the noise off reproduces it exactly |
| Out-of-sample coverage (21 Oct) | `validate_out_of_sample.mjs`, `tests/out-of-sample-coverage.test.mjs` | Wales, successors and the 2023 unitaries can be scored; no 2001 lookup gap |
| School Census base option (21 Oct) | `validate_schools.mjs`, `tests/validate-schools-base.test.mjs` | `--base`, `--output`; default unchanged |
| Methodology text (21 Oct) | `scripts/model/lib/hp-methodology.mjs`, `tests/hp-methodology.test.mjs` | Composed from the options and inputs used; v8.0 text byte for byte by default |

### What a scratch run showed

With the v8.1 base, the successor lookup, the v8.1 control totals and either cap mode, the forward model projected **all 318 authorities**, against 269 in v8.0. So every one of the 49 legacy areas (22 Welsh, 27 English) can be regenerated and none needs withdrawing under D6, subject to the back-test below. How they are covered:

| Group | Count | How the base is built | How the 2011 side is found |
|---|---:|---|---|
| Welsh authorities in the custom dataset | 19 | Observed (`--include-wales`) | DC2101EW (`--countries-2011 E,W`) |
| Welsh authorities the custom dataset suppresses (Isle of Anglesey, Blaenau Gwent, Merthyr Tydfil) | 3 | RM032 and TS009 by IPF | DC2101EW |
| English authorities the custom dataset suppresses (Ribble Valley, Staffordshire Moorlands, Melton, Torridge, Rutland, West Devon, City of London, Derbyshire Dales, Isles of Scilly, Mid Devon) | 10 | RM032 and TS009 by IPF | DC2101EW |
| Authorities whose code changed between 2011 and 2021 (Northumberland, Gateshead, St Albans, Welwyn Hatfield, East Hertfordshire, Stevenage, Bournemouth Christchurch and Poole, Dorset, Buckinghamshire, North and West Northamptonshire, East and West Suffolk) | 13 | Observed | Summed 2011 districts (`--successors-2011 on`) |
| April 2023 unitaries | 4 | Somerset summed from its four districts; Cumberland, Westmorland and Furness, North Yorkshire by IPF (some of their districts are suppressed) | Summed 2011 districts |

The 16 IPF areas are estimates, not observations. The base lists them under `estimatedAreas` with the fit, and the methodology must say so.

These scratch outputs were for checking that the code runs. Their numbers are not results and must not be quoted.

### Control totals: what the file holds

`data/model/control_totals_v81.json`: 296 English and 22 Welsh authorities on April 2023 boundaries, by sex and single year of age (90 meaning 90 and over), mid-2022 to mid-2061.

- 2022 to 2025: ONS mid-year estimates as revised on 29 July 2026 (MYEB1 detailed time series for 2022 to 2024; MYE2 of `mye25tablesew.xlsx` for 2025). The builder checks MYEB1 and MYE2 agree on mid-2025 in every cell.
- England from 2026: mid-2025 moved by each authority's growth by age and sex in the 2022-based SNPP **migration category variant**, then scaled so England equals the 2024-based NPP for England (principal, `en_ppp_machine_readable.xlsx` in `en1.zip`) in every age, sex and year. The held SNPP zip (`snpp_z1.zip`, sha256 `66d84d0e...`) is the migration category variant, byte-identical to the Drive copy `2022snpppopulationsyoamigcat.zip`. **v8.0 already capped to this variant**, not the principal.
- Wales from 2026: mid-2025 moved by the Welsh Government 2022-based principal projection's growth for each authority; no rescale.
- After mid-2047 (SNPP and Welsh Government horizon) the growth ratios are extended in a straight line from their 2043 to 2047 change. This is UKD's assumption and the file says so. England's total still follows the NPP, which runs to 2124.
- The step between the revised estimate and the NPP's level is small for England as a whole: 58,834,812 people at mid-2025 (sum of the 296 authorities in MYE2) against 58,829,244 in the NPP for mid-2025, a gap of 5,568. `--england-control npp-change` removes it by moving mid-2025 by the NPP's change instead of matching its level; D3 asks for the level, which is the default.

`data/model/control_totals_3596.json`: the same, with England from ONS ad hoc 3596 (mid-2025 estimates rescaled by the NPP's national change, the same for every authority) for 2026 to 2050. Sensitivity line only.

## What blocks the run

1. **Timing (D5).** ONS said on 11 August 2026 that it intends "to make an alternative population projections product available by the end of 2026 for users who require continuity between population estimates and projections" (ONS, Quarterly update on population and migration statistics: August 2026, section 3). D5: run v8.1 after that product, or by the end of January 2027 if it slips, so the control totals change once. When it lands: fetch it, add it to `INPUTS.json`, and decide whether it replaces the SNPP growth in the England step. That needs a reader in `lib/control-totals-sources.mjs`, because its layout is unknown.
2. **The stochastic run has none of the new options.** CLOSED 21 October 2026. `run_stochastic_hp.mjs` now reads every option of the forward model through `lib/hp-options.mjs` (base, DC2101EW and NEWETHPOP paths, `--countries-2011`, `--successors-2011`, control totals, cap mode, Brexit damp, School Census calibration, site input and output, format, run record), plus `--simulations` (default 1000) and `--noise on|off`. The ratios, the two adjustments, the cap and the projection step are no longer copies: both scripts call `lib/hp-core.mjs`, which is the deterministic run's code moved unchanged (`tests/hp-regression.test.mjs` still reproduces all 269 v8.0 areas, and a v8.1-option raw run was byte-identical before and after the move). The zero-noise check is `tests/stochastic-zero-noise.test.mjs`: on a five-area synthetic fixture (so it runs in CI) one simulation with the noise off matches the deterministic run in every area, year and group under four configurations (v8.0 options; Wales, successors, control-totals JSON and age-sex cap; the same with the total cap; cap and both adjustments off), a noisy run is shown to differ, and the check repeats on the held v8.0 inputs where they are linked. On 21 October it also matched on the held inputs with the v8.1 base, control totals and either cap mode (scratch only). Three things change for a default stochastic run, all bringing it into line with the forward model: national ratios are pooled the deterministic way, a cap factor outside 0.3 to 3.0 is skipped rather than clamped, and the area list is the deterministic one. Its bands will therefore differ slightly from the published v8.0 bands, which came from the older code. It no longer reads `model-validation.json`, which it never used. `--noise off` cannot write the site file. A run writing anything but the published file locks `<output>.lock` instead of `.stochastic-run.lock`.
3. **The out-of-sample test covers 285 areas with unchanged codes.** CLOSED in code 21 October 2026; the extended test has not been run for publication and must still be published before any forward view (economy plan s8 rule 7). `validate_out_of_sample.mjs` takes `--countries E,W`, `--successors on` and `--actual <file>`. With successors on, each authority whose code changed after 2011 (`successors2011()` in `lib/geography.mjs`: `lad11-successors.json` plus the April 2023 lookup) is scored on the summed counts of its 2011 districts on both sides, DC2101EW for 2011 and ST101 for 2001. **No 2001 lookup gap:** the held ST101 and DC2101EW list exactly the same 348 codes (326 English, 22 Welsh), because Nomis publishes ST101 on the same 2011 local authority geography (TYPE464) as DC2101EW. Every 2011 district named by the successor lookup is in both files, so all 11 successor authorities and 2023 unitaries are summed the same way on both sides, and the six authorities reissued codes after small boundary changes (Northumberland, Gateshead, St Albans, Welwyn Hatfield, East Hertfordshire, Stevenage) are already held under their current codes in both files and were already in the 285. A successor with any district missing would be listed under `coverage.successorGaps` and not scored; none is. `--actual` reads a 2021 base file (20 groups summed to six) instead of the site file's `current.groups`, and lists its 16 IPF-estimated areas under `coverage.estimatedActual`: their group totals are fitted to RM032, so the score for them is against an estimate whose group totals are Census counts. A scratch run with `--countries E,W --successors on` scored all 318 authorities against either source; its numbers are not results. With no flags the output is byte-identical to the v8.0 test. When the extended test is run, the σ of the stochastic run (MAE / 100, rounded to 2dp) and the out-of-sample sentence in the methodology text should be re-derived from it.
4. **`validate_schools.mjs` reads the v8.0 base by a fixed path.** CLOSED 21 October 2026. It takes `--base` (default the v8.0 path), and `--dfe`, `--projections` and `--output` so a v8.1 check writes to scratch, not `src/data/live/`. With no flags its output matches the unchanged script's on the held inputs (ignoring `generatedAt`). One thing found on the way: the published `school-validation.json` (generated 14 April 2026) is not what the script now produces from the held inputs, but only in `pipelineGap` and `comparisonTotalPop`, which read `current.groups` from the site file; the `comparison` block the forward model's calibration reads is identical. Still open: the School Census 2025/26 refresh should land first, so v8.1 calibrates on 2025/26, not 2024/25.
5. **The methodology string.** CLOSED 21 October 2026. `run_hp_single_year.mjs` now writes the text composed by `lib/hp-methodology.mjs` from what the run used: the version (`--model-version`), coverage by country, the 2021 base (direct observations, the April 2023 unitary summed from its districts, and the 16 IPF-estimated authorities by name and code, with RM032 and TS009 named), the 2011 base (Wales, the successor sums by name), the control totals from the file's own metadata (each year range's source, the post-2047 straight-line extension stated once with both sources it applies to, and every source by publisher, title, table, publication date and file), the cap mode with the run's own counts (empty age-sex cells, skipped or untargeted area-years), the ratio settings and the two adjustments. `run_stochastic_hp.mjs` appends a sentence that says its σ comes from the v8.0 test and has not been re-derived. A run in the v8.0 configuration writes the v8.0 text byte for byte and the stochastic run appends the v8.0 sentence; `tests/hp-methodology.test.mjs` checks both against the published string and `tests/hp-regression.test.mjs` checks the text a default run writes. The composed text cites the v8.0 out-of-sample figures (285 English areas) for the ratio settings until the extended test is published; it never contains Tom's name (the control-totals metadata's `decisions` field is not used).
6. **Cap mode.** OPEN: a decision for Tom (see "Decision for Tom: cap mode" below). Choose `--cap-mode age-sex` (one factor per area, sex, single year and year; ethnic shares kept within each cell, as C s1.3 recommends after Hauer 2019) or `total` (v8.0's single factor per area and year). In a scratch age-sex run, 16 area-sex-age-year cells had a positive control total and no modelled person; they are counted and left empty.
7. **Downstream.** Everything after step 3 of `RUN_ORDER.md`, the derived files, findings reconciliation (PR 63 pattern), the Asylum Stats sync (refresh plan B s1) and the dated corrections. The 49 legacy areas' place pages change, so that PR is a draft "(merge after 1 Nov)" with a fact-check.

## Decision for Tom: cap mode

Not chosen here. Both modes run through the forward model and the stochastic run, and the methodology text describes whichever is used.

| | `total` (v8.0) | `age-sex` |
|---|---|---|
| What it scales | One factor per authority and year: the model's total is moved to the control total | One factor per authority, sex, single year of age and year: each age and sex cell is moved to its control total |
| What it keeps | Every ethnic share and the age structure the cohort change ratios produce; only the level moves | The ethnic mix inside each age and sex cell; the age structure becomes the control totals' (ONS estimates, SNPP and NPP for England, Welsh Government for Wales) |
| What it changes | Nothing but the level, so the projected age structure is the model's own and can drift from the official one | The overall ethnic shares, because cells are scaled by different factors: where the control totals hold more people at an age than the model, that age's ethnic mix gains weight |
| Guard | A factor outside 0.3 to 3.0 is not applied (the area-year is left uncapped and counted) | No bound on a cell's factor |
| Empty cells | None | A cell with a positive control total and no modelled person cannot be scaled. In the scratch run 16 such authority, sex, age and year cells were left empty and counted, not filled, so those authorities' totals fall short of their control totals by those cells |
| Control-totals file | SNPP CSV or the v8.1 JSON | The v8.1 JSON only (needs age and sex detail) |
| Literature | v8.0's published method | C s1.3 recommends it, citing Hauer (2019) |

The readiness work recommends `age-sex` (it is what C s1.3 recommends, and step 6 of the commands below uses it), so that the projection's age structure matches the official series it is capped to. The cost is the 16 empty cells and a change in overall ethnic shares that is caused by the cap rather than by the ratios. `total` keeps v8.0's behaviour and its continuity. Before choosing, compare the two scratch runs area by area (the raw format holds both by age and sex); those numbers are for the decision, not for quoting.

## Commands for v8.1

Run in a fresh worktree from `origin/main` after these PRs are merged. Write every output to a scratch directory first.

```
git fetch origin
git worktree add ~/ukdemographics-wt-v81 origin/main
cd ~/ukdemographics-wt-v81 && ln -s ~/ukdemographics/node_modules node_modules

# 1. Inputs: link and verify every file by hash
node scripts/model/link_inputs.mjs

# 2. If a newer edition is wanted (or ONS's interim product has landed), fetch,
#    then add or update the entries in data/model/INPUTS.json and re-link
node scripts/fetch/fetch-projection-inputs.mjs --all --dir ~/asylumstats/data/raw/snpp/control_totals_inputs

# 3. Base: Wales, April 2023 geography, suppressed areas (new file names; the held v8.0 base is never overwritten)
node scripts/model/build_single_year_base.mjs --include-wales --geography 2023 --fallback rm032 \
  --out data/model/base_single_year_2021_v81.json --out-12 data/model/base_single_year_2021_v81_12group.json

# 4. Control totals and the 3596 sensitivity series
node scripts/model/build_control_totals.mjs

# 5. Checks: the v8.0 regression, the control totals against their sources, the base and the successor lookup
npx vitest run tests/hp-regression.test.mjs tests/control-totals.test.mjs tests/base-builder.test.mjs tests/lad11-successors.test.mjs

# 6. Forward model, to scratch
mkdir -p /tmp/v81
node scripts/model/run_hp_single_year.mjs \
  --base data/model/base_single_year_2021_v81.json --countries-2011 E,W --successors-2011 on \
  --control-totals data/model/control_totals_v81.json --cap-mode age-sex \
  --model-version 8.1 --output /tmp/v81/ethnic-projections.json

# 7. Sensitivity line (raw output, not for the site file)
node scripts/model/run_hp_single_year.mjs \
  --base data/model/base_single_year_2021_v81.json --countries-2011 E,W --successors-2011 on \
  --control-totals data/model/control_totals_3596.json --cap-mode age-sex \
  --format raw --output /tmp/v81/sensitivity-3596.json

# 8. All-persons check for the economy model (raw output only)
node scripts/model/run_hp_single_year.mjs --groups all-persons --snpp-cap off \
  --base data/model/base_single_year_2021_v81.json --countries-2011 E,W --successors-2011 on \
  --output /tmp/v81/all-persons.json
```

```
# 2.1 School Census check on the v8.1 base (after the 2025/26 refresh), to scratch
node scripts/model/validate_schools.mjs --base data/model/base_single_year_2021_v81.json --output /tmp/v81/school-validation.json
#     then give step 6 --school-validation /tmp/v81/school-validation.json

# 9. Zero-noise check on the v8.1 options, then the stochastic run into the step 6 output
node scripts/model/run_hp_single_year.mjs <step 6 options> --format raw --output /tmp/v81/det-raw.json
node scripts/model/run_stochastic_hp.mjs <step 6 options> --simulations 1 --noise off --format raw --output /tmp/v81/zero-noise.json
#     (compare: every firstSimulation count must equal det-raw's; tests/stochastic-zero-noise.test.mjs shows how)
node scripts/model/run_stochastic_hp.mjs <step 6 options> --site-input /tmp/v81/ethnic-projections.json

# 10. Out-of-sample test with the new coverage (raw output to scratch; publish only after review)
node scripts/model/validate_out_of_sample.mjs --countries E,W --successors on \
  --actual data/model/base_single_year_2021_v81.json --json > /tmp/v81/out-of-sample.json
```

Then the enrichment steps in `RUN_ORDER.md` order. Each run writes a record of its options and input hashes beside its output (`<output>.run.json`); keep it with the PR.

## Sources

- ONS (2026a) Population estimates for England and Wales: mid-2025, `mye25tablesew.xlsx`, tables MYE2. Published 29 July 2026. Held copy sha256 `85b4e105...`.
- ONS (2026b) Estimates of the population for England and Wales, mid-2011 to mid-2025 detailed time series, `myebtablesenglandwales20112025.xlsx`, table MYEB1. Published 29 July 2026. Fetched 12 October 2026, sha256 `d0306f38...`.
- ONS (2025) Subnational population projections for England: 2022-based, migration category variant, `2022snpppopulationsyoamigcat.zip`. Published 24 June 2025. sha256 `66d84d0e...`.
- ONS (2026c) National population projections: 2024-based, England, machine-readable files, `en1.zip` (principal: `en_ppp_machine_readable.xlsx`, sheet Population). Published 28 April 2026. Fetched 12 October 2026, sha256 `13637064...`.
- ONS (2026d) User requested data 3596, `rescaledpop2025to2050.xlsx`. Published 27 August 2026. Fetched 12 October 2026, sha256 `0f564389...`.
- ONS (2026e) Quarterly update on population and migration statistics: August 2026, section 3. Published 11 August 2026.
- Welsh Government (2025) 2022-based population projections by local authority, age, sex, year and variant, StatsWales dataset `036507d7-6671-4885-b2b4-af7f01e9ed5b`. First published 20 November 2025. Fetched through the StatsWales API on 12 October 2026, sha256 `3f4758fc...`.
- ONS (n.d.) Census 2001 ST101: sex and age by ethnic group, on 2011 local authority geography (Nomis NM_1869_1, TYPE464). Held copy sha256 `73780646...`, obtained 13 August 2026 (`data/model/INPUTS.json`).
- ONS (n.d.) Census 2011 DC2101EW: ethnic group by sex by age, local authorities. Held copy sha256 `9ec6fb02...`, obtained April 2026 (`data/model/INPUTS.json`).
- Hauer, M.E. (2019) "Population projections for U.S. counties by age, sex, and race controlled to shared socioeconomic pathway", Scientific Data, 6, 190005.
