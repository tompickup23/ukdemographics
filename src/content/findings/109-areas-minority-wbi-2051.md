---
headline: "56 local authorities projected minority White British by 2051"
date: "2026-04-14"
updated: "2026-08-13"
category: demographics
stat_value: "56"
stat_label: "Areas WBI <50% by 2051"
verdict: alert
source_url: "https://www.ons.gov.uk/census"
source_label: "Census 2021 + Hamilton-Perry v7.0 projection model"
summary: "56 English local authorities are projected to have a White British population below 50% by 2051, counting only the areas where the model is still projecting rather than diverging. 44 of those have a White British majority today. This is not a London story: Bolton, Liverpool, Milton Keynes, Leeds and Derby all cross the threshold. Corrected 13 August 2026 from an earlier count of 109."
---

> **Correction, 13 August 2026.** This piece originally said 109 areas, and cited
> the model's backcast score as validation. Both were wrong. A model audit found
> that many of those 109 rested on projections where a group had run away rather
> than been forecast, and those years are no longer published. On the areas the
> model still projects soundly the count is **56**, not 109, and the
> currently-majority subset is **44**, not 76. The backcast figure quoted below
> has been removed: it measured the model's own guardrails, not its accuracy. The
> full audit is in the repository at `docs/data-currency-audit-2026-08-13.md`.

**56 councils. Minority White British by 2051.**

64 by 2041. 56 by 2051. The 2041 count is higher because more areas are still projecting soundly at that horizon. These are not forecasts. They are Hamilton-Perry
projections extrapolating Census 2011-to-2021 cohort change ratios forward,
constrained by ONS population projections. They carry a known bias toward
overstating the White British share, so they are more likely to be slow than
fast. See the [methodology](/methodology/) for what that bias is and where it
comes from.

Of the 56, **44 have a White British majority today.** They cross the threshold
within a generation.

The ten fastest transformations among current-majority areas:

| Area | WBI 2021 | WBI 2051 | Change |
|------|---------|---------|--------|
| Bolton | 68.8% | 19.5% | -49.2pp |
| Liverpool | 77.3% | 34.2% | -43.1pp |
| Bromley | 66.5% | 25.1% | -41.4pp |
| Hertsmere | 63.1% | 22.3% | -40.8pp |
| Milton Keynes | 62.2% | 21.7% | -40.5pp |
| Wokingham | 72.7% | 32.6% | -40.1pp |
| Leeds | 73.4% | 33.3% | -40.1pp |
| Southampton | 68.1% | 28.8% | -39.3pp |
| Trafford | 72.1% | 33.0% | -39.2pp |
| Derby | 66.2% | 28.2% | -38.1pp |

Bolton. 68.8% White British today. Projected 19.5% by 2051. That is a 49
percentage point decline in 30 years.

This is not a London story. Bolton, Liverpool, Milton Keynes, Leeds, Southampton,
Trafford, Derby, Wokingham. Towns and cities across England.

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

**Why some areas are missing from this count.** The model compounds cohort change
ratios with no envelope on any individual ethnic group, and in 108 of the 320
areas that produces a group growing to an implausible share. Enfield's "Other"
reaches 67% by 2051 and 82% by 2061 from a 2021 base of 12%; Barnsley's White
Other goes from 4.3% to 45.3%, a factor of ten. That is arithmetic, not
demography. Those years are withheld across the site rather than published, so
the affected areas do not appear in the 56 even where their White British
trajectory alone might have looked reasonable. Excluding them makes this count
conservative: the true number of areas crossing the threshold is very likely
higher than 56, not lower.

The data is on every place page on this site. Search your area.

**Source:** Census 2021 custom dataset (20 ethnic groups, direct observations).
Hamilton-Perry v7.0 single-year CCR model, Census 2011 DC2101EW base. SNPP
2022-based envelope constraint. Counts computed on the areas whose projections
pass the site's divergence guard.
