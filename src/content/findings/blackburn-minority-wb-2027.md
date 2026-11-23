---
headline: "Blackburn projected minority White British by 2031. Three more Lancashire towns follow by 2051."
date: "2026-04-14"
updated: "2026-11-23"
model_version: "v8.0"
category: demographics
stat_value: "2031"
stat_label: "Blackburn WBI <50% by"
verdict: alert
source_url: "https://www.ons.gov.uk/census"
source_label: "Census 2021 + Hamilton-Perry v8.0"
summary: "Blackburn with Darwen: 56.9% White British in Census 2021. Projected below 50% between 2021 and 2031. Pendle and Preston follow between 2031 and 2041, Burnley between 2041 and 2051. Four Lancashire towns crossing the same threshold within a generation."
---

> **Correction, 23 November 2026.** This piece gave single years for each town
> crossing below half: Blackburn with Darwen 2027, Pendle around 2034, Preston
> around 2037 and Burnley around 2050. The model projects 2031, 2041, 2051 and
> 2061 only, and those years were read off a straight line drawn between them, so
> they were an assumption rather than model output. The place pages stopped
> printing such years in October 2026. The piece now gives the decade in which
> each projection first falls below half. No projected share changes.

> **Correction, 12 October 2026.** Blackburn with Darwen's White British share
> in 2011 was **66.5%** (Census 2011 KS201EW: 98,144 of 147,489 usual residents),
> not 66.6%. Preston's asylum figure, **554** people on asylum support, could not
> be traced to any Home Office quarter: Preston had **429** people on asylum
> support at 31 December 2025, the quarter Burnley's 461 comes from, and **407** at
> 30 June 2026. Burnley had **471** at 30 June 2026 (Home Office, Immigration
> system statistics, regional and local authority data). Nothing else in the
> piece changes.

**Blackburn. 56.9% White British. Projected below half by 2031.**

Census 2021: Blackburn with Darwen, 56.9% White British. Down from 66.5% in 2011. Nearly 10 percentage points gone in one decade.

The Hamilton-Perry model projects (v8.0, scored out of sample against Census 2021: mean absolute error 1.56pp on that one-decade forecast, bias +0.05pp across 285 areas):

| Year | Blackburn WBI |
|------|--------------|
| 2021 | 56.9% |
| 2031 | 45.8% |
| 2041 | 34.6% |
| 2051 | 24.6% |

Blackburn is not alone in Lancashire.

**Pendle.** 66.1% White British (2021). Projected below 50% between 2031 and 2041. Nelson and Colne are the concentration points. White British projected 28.7% by 2051.

**Preston.** 66.1% White British (2021). Projected below 50% between 2031 and 2041. University city. International migration pipeline. 429 on asylum support at 31 December 2025, 407 at 30 June 2026. White British projected 35.6% by 2051.

**Burnley.** 77.9% White British (2021). Projected below 50% between 2041 and 2051. 461 on asylum support at 31 December 2025, 471 at 30 June 2026. The Daneshouse and Stoneyholme ward is already majority South Asian.

Burnley is the closest call. The projection for 2051 is 49.2%, and the model's 95% band for that year runs from 45.6% to 55.2%. The cohort-component model gives 55.8% for the same year.

Four Lancashire mill towns. Same industry. Same deprivation. Same trajectory. Different timelines.

Blackburn gets there first because it started from a lower base (56.9% vs Burnley's 77.9%) and has a larger established South Asian community driving higher cohort change ratios. The dynamics are identical. Only the speed differs.

**Source:** Census 2021 custom dataset. Hamilton-Perry v8.0, Census 2011 DC2101EW base, SNPP-constrained, recalibrated on an out-of-sample test (MAE 1.56pp, bias +0.05pp). The model projects 2031, 2041, 2051 and 2061, so each crossing is given as the decade between two projection years, never as a single year. The backcast score previously quoted here has been withdrawn; it measured the model's own guardrails rather than its accuracy. See the methodology.
