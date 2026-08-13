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

### 5. The published backcast MAE does not measure predictive accuracy

This is the sharpest finding, and it was only reachable once the model could be
re-run.

The four model inputs are absent from this repository (`data/model/` and
`data/raw/{newethpop,snpp,census_2011_ethnicity_age}/` are gitignored and not on
disk) but they exist in the sibling `~/asylumstats/` checkout, which is the
hardcoded cross-repo dependency noted in `CLAUDE.md`. Symlinking them in makes
the backcast runnable.

Re-running with the two code fixes in this branch:

| Run | MAE | Mean bias | Over-predicts WB |
|---|---:|---:|---:|
| Published v7.0 | 1.71pp | +1.70pp | 268 of 269 |
| With births fix and no Brexit damp | **1.24pp** | **+1.23pp** | 268 of 269 |

So the fixes remove 28% of the bias. But it stays one-sided in 268 of 269 areas,
so something else is driving it. Sweeping the two CCR guardrails isolates it:

| CCR ceiling | Min 2011 base | MAE | Mean bias |
|---:|---:|---:|---:|
| 5.0 | 5 (as published) | 1.24pp | +1.23pp |
| 20.0 | 5 | 1.11pp | +1.11pp |
| 5.0 | 0 | 0.49pp | +0.47pp |
| 20.0 | 0 | **0.16pp** | **+0.16pp** |
| 1000.0 | 0 | 0.14pp | +0.14pp |

Removing the small-base freeze alone takes the bias from +1.23pp to +0.47pp.
Removing both guardrails takes the backcast to essentially zero error.

Two conclusions follow.

**The guardrails are the entire error.** Instrumenting the run shows 557,013
cells frozen at CCR 1.0 because their 2011 base held five people or fewer,
covering **1,174,312 people** of 2021 population, plus 3,215 cells clipped by the
5.0 ceiling. Both truncate in the same direction, because the cells sitting below
a five-person 2011 base or growing more than fivefold in a decade are
overwhelmingly minority groups growing from a thin base. Freezing and clipping
them holds diversity down and pushes the White British share up, in every area,
which is why the error is one-directional in 268 of 269 areas.

**The published head-to-head with NEWETHPOP is not a like-for-like comparison.**
Once the guardrails are off the backcast reproduces Census 2021 to within 0.14pp,
because the CCRs are literally `pop21 / pop11` applied back to `pop11`. The
backcast was never measuring predictive skill; it was measuring how much the
model's own guardrails distort a circular fit. NEWETHPOP's 2.58pp, by contrast,
is a genuine out-of-sample forecast error from a 2011 base. Reporting "MAE 1.71pp
beats NEWETHPOP 2.58pp by 33%" sets a truncation artefact against a real forecast
error and states the result in the model's own favour.

The forward-projection consequence is the part that matters for readers: the
guardrails impose roughly **1.2 percentage points of understated diversity growth
per decade**, compounding across three decades to 2051.

The principled fix is to fall back to the population-weighted national CCR for
thin cells rather than freezing them at 1.0, and to replace the hard ceiling with
a damped taper. Both need the forward model re-run and revalidated against
something genuinely out of sample, so neither is applied in this branch.

`validate_backcast.mjs` now takes `CCR_CEILING`, `CCR_FLOOR` and `CCR_MIN_BASE`
from the environment so this sweep is reproducible, and reports the truncated and
frozen cell counts on every run.

**`src/data/live/model-validation.json` is deliberately left at its published
values.** The re-run numbers describe fixed code; the live projections were
generated by the unfixed code. Publishing a 1.24pp validation next to projections
built at 1.71pp would repeat exactly the mismatch described in item 2. Both files
should be regenerated together when the forward model is next run.

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

## Part 2b: what happens when the forward model is actually re-run

The inputs live in `~/asylumstats/data/`, so the forward model can be run after
all. `run_hp_single_year.mjs` now takes `HP_OUTPUT` so a candidate can be
generated without touching what the site serves.

### The code fixes move every published number

Re-running with the births fix in place changes **1,073 year-cells**. The 2051
White British share falls by a mean of 1.06pp (median 0.87pp), by up to 4.13pp in
Telford and Wrekin, and in no area does it rise by more than 0.13pp. That is the
expected direction: the bug lagged male births by a full projection step, which
suppressed growing groups, so correcting it lowers the White British share
everywhere. The bug was real and it was material.

### But the fixes make the runaway worse, not better

| | published | after the code fixes |
|---|---:|---:|
| "Other" runaway area-years | 92 | **101** |
| Enfield "Other" 2051 | 67.1% | 69.2% |
| Enfield "Other" 2061 | 82.5% | 84.1% |
| areas with White British below 5% by 2061 | 13 | 17 |

So the runaway is not a symptom of the births bug. It is the CCR compounding and
the guardrails, as diagnosed. **Fixing the code is not sufficient to publish.**

### The principled guardrail replacement does not settle it either

`run_hp_single_year.mjs` now implements empirical-Bayes shrinkage toward the
national CCR behind `CCR_SHRINKAGE=1`, tuned by `CCR_SHRINK_K`:

```
ccr = (n11 * ccr_local + K * ccr_national) / (n11 + K)
```

One rule replaces both guardrails: trust a local ratio in proportion to how much
data it rests on. A cell with thousands of people keeps its own ratio; a cell with
two people borrows the national rate for its group, age and sex instead of being
frozen at 1.0. It is a better-motivated rule than either a hard ceiling or a
five-person cliff.

It does not behave the way I expected:

| Run | runaway area-years | max "Other" | median WB 2051 | national WB 2051 |
|---|---:|---:|---:|---:|
| published | 92 | 82.5% | 67.9% | n/a |
| code fixes only | 101 | 84.1% | 67.1% | 49.1% |
| shrinkage K=5 | 195 | 86.6% | 56.2% | 41.9% |
| shrinkage K=10 | 181 | 83.5% | 56.3% | 43.0% |
| shrinkage K=25 | 164 | 75.9% | 57.5% | 44.5% |

Shrinkage tames the worst individual trajectories (Enfield's 2061 "Other" falls
from 84.1% to 75.2%, and the site-wide maximum falls at K=25) but it raises the
runaway count sharply, because un-freezing 557,013 thin cells lets moderate
minority growth appear in far more areas at once. Some of that count increase is
an artefact of the threshold used to define a runaway rather than worse behaviour.

The part that matters is the size of the disagreement. National White British in
2051 is 49.1% under the corrected default and 41.9% to 44.5% under shrinkage. The
median area moves by about 11 percentage points. **These are not refinements of
each other, they are different answers**, and the choice between them changes the
headline finding of the site.

### Which is why this stops here

There is no way to choose between them with what is on hand. The backcast is
circular, so it cannot referee: with the guardrails off it reproduces Census 2021
to 0.14pp by construction. The DfE school data is already an input to the forward
model through the calibration step, so it is not out-of-sample either.

Shrinkage is therefore shipped **off by default and inert when off** (verified:
the default output is byte-identical to a run from before the shrinkage code
existed). It is not a recommendation. Choosing between these requires a genuine
out-of-sample test, which most plausibly means holding back a data source the
model has never seen, or waiting for a mid-decade estimate to score against.

## Part 3: presentation sweep

Applied against `.claude/rules/dataviz.md` and `.claude/rules/presentation.md`
(profile `sister-site`: job "believe", neutral register, `anger_budget: none`,
no out-group, no moral-emotional language).

The governing constraint came from the presentation rules themselves: *if a claim
is not triple-checked, then no fluency technique may be applied to it.* Repetition
and confident presentation raise perceived truth for false claims exactly as much
as for true ones, so with the projections in the state described above, the right
move was not to make them more persuasive. It was to make their status
unmistakable and to fix what was actively misleading.

### Fixed

**A false provenance claim in the hero, on 52 pages.** The stored headline trend
carried a model-version tag, and three different tags are in the data across the
320 areas. 266 areas say "20-group HP, Census-direct, SNPP-constrained", 2 say
"single-year HP, SNPP-constrained", and 52 say **"v2, SNPP-constrained,
bias-corrected"**. That last one is wrong twice over: the published model is v7.0,
and the backcast over-predicts the White British share in 268 of 269 areas, so the
figure is the opposite of bias-corrected. The page now derives its label and drops
the parenthetical rather than echoing it, and expands the "WBI" abbreviation.

**Red encoding on the White British projection.** The three key-metric cards were
the same measure at three dates, but escalated indigo to cyan to coral, and the
delta badge used `swing-down`, which is styled with `--status-bad-text`. A falling
White British share was therefore rendered in alarm red on a site whose stated
register is neutral, and red/green-only encoding fails the colour-vision rule as
well. All three cards now share one accent, because colour should identify the
entity rather than rate it, and the projected ones carry a "Projected" chip
instead. The delta badge takes a new `neutral` direction. Those three cards were
the only valenced badges on the whole site.

**Modelled data looked exactly like observed data.** The projection chart drew
2011 and 2021 Census points and the 2031 to 2061 model output as one continuous
line of identical weight. Census is now solid and projected is dashed, with a
worded key underneath, so a reader can see where the record stops and the model
starts without reading a caption.

**No chart carried a source line**, against the rule that every public chart does.
The three projection charts now take a `source` prop and render it as a
figcaption. `aria-label` was just the chart title; it now follows the chart type,
data, takeaway formula.

**No route to the values except reading the chart.** A `Show the figures` table
twin now sits under each projection chart, with modelled years marked, for the
roughly one third of readers with low graph literacy.

**Every minimap on the site was a solid coloured square.** See below.

**Duplicated breadcrumb.** `Breadcrumbs.astro` renders its own Home item and two
callers passed another, so every place page and region page read
"Home / Home / Places / ...".

### The minimap bug

`data/geography/*.geojson` rings are wound the opposite way to what d3-geo wants.
d3-geo works in spherical geometry, where a ring wound the wrong way is not the
same polygon drawn backwards, it is the complement: everything on the globe except
that shape. `geoArea(Torridge)` returned 12.566 steradians, which is 4*pi, the
whole sphere, and `geoBounds` returned `[-180, -90, 180, 90]` for all 1,011
features across the LAD and PCON files.

Downstream that made the focal bbox the whole world, so `fitExtent` squeezed the
globe into a 260x170 thumbnail, every boundary collapsed to a sub-pixel speck, all
360 other features "intersected" the focal bbox, and each one painted the clipped
sphere as a full-canvas rectangle. Every place page and every constituency page,
roughly 950 pages, rendered a solid accent-coloured square where the location map
should be.

Fixed by rewinding rings at load time, and separately by rewinding the synthetic
bbox rectangle handed to `fitExtent`, which had the same defect and kept the map
collapsed even after the source data was corrected. Verified: `geoArea(Torridge)`
= 0.000024 sr, and the focal path now spans 79 to 181 in a 260-unit viewBox
instead of 127.9 to 128.2.

### Not changed, and why

The confidence-band guard was replaced with `consistentBandSeries` ported verbatim
from the sister site, which had already solved this problem. It drops only the
years that disagree rather than the whole band, so a coherent year keeps its
interval. Both sites publish the same model run, so the ported tests apply here
unchanged: Burnley's 2051 line of 43.1 against a band of 46.4 to 50.8 is live on
both.

The empty right-hand space in the place-page header is cosmetic and would need a
layout change rather than a rule fix, so it is left alone.

## Guard script

`npm run validate:projections` checks the published
`ethnic-projections.json` for all of the above without needing the model inputs:
group shares summing to 100, residual-category runaway, point estimates outside
their own stochastic band, headline/scenario model agreement, and 2061 coverage.

Current output: **1,089 problems across 4 checks**. It exits non-zero, so it is
not wired into CI until the underlying data is fixed.
