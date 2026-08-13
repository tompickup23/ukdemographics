---
headline: "Academic ethnic projections over-predicted White British share in 95% of areas"
date: "2026-04-11"
category: demographics
stat_value: "3.95pp"
stat_label: "NEWETHPOP MAE vs Census 2021 actuals (296 areas)"
verdict: alert
source_url: "https://reshare.ukdataservice.ac.uk/852508/"
source_label: "NEWETHPOP (University of Leeds)"
summary: "The NEWETHPOP cohort-component model, the most cited academic ethnic projection for UK local authorities, over-predicted White British share in 282 of 296 areas when its 2021 projection is compared against actual Census 2021 results. Mean absolute error: 3.95 percentage points."
---

**The UK diversified faster than the leading academic model predicted.**

NEWETHPOP is the most cited ethnic population projection for UK local authorities. It was built by Rees, Norman, Wohland, Lomax and Clark at the University of Leeds, published via the UK Data Service in 2016 (ESRC grant ES/L013878/1). It projected ethnic composition from Census 2011 to 2061 using a bi-regional cohort-component model with age-specific fertility, mortality, and migration rates by ethnic group. Two scenarios were published: a Brexit variant (Leeds1) and an ONS-aligned variant (Leeds2). The full dataset (2 x 1GB) is freely available under CC BY 4.0.

Census 2021 gave the answer. The Leeds2 (ONS-aligned) archive was downloaded, the Population2021 prediction was extracted for all local authorities, and compared against actual Census 2021 data from ONS TS021.

**Result: the model over-predicted White British population share in 282 of 296 areas (95%).** Mean absolute error: 3.95 percentage points. RMSE: 5.21pp. Only 16% of areas were accurate to within 1 percentage point.

**The worst misses were systematic, not random:**

- **Thurrock**: predicted 83.4% WBI, actual 66.2%. Error +17.2pp.
- **Greenwich**: predicted 57.4%, actual 41.4%. Error +16.0pp.
- **Barking & Dagenham**: predicted 46.6%, actual 30.9%. Error +15.7pp.
- **Havering**: predicted 82.0%, actual 66.5%. Error +15.5pp.
- **Bexley**: predicted 79.4%, actual 64.5%. Error +15.0pp.

All five worst misses are in London and the Thames Gateway, areas where international migration accelerated beyond the model's assumptions. The model assumed EU and non-EU migration volumes based on pre-2016 patterns. Brexit, the post-2021 visa surge, and the expansion of student and skilled worker routes all changed the composition of migration in ways the 2011-calibrated model could not anticipate.

**This is not the first time.** The Leeds team acknowledged that their original ETHPOP model (2001-based) had the same systematic bias when validated against Census 2011. NEWETHPOP was funded specifically to correct this. The correction was insufficient: the same directional error persisted, just smaller in magnitude.

**Every projection in use today inherits this problem.**

Every ethnic demographic projection for the UK, including Goodwin's CHSS report (2025) which projects White British minority by 2063, inherits assumptions from the same academic tradition. The gold-standard model underestimated diversity growth by an average of 4 percentage points over 10 years. Forward projections to 2050 or 2060 are likely understating the pace of demographic change.

**This site's model, on the same areas.** A direct comparison against NEWETHPOP is published. Restricted to the 269 areas with complete Census 2021 custom-dataset coverage, this model's backcast (Census 2011 forward to 2021) scores MAE 1.71pp vs NEWETHPOP's 2.58pp on the same 269 areas. **Important caveat**: the backcast uses cohort change ratios derived from the same 2011 and 2021 endpoints that the backcast is then tested against. A national-CCR baseline that throws away all local information scores 2.32pp on the same test. The genuine local-information improvement over the baseline is small. Treat the 1.71pp figure as an internal consistency check, not as a measure of forward-projection accuracy. **Updated 13 August 2026:** re-running the backcast with the model's two internal guardrails removed reproduces Census 2021 to within 0.14pp, because the ratios are the 2021 population over the 2011 population applied back to 2011. The 1.71pp was measuring how far those guardrails pull a circular fit away from the answer it already contains. NEWETHPOP's 2.58pp is a genuine out-of-sample error, so the head-to-head is withdrawn.

**Accuracy distribution, NEWETHPOP, across 296 areas:**
- Within 1pp: 48 areas (16%)
- Within 2pp: 108 areas (37%)
- Within 5pp: 208 areas (70%)
- Over 10pp error: 26 areas (9%)

**Nobody else has published this validation.** The NEWETHPOP dataset has been downloaded and cited by researchers worldwide, but no systematic comparison against Census 2021 actuals has been published. This finding is, to the author's knowledge, the first.

**Data:** NEWETHPOP Leeds2 projection (DOI: 10.5255/UKDA-SN-852508) vs ONS Census 2021 TS021 via NOMIS API. Full validation data and error tables published at ukdemographics.co.uk. Methodology: Hamilton-Perry single-year-of-age model, 20 ethnic groups, Census 2011 DC2101EW (18 groups, observed) plus Census 2021 custom dataset (20 groups, direct), DfE School Census 2024/25 independent validation, James-Stein shrinkage, 1,000 Monte Carlo simulations. The full circularity discussion is on the methodology page.
