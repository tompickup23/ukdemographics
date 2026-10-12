# Model v8.1: readiness

Written 12 October 2026, at the end of the preparation for phase 3 of the UKD refresh plan (Reports repo, `UKD_Data_Refresh_Plan_2026-10-11.md`, decisions D3 to D6, delegated by Tom on 12 October). Nothing in this document has been published and no live data file has changed. v8.0 (13 and 14 August 2026) is still what the site shows.

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
2. **The stochastic run has none of the new options.** `run_stochastic_hp.mjs` still reads the v8.0 base, the SNPP CSV and England only. Run as it is, its bands would describe a different model from the projection (the defect fixed in August, audit Part 2d item 11). It needs the same options, through `lib/hp-options.mjs`, and the zero-noise check (one simulation with the noise off must reproduce the deterministic run) before v8.1.
3. **The out-of-sample test covers 285 areas with unchanged codes.** `validate_out_of_sample.mjs` reads ST101 (2001) and DC2101EW on 2011 geography, so Wales, the successor areas and the 2023 unitaries are not scored. The test must be extended (the successor lookup applies to the 2011 side; 2001 needs the same treatment) and published before any forward view (economy plan s8 rule 7).
4. **`validate_schools.mjs` reads the v8.0 base by a fixed path.** It needs a `--base` option so School Census calibration covers the new areas. The School Census 2025/26 refresh should land first, so v8.1 calibrates on 2025/26, not 2024/25.
5. **The methodology string.** `run_hp_single_year.mjs` writes the v8.0 methodology text. A non-default run prints a warning. Before publishing, the text must describe the control totals, the cap mode, Wales, the 16 estimated bases and the extrapolation, with sources; `--model-version` sets the version.
6. **Cap mode.** Choose `--cap-mode age-sex` (one factor per area, sex, single year and year; ethnic shares kept within each cell, as C s1.3 recommends after Hauer 2019) or `total` (v8.0's single factor per area and year). In a scratch age-sex run, 16 area-sex-age-year cells had a positive control total and no modelled person; they are counted and left empty.
7. **Downstream.** Everything after step 3 of `RUN_ORDER.md`, the derived files, findings reconciliation (PR 63 pattern), the Asylum Stats sync (refresh plan B s1) and the dated corrections. The 49 legacy areas' place pages change, so that PR is a draft "(merge after 1 Nov)" with a fact-check.

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

Then, once blockers 2 to 5 are fixed: the stochastic run, the out-of-sample test, and the enrichment steps in `RUN_ORDER.md` order. Each run writes a record of its options and input hashes beside its output (`<output>.run.json`); keep it with the PR.

## Sources

- ONS (2026a) Population estimates for England and Wales: mid-2025, `mye25tablesew.xlsx`, tables MYE2. Published 29 July 2026. Held copy sha256 `85b4e105...`.
- ONS (2026b) Estimates of the population for England and Wales, mid-2011 to mid-2025 detailed time series, `myebtablesenglandwales20112025.xlsx`, table MYEB1. Published 29 July 2026. Fetched 12 October 2026, sha256 `d0306f38...`.
- ONS (2025) Subnational population projections for England: 2022-based, migration category variant, `2022snpppopulationsyoamigcat.zip`. Published 24 June 2025. sha256 `66d84d0e...`.
- ONS (2026c) National population projections: 2024-based, England, machine-readable files, `en1.zip` (principal: `en_ppp_machine_readable.xlsx`, sheet Population). Published 28 April 2026. Fetched 12 October 2026, sha256 `13637064...`.
- ONS (2026d) User requested data 3596, `rescaledpop2025to2050.xlsx`. Published 27 August 2026. Fetched 12 October 2026, sha256 `0f564389...`.
- ONS (2026e) Quarterly update on population and migration statistics: August 2026, section 3. Published 11 August 2026.
- Welsh Government (2025) 2022-based population projections by local authority, age, sex, year and variant, StatsWales dataset `036507d7-6671-4885-b2b4-af7f01e9ed5b`. First published 20 November 2025. Fetched through the StatsWales API on 12 October 2026, sha256 `3f4758fc...`.
- Hauer, M.E. (2019) "Population projections for U.S. counties by age, sex, and race controlled to shared socioeconomic pathway", Scientific Data, 6, 190005.
