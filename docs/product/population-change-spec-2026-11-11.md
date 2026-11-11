# Population change: spec and decisions, 11 November 2026

Register row R628 (Reports `Website_Audits/roadmap.csv`), idea I025, rank 1 for UK Demographics in `idea_fits.csv`. Plan: Reports `Website_Audits/ukdemographics_plan_2026-11-11.md`, sections 2 and 4.

## What it is

One page per council at `/places/<slug>/population-change/` and a hub at `/population-change/`, with a CSV per council at `/data/population-change/<slug>.csv`. Each page shows how the population changed in the twelve months to mid-2025, and in every year since mid-2011, split into births, deaths, moves within the UK, international migration and ONS's "other" term, and shows that the parts add up exactly to the change in the ONS estimate.

The research pass of 11 November 2026 found no site that shows this for every council: ONS's area tool has no such indicator and one county observatory shows its own districts only.

## Data

- **Table MYEB3** of the ONS detailed time series (`myebtablesenglandwales20112025.xlsx`, published 29 July 2026), held outside git and found through `data/model/INPUTS.json` (id `ons_mye_timeseries`), checked by sha256. It holds, for each of the 318 councils, the population at each mid-year from 2011 and, for each year to mid-2012 through mid-2025: births, deaths, internal in and out, international in and out, and other change, with ONS's own difference columns.
- `scripts/build/build-population-change.mjs` writes `src/data/live/population-change.json` (244 kB). The reader is `readMyeb3` in `scripts/model/lib/control-totals-sources.mjs`, beside `readMyeb1`: headers matched by text, never by position.
- The build refuses to write unless, for every council and year, the start plus births minus deaths plus both net flows plus other equals the end exactly, and ONS's natchange and net columns equal the differences they name. All 318 councils pass in all 14 years.
- The 95 per cent interval and the July 2026 revisions come from `population-estimates.json` (the separate mid-2025 workbook, tables MYE0 and MYE4).
- England and Wales is the sum of every council. Its internal in and out are therefore sums that include every move between two councils; only their difference (moves to and from Scotland and Northern Ireland) is shown for England and Wales.

**Cross-checks in `tests/population-change.test.ts`** (no figure pinned, so next year's edition passes unedited): the population for every council and year equals the series in `population-estimates.json`; the mid-2025 parts equal table MYE3 of the other workbook for every council and for England and Wales; the latest year starts from the revised mid-2024 figure; every sentence number is in the data or a sum of it; ONS is quoted only in words its own Notes sheet uses.

## Decisions and what each rests on

1. **Its own address, no place page link before the search read.** The T08 re-measure window runs to 3 December 2026 and is read on or after 5 December; place pages are not touched. The age pyramids did the same. A place page block is the second half of R628, gated on R381.
2. **The latest year as a ledger, not a waterfall.** A waterfall on a population of a million would need a broken axis. Bars run from zero, gains right and losses left, between the start and end populations printed as figures. Values sit in a column of their own at the right, so no label can sit on a bar; the test checks every label against every bar for all 319 areas.
3. **Every year as small multiples on one scale.** Five panels (births minus deaths, moves within the UK, international migration, other, total), one hue, one scale, so a column means the same size in every panel and nothing depends on telling colours apart. Ticks are round (1, 2, 2.5 or 5 times a power of ten) and labelled only at top, zero and bottom.
4. **One hue for the parts, ink for the total.** Direction and the sign on the printed value carry gain or loss; no red or green, so no part reads as good or bad.
5. **Moves, not people.** ONS counts moves; the tables and notes say one person moving twice counts twice.
6. **The other term is explained where it is large.** For mid-2011 to mid-2021 it includes ONS's adjustment to the 2021 Census (Burnley: +5,130 of +13,914 over the period; City of London: −4,784). The span paragraph says so whenever that part is a tenth or more of the total change, and the notes always say what the term holds.
7. **No ranking.** The hub lists councils A to Z with the comparator `tests/area-order.test.ts` accepts. No page orders areas by a value.
8. **Chart text at phone size.** The viewBox is 360 units wide (as the pyramid), so a unit is about a pixel on a phone; labels are 10 units or larger, the source line 9.5.

## Estate Kit

Built in the kit's shape so it can move there later: each chart is a function that returns the SVG, the alt text, and every text and mark box it drew, and the tests run an overlap gate over those boxes. The ledger is the kit's BillAnatomy rule (the parts must sum to the published total) applied to population. The site does not take the kit itself yet: the kit's pilot order puts UK Demographics after 26 November 2026, and the kit is private while this repository is public (kit decision C).

## Left to do

- A place page block linking here (R628, second half): on or after 5 December 2026, after the T08 read.
- Counties and regions as exact sums of whole councils: no gate.
- The UK figure for mid-2025, when ONS publishes it: a note on the hub only.
