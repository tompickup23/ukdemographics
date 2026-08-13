# Data currency and model integrity audit, 13 August 2026

Scope: every file in `src/data/live/`, the Hamilton-Perry projection code in
`scripts/model/`, and the model claims published on `/methodology/` and the
place pages.

## Part 1: model integrity

Five problems, in severity order. The first three are visible to readers today.

### 1. Residual categories diverge at long horizons (published, wrong)

Cohort change ratios compound with no envelope on individual ethnic groups, so
the residual Other category runs away in high-diversity urban areas. 92
area-year projections put Other above 25% of the population against a 2021 base
below 13%:

| Area | Other 2021 | Other 2051 | Other 2061 |
|---|---:|---:|---:|
| Enfield | 12.1% | 67.1% | 82.5% |
| Harrow | 7.2% | 57.9% | 76.9% |
| Haringey | 9.7% | 54.2% | 72.2% |
| Barnet | 9.8% | 51.6% | 69.4% |
| Merton | 4.6% | 47.6% | 70.2% |
| Luton | 3.5% | 41.1% | 66.1% |

These are live. `https://ukdemographics.co.uk/places/enfield/` currently
publishes Other at 67% by 2051 and 82% by 2061.

Mechanism: the CCR clamp is `[0.05, 5.0]`. A ceiling of 5.0 lets a group
quintuple in one ten-year step, which compounds to 625x over four steps. On a
small 2011 base that is enough to take a residual category to a plurality. The
corresponding output is that 13 areas project White British below 5% by 2061 and
37 below 10%.

The fix is a per-group envelope or a damped CCR at long horizons. It requires
re-running the model, which is currently not possible (see item 5).

### 2. Confidence bands do not contain the projections they annotate (published, wrong)

`stochastic` (from `run_stochastic_hp.mjs`) and `projections` (from
`run_hp_single_year.mjs`) are separate jobs that were not run against the same
model version. The published point estimate falls outside its own band in:

- **71%** of area-years for the 80% band (672 of 942), which is the band drawn on place pages
- **59%** for the 95% band (556 of 942)

Worst cases:

| Area | Year | Published line | 80/95% band |
|---|---|---:|---|
| Isles of Scilly | 2051 | 71.7% | 0.8% to 4.0% |
| Torridge | 2051 | 70.1% | 87.3% to 92.0% |
| Northumberland | 2051 | 70.9% | 87.2% to 90.7% |
| City of London | 2051 | 19.9% | 1.7% to 5.1% |

Every rural place page was showing a shaded band sitting well above its own
White British line. Mitigated in this branch: `src/pages/places/[slug].astro`
now draws the band only where it brackets the line. The underlying mismatch
still needs both jobs re-run together.

### 3. The backcast error is systematic bias, not scatter (published claim incomplete)

`/methodology/` reported MAE 1.71pp and left it there. Recomputed from
`model-validation.json`:

| Model | MAE | Mean signed error | Over-predicts White British |
|---|---:|---:|---:|
| HP local CCRs | 1.71pp | **+1.70pp** | **268 of 269** |
| HP national baseline | 2.32pp | +2.09pp | 244 of 269 |
| NEWETHPOP | 2.58pp | +2.43pp | 244 of 269 |

Mean bias equals MAE to two decimal places. Essentially all of the error is
one-directional: the model was too slow by 1.7pp of White British share over one
decade, and a 2051 projection runs that step three more times. The
`confidenceIntervals` block in `model-validation.json` is built from this
one-sided distribution (p2.5 = +0.55, p97.5 = +3.57) yet is labelled "Apply to
forward projections as +/- uncertainty". It is not a symmetric interval.

Two contributors identified in code:

- **Brexit damp applied inside the backcast.** `validate_backcast.mjs` cut White
  Other CCR growth by 15% before backcasting 2011 to 2021. That window already
  contains the referendum and the end of free movement, so the observed CCR
  already reflects it. Damping a second time guarantees White Other is
  under-projected and White British over-projected. Now off by default behind
  `BREXIT_DAMP_IN_BACKCAST=1`.
- **Small-count freeze.** Where a 2011 cell holds five people or fewer, the CCR
  is set to 1.0, freezing that group. In 2011 many minority groups in rural and
  semi-rural LAs sat below that threshold, so they are held flat while White
  British moves. Not yet changed; it needs a considered replacement rather than
  a threshold tweak.

### 4. Male births were driven by the previous step's women (code bug, now fixed)

In both `run_hp_single_year.mjs:471` and `validate_backcast.mjs`, births were
computed inside the `for (const sex of SEXES)` loop with `SEXES = ["M", "F"]`:

```js
women += newPop[eth]?.F?.[age] || currentPop[eth]?.F?.[age] || 0;
```

On the "M" pass `newPop[eth].F` does not exist yet, so the expression falls
through to `currentPop`, the **previous step's** female population. Male births
were therefore sized off women one full projection step behind, while female
births used the correct projected women. For any growing group that understates
male births at every step; for a flat or shrinking group it does not. The
direction of the resulting bias is toward a higher White British share, matching
the observed backcast bias.

Fixed in this branch by splitting each step into two passes: advance all
cohorts for both sexes, then compute births from the projected women.

The `|| 0` fallback also fired whenever a projected cell was legitimately zero,
silently substituting the previous step's count. Removed by the same change.

### 5. The model cannot be re-run (blocks every fix above)

`data/model/` and `data/raw/newethpop/`, `data/raw/snpp/`,
`data/raw/census_2011_ethnicity_age/` are gitignored and are **not present on
disk**. All four model inputs are missing:

```
MISS data/model/base_single_year_2021.json
MISS data/raw/census_2011_ethnicity_age/dc2101ew_ethnicity_sex_age_la.csv
MISS data/raw/newethpop/.../Population2011_LEEDS2.csv
MISS data/raw/newethpop/.../Population2021_LEEDS2.csv
MISS data/raw/snpp/2022 SNPP Population persons.csv
```

So the published projections cannot be regenerated, corrected or independently
verified from this repository. Recovering these is the prerequisite for fixing
items 1 to 3. The ONS custom dataset and SNPP are re-fetchable; NEWETHPOP comes
from the Leeds archive.

### Also noted, not defects

- `scenarioRange2051.central` holds the cohort-component value, not the
  Hamilton-Perry headline, in 318 of 320 areas. Not rendered anywhere, so no
  reader sees it, but it is a trap for anyone reading the JSON directly.
- Median two-model spread is 7.70pp and 46 areas exceed 20pp (max 41.7pp). The
  methodology page's "approximately 8 percentage points" and "largest spreads
  exceed 20pp" both check out.
- The forward model's header comment says the CWR uses children aged 0 to 4; the
  code uses 0 to 9. Comment is wrong, code is self-consistent.
- 2061 is projected for 271 of 320 areas, so national 2061 aggregates cover a
  subset. The homepage already computes a coverage percentage.

## Part 2: data currency

Checked against upstream as at 13 August 2026.

### Current, no action

| File | Vintage | Status |
|---|---|---|
| `ethnic-projections.json` SNPP envelope | ONS SNPP 2022-based | Latest. Released 24 Jun 2025, no newer set. |
| `ons-ltim.json` | YE Dec 2025, pub 21 May 2026 | Latest. LTIM is twice yearly. |
| `visa-routes.json`, `citizenship.json`, `education-visas.json`, `eu-settlement-scheme.json`, `work-visas-by-occupation.json`, `asylum-grant-rates.json`, `asylum-bridge.json` | Home Office YE Mar 2026, pub 21 May 2026 | Latest. Next quarterly release due around 21 Aug 2026. |
| Census 2021 direct layer (TS029, RM043, RM134, RM021, RM192, TS012) | Census 2021 | Fixed source. |
| `stop-and-search.json` | Refreshed 24 Jul 2026 | Current, weekly workflow. |

### Stale, newer release exists

| File | Site vintage | Available now | Note |
|---|---|---|---|
| `school-eal.json`, `school-eal-district.json`, `school-pressure.json`, `school-validation.json`, `school-fertility-proxy.json` | DfE 2024/25 | **2025/26**, Jan 2026 census | Also feeds the model's DfE calibration and the only out-of-sample validation. |
| `send-dashboard.json` | DfE SEN 2024/25 | **2025/26**, pub 11 Jun 2026 | 1.8m pupils with SEN, up 5.2%; EHC plans 538,547. |
| `crime-dashboard.json`, `crime-correlation.json`, `nino-crime-correlation.json` | YE Mar 2024 | **YE Mar 2026** | Two years behind. |
| `payroll-by-nationality.json`, `payroll-by-region-industry.json` | HMRC RTI to Dec 2024 | **to Dec 2025**, pub Apr 2026 | |
| `tb-notifications.json` | UKHSA 2025 report, data to end-2024 | **2025 data**: 5,424 notifications, rate 9.4 per 100k | Editorially significant. The site's headline is "+13.0% in 2024"; 2025 was flat at -1.1%, so the current page tells readers TB is surging when the latest year is not. |
| `births-by-mother-cob.json`, `births-history-national.json` | 2024 births | **2025**, pub 27 May 2026 (40.2% of births with one or both parents non-UK-born) | The standalone "Births by parents' country of birth" publication was discontinued on 1 Jul 2025 and folded into "Births in England and Wales". The source string needs updating as well as the data. |

### Not yet checked, likely stale

`nino-*.json` (rolling year ending Q4 2025), `pip-pcon.json`, `asc-dashboard.json`
(ASCFR/SALT 2023-24), `fno-bridge.json` (MoJ Jul-Sep 2025),
`council-tax-spd.json` (CTB 2024), `companies-house-psc-nationality.json`
(Apr 2026 snapshot), `place-boundaries.json` (LAD May 2024, while the PCON
crosswalk already uses LAD25), `mp-directory.json` (Apr 2026).

The DWP ones need a Stat-Xplore key and were not reachable in this pass.

## Guard script

`npm run validate:projections` checks the published
`ethnic-projections.json` for all of the above without needing the model inputs:
group shares summing to 100, residual-category runaway, point estimates outside
their own stochastic band, headline/scenario model agreement, and 2061 coverage.

Current output: **1,089 problems across 4 checks**. It exits non-zero, so it is
not wired into CI until the underlying data is fixed.
