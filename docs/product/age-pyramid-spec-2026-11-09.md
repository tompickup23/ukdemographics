# Local age pyramid with a year slider: build spec

Written 9 November 2026. Nothing in this document is built. It is a brief for one build session and a list of decisions for the site owner. The mock beside it, `age-pyramid-mock-burnley.svg`, is drawn from the real ONS figures for Burnley and is not a published chart.

## Built on 9 November 2026

The first release is built on branch `feat/age-pyramids-2026-11-09`: the data file and its script, the chart with no script, the year slider, play, the people and share switch, the comparison outline, the England and Wales outline, an age reader, the hub, the CSV files and the sitemap entries. Where the build differs from the sections below:

- **Cohort follow is not built.** Section 6 describes it and section 12 puts it in its own PR. The age reader it will build on is in place.
- **The CSV carries `source_id`, not a source sentence.** A sentence on each of 2,730 rows made every file 325 KB and the set 103 MB. With the id of the row in `/data/sources.csv` each file is 125 KB and the set 42 MB.
- **The dates line is written from the data file**, not through `SectionDates`. `tests/section-dates.test.ts` holds that register to the sections of the place page.
- **The sources row is added in `src/pages/data/sources.csv.ts`**, not in `SOURCES`, because `SOURCES` also writes the place page citation and place pages must not change inside the re-measure window.
- **Links in.** `/maps/` and `/national/` each gained one line linking to the hub. No place page changed. The link from each place page waits for the 5 December read (decision 4).
- **The decisions in section 11 are recorded under "Decisions taken on 10 November 2026" below.**
- **Median age agrees with ONS table MYE6 for all 318 councils and for England and Wales** to the one decimal place ONS publishes, so the open question in section 4 is closed.

## Decisions taken on 10 November 2026

The site owner delegated the open decisions with the instruction to decide on quality. Each is recorded with what it rests on.

| Decision | Taken | Rests on |
|---|---|---|
| Addresses | `/places/<slug>/population-pyramid/` and `/population-pyramids/` | They match the one pyramid query in the search baseline (section 2) |
| Default view | Latest year with the mid-2011 outline | One still image carries the change; it is what a reader with no script, a crawler and a saved image all see |
| Smallest councils | Single years of age for every council, with a note where no bar in any year reaches 100 people | Only the Isles of Scilly is that small: its largest bar is 35 people. The City of London's is 349 and its shape reads clearly. The note is drawn from the data, so it follows the figures if they change |
| Place page link | After the 5 December 2026 search read | A link is a body change on every place page inside the re-measure window |
| Header menu | No entry for now; decide with the place page link | A menu change alters every page, place pages included, inside the same window |
| Colours | `--series-1` for males, `--series-2` for females | The palette validator's weakest separation under colour vision deficiency is 20.8 for this pair in light mode and 18.7 in dark. Blue with purple, the only other candidate that is not a red, falls to 9.0 in light and 3.1 in dark |
| Design check: phone header | Recorded as an exception; not changed here | The two-row header is shared by every page and is the estate's one-row header item. Changing it belongs in its own PR |
| Design check: height of `/maps/` and `/national/` | Recorded as an exception; not changed here | Both pages were over the cap before this work, which adds one line to each |
| Merge | Left to the site owner | Merging deploys the site |

A check of the extreme cases on 10 November found one defect, now fixed: on councils with large numbers, and on England and Wales, the outermost axis label ran off the edge of the picture, so 15,000 read as 5,000. Bars now stop 25 units short of each edge, and a test measures every axis label for every area in both measures.

## 1. What it is, in one paragraph

A page for each of the site's councils showing its population by single year of age and sex for every year from mid-2011 to mid-2025, as a back-to-back bar chart with a year slider. The reader can play the years, compare any year with mid-2011, switch between people and share of population, and follow one birth cohort through time. Version 1 shows observed ONS estimates only. It has no ethnicity dimension and no projection, so it does not wait for model v8.1.

## 2. Why this one first

- No UK rival has it at council level. PopulationPyramid.net steps through years but is national only and uses UN data. plumplot draws a static pyramid for postcode areas with no download. Both are recorded in the Reports repo, `Website_Audits/inspirations.csv` (row S01, PopulationPyramid.net, observed 3 November 2026) and `Website_Audits/ukdemographics.co.uk_competitors.csv` (plumplot, 3 November 2026).
- It is the site's positioning made literal: change over time, population first.
- The data is already held, on the site's own boundaries, with a tested reader (section 4).
- Search demand is thin and the case does not rest on it. The only pyramid query in the baseline is "manchester population pyramid": 153 impressions, 0 clicks, average position 23.89 (Google Search Console, Queries, last 3 months, exported 4 October 2026, `docs/seo/baseline-2026-10/queries-3m.csv`).

## 3. Scope

**In version 1**

- All 318 councils with a place page, plus England and Wales as a whole.
- Mid-2011 to mid-2025, every year, single years of age 0 to 89 and one group for 90 and over, males and females.
- One page per council, one hub page, a CSV per council, and a line in `/data/sources.csv`.

**Not in version 1**

- Projected years (section 9 explains why the held projection file cannot simply follow the estimates).
- Ethnicity by age. That belongs to the model and to v8.1.
- Counties, regions and custom areas. They are exact sums of whole councils and come in a later phase.
- Scotland and Northern Ireland. The source is an England and Wales file.

## 4. Data

**Source.** Office for National Statistics, *Population estimates and components of population change, detailed time series 2011 to 2025* (MYEB tables), table MYEB1, file `myebtablesenglandwales20112025.xlsx`, published 29 July 2026. The workbook's cover sheet says the next publication is "scheduled for summer 2027". The file is recorded in `data/raw/manifests/ons_mye_timeseries.json` and `data/model/INPUTS.json` (id `ons_mye_timeseries`, 48,813,826 bytes, sha256 `d0306f38454bfdfec4ff96003f6a4746b9da07dfbd212a29aff41905e23d592e`). It carries the July 2026 revisions to mid-2022, mid-2023 and mid-2024.

**What each figure counts.** The estimated usual resident population at 30 June of each year, by sex and single year of age, for local authorities as of April 2023. ONS's cover sheet says the unrounded estimates "should not be taken to be accurate to the level of detail provided". That sentence goes under the chart.

**Checked on 9 November 2026**, reading the held file with `readMyeb1` from `scripts/model/lib/control-totals-sources.mjs`:

| Check | Result |
|---|---|
| Site councils present in MYEB1 | 318 of 318 |
| Council-years where the single years sum to the MYE4 series in `population-estimates.json` | 4,770 of 4,770 |
| Cells that are not whole numbers | 0 |
| Burnley median age at mid-2025 computed from single years, against table MYE6 as held | 38.9 and 38.9 |
| One council's data for all 15 years as JSON, before compression | 11,235 bytes |

**Build script.** `scripts/build/build-age-pyramids.mjs`, on the pattern of `scripts/build/build-population-estimates.mjs`:

1. Read the manifest, check the raw file's sha256 against it, and stop on a mismatch.
2. Read MYEB1 with the existing `readMyeb1`. It matches headers by text and throws on a missing header. Do not write a second reader.
3. Keep the site's councils (the keys of `ethnic-projections.json`, as the estimates builder does) and sum them to England and Wales.
4. Write `src/data/live/age-pyramids.json`: source block (publisher, title, table, publication sentence read from the cover sheet, file name and hash), the year list, and for each council two arrays of 91 integers per year.
5. The raw file is 48.8 MB and is not in git, so this runs locally and the output is committed. CI never needs the raw file. At roughly 11 KB a council the output is about 3.6 MB, smaller than `ethnic-projections.json`.

**Derived values**, each computed from the same arrays and labelled as calculated:

- Total population per year. Must equal the MYE4 series.
- Median age per year, interpolated within the single year of age. For mid-2025 it must agree with MYE6 as held in `population-estimates.json`. Only Burnley has been checked so far; the test checks every council and decides the tolerance.
- The site's three age bands (0 to 17, 18 to 64, 65 and over). For mid-2025 they must equal the MYE2 bands already held.

No other derived measure. No dependency ratio, score or rank.

## 5. Pages and placement

| Page | Address | Notes |
|---|---|---|
| Council pyramid | `/places/<slug>/population-pyramid/` | 318 pages |
| Hub | `/population-pyramids/` | England and Wales pyramid, a council finder, A to Z list |
| Download | `/data/pyramids/<slug>.csv` | Long format: year, sex, age, population; 2,730 rows |

- Title: `{Plain name} population pyramid: age and sex, 2011 to 2025 | UK Demographics`, with the plain name from `plainPlaceName` and both years read from the data.
- Description: says what the page shows and names the ONS table. No number in the listing.
- Build these as new pages first. They do not touch place page titles, descriptions or body text, so the search re-measure window (6 November to 3 December 2026, `docs/seo/README.md`) stays clean.
- The link from each place page is added on or after 5 December 2026, after the re-measure is read. Until then the pages are reached from the hub, `/maps/`, `/national/`, the sitemap and `/llms.txt`.
- Add the pages to the sitemap and to `/data/sources.csv`. The build PR recounts the page total and corrects `CLAUDE.md`.

## 6. The chart

**Form.** Horizontal back-to-back bars, one per single year of age, youngest at the bottom, males on the left and females on the right, age labels every ten years in the centre. Inline SVG drawn at build time for the latest year, so the page works without script, in print and for crawlers. Script only redraws bar lengths.

**Default view.** Bars for the latest year with mid-2011 as a stepped outline over them. The mock shows why: one static image already tells the change story, and it is what a reader with no script, a crawler and a share card all see.

**Scale.** One horizontal scale per council, fixed across all years, set from the largest single cell in any year. Growth then reads as bars getting longer, and the picture never rescales under the reader.

**Controls**

- Year: `input type="range"`, mid-2011 to the latest year, step one, with `aria-valuetext` such as "Mid-2018, ONS estimate". Play and pause button. Follow the `/maps/` timeline (`#map-year`, `#map-play`, a `role="status"` line).
- Measure: people, or share of the council's population. In share mode an England and Wales outline can be switched on. It is never offered in people mode, where the scales cannot be compared.
- Compare with: mid-2011 by default, any other year by choice, or none.
- Follow a cohort: choose an age, by tapping a bar or with a number input, since a bar four units tall is too small a touch target on its own. The chart then marks that birth cohort in every year, one year older each year, and a line beneath gives its size at each year. Wording: "People aged 14 at mid-2025, born between mid-2010 and mid-2011". The 90 and over group cannot be followed, and a cohort stops being marked when it reaches it.

**Readout.** A short panel beside the chart for the chosen year: population, median age, the three age bands as counts and shares, and the change in each since mid-2011. It updates through one polite live region.

**The 90 and over bar.** It is an open-ended group and is far longer than its neighbours (see the mock). Set it apart with a gap and a "90 and over" label so it is not read as one year of age.

**Colour.** `--series-1` for males and `--series-2` for females, from the design tokens, in light and dark. Sex is also carried by side, so colour is never the only signal. No red.

**Motion.** Play advances a year at a time with a short ease on bar length. This is honest because every year is a real estimate. With `prefers-reduced-motion`, bars change with no transition and nothing plays on load.

**Phone.** The SVG is sized by `viewBox`. At 375 px wide the 91 bars and axis fit in about one screen. Controls sit above the chart and wrap. No horizontal scroll.

**Words on the page.** Two or three generated sentences, every number read from the data, declarative, no cause given. For example: "At mid-2025 Burnley had 100,946 residents and a median age of 38.9. At mid-2011 it had 87,032." The cohort line says the change in a cohort's size is the net result of moves and deaths and gives no reason beyond that.

**Under the chart.** `ChartActions` for the PNG and the CSV, `CiteThisPage`, a `SectionDates` line (last updated 29 July 2026, next update as the publisher states it), ONS's accuracy sentence, and a note that mid-2022 to mid-2024 are the revised figures. A `details` block holds the full table for the chosen year.

## 7. Tests

`tests/age-pyramids.test.ts` (vitest):

- Covers every site council and nothing else; names its source file by the manifest's hash.
- Every council-year sums to the MYE4 series; the councils sum to England and Wales.
- Every cell is a whole number of zero or more.
- Mid-2025 bands equal MYE2; mid-2025 median age agrees with MYE6.
- The static SVG draws the latest year exactly as the data file holds it, on the fixed scale.
- Every SVG is named with a title and description; text meets contrast against its background; the two series stay apart for protan, deutan and tritan vision (reuse the helpers in `tests/map.test.ts`).
- No dash in any text people read; no ranking language; generated sentences contain only numbers found in the data.
- The CSV has 2,730 data rows per council and round-trips to the JSON.

Playwright, phone and desktop:

- No horizontal scroll at 375 px.
- Moving the slider changes the readout and the bars; play stops at the last year.
- With script off, the latest-year pyramid, the outline and the table are present.
- With reduced motion, nothing animates.
- Axe finds no violation.

## 8. Budgets

- No chart library. One hand-written script in `public/scripts/`, as `national-map.js` is.
- A council page carries its own data inline (about 11 KB before compression) and makes no data request.
- The chart sits in a box with a fixed aspect ratio, so nothing shifts when script runs.

## 9. Projected years: why not yet

The idea was to extend the slider with ONS's 2022-based subnational projections. The held file does not allow that as it stands.

| Burnley | 2022-based projection | ONS estimate |
|---|---:|---:|
| Mid-2025 | 97,912 | 100,946 |
| Mid-2026 | 98,222 | not yet published |
| Mid-2032 | 100,138 | not yet published |

Projection figures are the sum of the male and female single-year files in `snpp_z1.zip` (ONS, *Subnational population projections for England: 2022-based*, migration category variant, published 24 June 2025, years 2022 to 2047). Estimates are ONS table MYE4, published 29 July 2026.

The projection for mid-2032 is below the estimate for mid-2025. A slider that ran from the mid-2025 estimate into the file's mid-2026 figure would show the population falling by 2,724 in one step, which is an artefact of the projection's older base and not a forecast. The same file covers 309 areas on older boundaries, so Cumberland, North Yorkshire, Somerset and Westmorland and Furness would need their former districts summed.

Two routes, both later:

1. ONS's planned projections product with continuity to the estimates, if it is published (see `docs/model/V81_READINESS.md`, blocker 1).
2. The v8.1 control totals, which move the mid-2025 estimate by the projection's growth. They are this site's construction, so they need the v8.1 methodology note and the same hatching and labelling as every other projected figure.

Either way the projected years are a separate, labelled series, added after v8.1.

## 10. Later phases

1. Place page link and a compact latest-year pyramid in the place page redesign (after 5 December 2026).
2. Counties, regions and build-your-own areas, as sums of whole councils.
3. Two councils side by side in share mode.
4. A share card and a yearly clip from the same renderer.
5. Projected years (section 9).

## 11. Decisions for the site owner

1. **Address.** `/places/<slug>/population-pyramid/` and `/population-pyramids/` (recommended, they match the search term), or shorter names.
2. **Default view.** Latest year with the mid-2011 outline (recommended), or the latest year alone.
3. **Smallest councils.** Single years everywhere with ONS's accuracy sentence (recommended, since ONS publishes them), or five-year bands for the City of London and the Isles of Scilly.
4. **Place page link.** After the 5 December read (recommended), or now with the deploy date logged in `docs/seo/README.md`.
5. **Header menu.** Whether the hub gets a menu entry or sits under Maps.

## 12. Build order

| Step | Work |
|---|---|
| 1 | Build script, `age-pyramids.json`, data tests |
| 2 | Static SVG renderer and the council page with no script |
| 3 | Slider, play, measure switch, comparison outline, readout |
| 4 | Cohort follow |
| 5 | Hub page, CSV endpoint, sources row, sitemap, `/llms.txt` |
| 6 | Accessibility and layout tests, `/design-check`, page count and `CLAUDE.md` |

Steps 1 to 3 make a shippable first release. Step 4 can follow in its own PR.

## Sources

- Office for National Statistics (2026) *Population estimates and components of population change, detailed time series 2011 to 2025*, table MYEB1. Published 29 July 2026. Held copy sha256 `d0306f38...`, recorded in `data/raw/manifests/ons_mye_timeseries.json`.
- Office for National Statistics (2026) *Mid-Year Population Estimates, England and Wales, June 2025*, tables MYE2, MYE4 and MYE6. Published 29 July 2026. As held in `src/data/live/population-estimates.json`.
- Office for National Statistics (2025) *Subnational population projections for England: 2022-based*, migration category variant, single year of age. Published 24 June 2025. Held as `snpp_z1.zip`, sha256 `66d84d0e...`.
- Google Search Console, property `https://ukdemographics.co.uk/`, Queries, last 3 months, exported 4 October 2026: `docs/seo/baseline-2026-10/queries-3m.csv`.
- Reports repo, `Website_Audits/inspirations.csv` and `Website_Audits/ukdemographics.co.uk_competitors.csv`, both dated 3 November 2026.
