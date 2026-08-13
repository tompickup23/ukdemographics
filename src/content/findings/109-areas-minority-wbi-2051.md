---
headline: "87 local authorities projected minority White British by 2051"
date: "2026-04-14"
updated: "2026-08-13"
category: demographics
stat_value: "87"
stat_label: "Areas WBI <50% by 2051"
verdict: alert
source_url: "https://www.ons.gov.uk/census"
source_label: "Census 2021 + Hamilton-Perry v8.0 projection model"
summary: "87 English local authorities are projected to have a White British population below 50% by 2051. 58 of those have a White British majority today. This is not a London story: Bolton, Pendle, Oldham, Thurrock and Broxbourne all cross the threshold. Recomputed 13 August 2026 on a model recalibrated against an out-of-sample test, replacing an earlier count of 109."
---

> **Correction, 13 August 2026.** This piece originally said 109 areas and cited
> the model's backcast score as validation. Both were wrong. The backcast fitted
> its ratios on the same two Censuses it was tested against, so it measured the
> model's own guardrails rather than its accuracy, and those guardrails were
> letting projections compound into arithmetic rather than demography.
>
> The model has since been recalibrated against a genuine out-of-sample test that
> fits on Census 2001 to 2011 and forecasts 2021, scored on the actual Census
> 2021. That test showed the old settings were projecting change **too fast**, not
> too slow as previously stated here. On the recalibrated model the count is
> **87**, and the currently-majority subset is **58**, not 76. See the
> [methodology](/methodology/) for the test and the numbers.

**87 councils. Minority White British by 2051.**

67 by 2041. 87 by 2051. These are not forecasts. They are Hamilton-Perry
projections extrapolating Census 2011-to-2021 cohort change ratios forward,
constrained by ONS population projections. On the out-of-sample test the model is
close to unbiased, with a mean error of +0.03 percentage points on the White
British share and a mean absolute error of 1.53pp per decade. Read the numbers
with that error attached rather than as point estimates.

Of the 87, **58 have a White British majority today.** They cross the threshold
within a generation.

The ten fastest transformations among current-majority areas:

| Area | WBI 2021 | WBI 2051 | Change |
|------|---------|---------|--------|
| Havering | 66.5% | 25.6% | -40.9pp |
| Bolton | 68.8% | 27.9% | -40.8pp |
| Pendle | 66.1% | 29.0% | -37.2pp |
| Thurrock | 66.2% | 30.1% | -36.1pp |
| Bexley | 64.5% | 29.0% | -35.4pp |
| Oldham | 65.2% | 30.4% | -34.8pp |
| Broxbourne | 68.6% | 33.9% | -34.7pp |
| Sandwell | 52.1% | 18.2% | -33.8pp |
| Dartford | 67.3% | 34.1% | -33.1pp |
| Sutton | 57.3% | 24.8% | -32.5pp |

Havering. 66.5% White British today. Projected 25.6% by 2051. That is a 41
percentage point decline in 30 years. In outer east London.

This is not a London story. Bolton, Pendle, Oldham, Thurrock, Broxbourne,
Sandwell, Dartford. Towns across England.

**Already below 50% in 2021 (33 areas):** Birmingham (42.9%), Leicester (33.2%),
Luton (31.8%), Slough (24.0%), Newham (14.8%), Brent (15.2%). These areas passed
the threshold years ago.

**The national picture.** England and Wales White British share: 74.4% (Census
2021, ONS TS021). Across the 320 areas the HP model covers, the pop-weighted 2021
share is 74.5%, falling to 52.1% by 2051. The cohort-component model, which
assumes ethnic fertility rates converge halfway to the national mean, projects
52.7% for 2051. Both put the national share near 50% in the early 2050s.

Three things drive it. Fertility: White British TFR 1.31, below replacement. Age
structure: the White British population is older, dying faster than it replaces
itself. Migration: selective out-migration of White British to surrounding areas,
combined with international in-migration to cities.

**Why a handful of areas are still missing from this count.** Cohort change ratios
compound, and with the old growth ceiling of 5.0 a group could quintuple in a
decade, which is 625 times over four steps. That produced projections that were
arithmetic rather than demographic in 108 areas: Enfield's "Other" category
reached 67% by 2051, Barnsley's White Other went from 4.3% to 45.3%. The ceiling
of 1.6 selected on the out-of-sample test cuts that to 14 areas, whose remaining
diverged years are still withheld. Those 14 do not appear in the 87.

The data is on every place page on this site. Search your area.

**Source:** Census 2021 custom dataset (20 ethnic groups, direct observations).
Hamilton-Perry v8.0 single-year CCR model, Census 2011 DC2101EW base, SNPP
2022-based envelope. Ratios shrunk toward the national ratio by cell size and
capped at 1.6 growth per decade, both selected on an out-of-sample test fitting
2001 to 2011 and forecasting 2021 (MAE 1.53pp, bias +0.03pp across 285 areas).
