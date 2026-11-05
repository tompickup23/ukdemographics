# Search listings: baseline and the October 2026 listing test

Started 4 October 2026. The place pages rank on page one for population and demographics
queries and almost nobody clicks. This folder holds the baseline taken before any change, the
design of the test that changed the place listings, and its result. Arm B won, and since
2 November 2026 every place page uses its format (see "Result" below).

## Baseline, taken 4 October 2026

Source for every figure in this section: Google Search Console, property
`https://ukdemographics.co.uk/`, Performance report, search type Web, exported through the
Search Console interface on 4 October 2026. The files are in `baseline-2026-10/`.

| File | What it is |
|---|---|
| `pages-3m.csv`, `queries-3m.csv` | Pages and Queries tables, "Last 3 months" (data runs 19 August to 29 September 2026) |
| `pages-28d.csv`, `queries-28d.csv` | The same tables for "Last 28 days" (2 to 29 September 2026). These are the control numbers. |
| `chart-*.csv`, `countries-*.csv`, `devices-*.csv`, `filters-*.csv` | The rest of each export, kept unedited |
| `index-not-indexed-2026-10-04.csv` | The Page indexing report's "Page with redirect" and "Not found (404)" lists, copied from the drilldown pages the same day |

Search Console caps a table export at 1,000 rows. Both Pages exports hit the cap, so pages
with the fewest impressions are missing from them; the totals below come from the Chart file,
which is not capped. Every place page is in both exports.

**Whole property, 19 August to 29 September 2026** (`chart-3m.csv`): 960,047 impressions,
3,784 clicks, a click rate of 0.4% and an average position of 8.6.

**Click rate by page** (`pages-3m.csv`):

| Page | Impressions | Clicks | Rate |
|---|---:|---:|---:|
| /your-area/ (postcode tool) | 2,444 | 164 | 6.7% |
| /constituencies/holborn-and-st-pancras/ | 2,820 | 68 | 2.4% |
| /findings/birmingham-demographic-transformation/ | 15,259 | 186 | 1.2% |
| /places/newcastle-upon-tyne/ | 22,209 | 53 | 0.2% |
| /places/manchester/ | 19,555 | 39 | 0.2% |

**Click rate by section** (`pages-3m.csv`, summed by first path segment):

| Section | Impressions | Clicks | Rate |
|---|---:|---:|---:|
| /places/ (all paths) | 828,265 | 2,683 | 0.32% |
| /constituencies/ | 63,692 | 317 | 0.50% |
| / (home) | 34,743 | 166 | 0.48% |
| /findings/ | 30,808 | 368 | 1.19% |
| /your-area/ | 2,446 | 164 | 6.70% |

**Queries** (`queries-3m.csv`): "slough demographics 2026" drew 8 clicks from 45 impressions;
"isle of wight population", a query Google answers on the results page, drew 4 from 2,625.

The Reports-session review that prompted this work also recorded Cloudflare Web Analytics for
the 30 days to 3 October 2026 (11,190 page loads, 7,470 visits, 66% from Great Britain). Those
figures were not re-checked here.

### Index report, 4 October 2026

- **15 "Page with redirect"**: every one is a section URL without its trailing slash
  (`/your-area`, `/findings`, `/places/barking-and-dagenham` and so on). GitHub Pages redirects
  these to the slash form, which is the canonical. They are not stale slugs. This note first said
  no internal link used the slashless form; that was wrong. Fourteen of the header menu links in
  `src/components/SiteHeader.astro` had no trailing slash and redirected on every click, on every
  page. They were fixed on 2 November 2026, and `tests/site-metadata.test.ts` now checks them.
- **8 "Not found (404)"**: seven Scottish and Northern Irish council pages the site no longer
  builds (Belfast, Glasgow City, Aberdeenshire, City of Edinburgh, Derry City and Strabane,
  Antrim and Newtownabbey, Perth and Kinross; last crawled 23 to 31 May 2026) and
  `/places/regions/unknown/`, left from before the Barnsley and Sheffield code fix. These are
  stale, and the areas have no page to redirect to, so a 404 is the correct status. The site had
  no 404 page; `src/pages/404.astro` now sends readers to the postcode tool, the place profiles,
  the constituencies and the findings, and keeps the 404 status.

## Diagnosis

Every place listing led with "White British X% (2021) to Y% (2051 projected)", the title
repeated the population Google's knowledge panel already shows, and the first visible sentence,
which Google uses when it rewrites a description, said "Already below a White British majority"
or named the crossing year. The listing gave away the two facts the page is distinctive for, to
an audience of students, movers, officers and journalists, many of whom read an ethnicity-led
snippet as a campaign site. Constituency pages, with a neutral description, convert at about
1.6 times the rate of place pages, and the postcode tool at about twenty times.

## The test

Three arms on the place pages, assigned by a hash of the page slug.

| Arm | Title | Description | First visible sentence |
|---|---|---|---|
| Control | As before: `{Area} demographics: {n}k population (2021 Census)` | As before: population, White British 2021 to 2051 | As before |
| A, breadth, no number | `{Area} demographics: population, ethnicity, arrivals, housing and projections to {horizon}` | What the page covers and where it comes from; no group named, no percentage | A neutral summary of the same shape |
| B, as A with the data year | `{Area} demographics {year}: population, ethnicity and projections to {horizon}` | Says when the profile was updated and that the population is the Census count | The same, with the update month |

Every year in the copy is read from the data: the Census year from the projection base, the
horizon from the plausibility guard (the furthest publishable year, capped at 2051, so Enfield
reads "projections to 2041"), the arrivals start year from the NINo series and arm B's year and
month from the projection file's `lastUpdated`. The copy is built in `src/lib/search-listing.ts`;
a topic is only listed when its section renders for that area.

For A and B the White British trajectory sentence, the crossing year and the hero stat stay on
the page directly below the summary, as before. The Dataset structured data takes the meta
description, so it follows the arm.

### Assignment

`src/lib/listing-arm.ts`. Take the slug (the path segment after `/places/`), hash it with
32-bit FNV-1a (offset basis `0x811c9dc5`, prime `0x01000193`, XOR then multiply, per character),
and take the result modulo 3: 0 is control, 1 is arm A, 2 is arm B. No salt. Worked example:
`birmingham` hashes to `0xd4ab7d67`, which is 2 modulo 3, so arm B.

The full list is `listing-arms-2026-10.csv` (slug, area code, name, region, hash, remainder,
arm). It is now a historical record: `tests/listing-arm.test.ts` checks every row against the
hash rule and never regenerates it. While the test ran, each live page carried its arm as
`data-listing-arm` on the header block; that attribute went with the rollout.

### Baseline by arm

From `node scripts/seo/ctr-by-arm.mjs <export>`:

| Arm | Places | 3 months: clicks / impressions | Rate | 28 days: clicks / impressions | Rate |
|---|---:|---:|---:|---:|---:|
| Control | 111 | 822 / 233,748 | 0.352% | 559 / 161,891 | 0.345% |
| A | 102 | 929 / 276,913 | 0.335% | 661 / 202,213 | 0.327% |
| B | 105 | 910 / 309,442 | 0.294% | 675 / 231,606 | 0.291% |

The arms do not start level. A hash does not stratify by page size, and arm B holds several of
the largest pages (Birmingham and Newcastle upon Tyne among them). Compare each arm's change
against its own baseline, not the raw rates against each other.

### Changes that apply to every arm

These went out in the same release and affect control as much as A and B, so they move the
baseline but not the comparison.

1. **Sitemap lastmod** for place, region and constituency pages: the later of the data release
   behind them (the projection file's `lastUpdated`, or the constituency dataset's
   `generatedAt`) and the last commit to the template and copy code. The commit date is what
   stands in for a build date: a raw build date would stamp all of these pages on every deploy,
   and the deploy job sends every URL with today's lastmod to IndexNow. Both workflows now check
   out full history so the commit date is real; a shallow clone falls back to the data date.
2. **A direct-answer paragraph** at the top of each place page, 64 to 82 words across the 318
   areas: the Census population and its change since 2011, the three largest ethnic groups with
   shares, and the projection's three largest groups at the horizon year, with the model name,
   version and inputs read from the projection file. `tests/search-listing.test.ts` checks the
   length and that every number in it is in the data files. The eleven unitaries formed after
   2011 have no 2011 figure on their boundaries in the data, and the paragraph says so.
3. **A "look up your postcode" line** under that paragraph, and **related findings** (those
   naming the area, then its region, then the newest on composition and migration) below the
   key figures.
4. **Constituency pages**: a description that says what is on the page, an Open Graph card
   (the winner's vote share), and BreadcrumbList, AdministrativeArea and Dataset structured data.
5. **Region pages**: arm A's treatment (breadth title and description, no group or share in the
   listing).
6. **A 404 page**, see the index report above.

## Measuring

Four weeks after deploy, export the Pages table for the 28 days after the deploy date through
Search Console, save it here as `after-2026-11/pages-28d.csv`, and run:

```
node scripts/seo/ctr-by-arm.mjs docs/seo/after-2026-11/pages-28d.csv
```

- Deploy date: 4 October 2026 (PR #68 merged to main). Re-measure on or after 1 November 2026, using the 28 days from 4 to 31 October 2026, and check the deploy run succeeded on that date before counting from it.
- Exclusions (12 October 2026): the Census Mixed/Black fix (PR 73) changed the direct-answer
  paragraph on 15 place pages, five in each arm, mid-window. They are listed in
  `docs/seo/listing-test-exclusions-2026-10.csv` and `ctr-by-arm.mjs` drops them from every arm by
  default (`--include-excluded` keeps them). The same day's data refreshes (TB, SEND, Council
  Taxbase, schools, payroll, crime, births) changed place-page body text and sitemap `lastmod` on
  every page, equally across arms, but no title, meta description or direct answer. Compare
  the arms with each other, not with the September baseline alone, and note any crawl jump
  after 12 October.
- Two-model spread (12 October 2026): the cohort-component re-run changed the spread in the
  two-model comparison's body text on 260 place pages and removed the comparison from the 49
  pages whose projections come from an earlier run (20 control, 10 arm A, 19 arm B). No title,
  meta description or direct answer changed on any of the 318 pages (checked against a build of
  main).
- Decide on clicks per impression, not clicks. Record average position by arm too, because a
  listing change can move ranking.
- If one arm wins, roll it to every place in a follow-up PR and record the result here.
- If Google rewrites the descriptions anyway, say so, and compare the rewritten snippets by arm
  from 20 screenshots taken through Chrome.

## Result

Measured 2 November 2026. Arm B won.

**Data.** Google Search Console, ukdemographics.co.uk, Performance, Pages, web search, 4 to 31
October 2026, read by hand in the Search Console web interface. The full table had 1,000 rows
summing to 4,534 clicks, matching the property total of 4.53k, so no page was cut off. The 319
place-page rows are in `after-2026-11/place-pages-2026-10-04_to_2026-10-31.csv`.

**Method.** `node scripts/seo/ctr-by-arm.mjs <export>` (repo at origin/main of 28 October
2026), which drops the 15 pages in `listing-test-exclusions-2026-10.csv`. Baseline is the same
script on `baseline-2026-10/pages-3m.csv`. Re-running the script on the committed place-page
file on 2 November 2026 gives the same clicks, impressions and rates.

| Arm | Pages | Clicks | Impressions | Clicks per impression | Baseline (3 months to 3 Oct) |
|---|---:|---:|---:|---:|---:|
| Control | 106 | 485 | 136,814 | 0.354% | 0.350% |
| A (breadth, no number) | 97 | 813 | 165,790 | 0.490% | 0.334% |
| B (breadth plus data year) | 100 | 1,409 | 228,065 | 0.618% | 0.292% |

**Robustness.** Without each arm's three highest-click pages: control 0.376%, A 0.480%, B
0.621%. Median page rate among pages with 500 or more impressions: control 0.384% (63 pages),
A 0.483% (73), B 0.657% (68). B started lowest and finished highest; control did not move.

Average position by arm was not recorded in this measurement.

**Rollout, 2 November 2026.** Every place page now takes arm B's title, description and
opening sentence from `buildPlaceListing` in `src/lib/search-listing.ts`. The control copy is
gone from the template. `src/lib/listing-arm.ts` and `listing-arms-2026-10.csv` stay as the
record of the assignment, and `ctr-by-arm.mjs` still splits a later export by the former arms.

**Next.** Re-measure four weeks after the rollout deploys: the former control and A pages
should move towards B's rate. Leading with the ONS mid-year estimate instead of the 2021 Census
count is a separate change, to test after this one.

## T08 re-measure clock

- Clock start: 5 November 2026. PR 146 (population first homepage and place answer box, R359)
  merged to main at 10:06 UTC as `b610709e`; its deploy run (42007978427) succeeded at 10:17
  UTC the same day. From that date every place page opens its answer box with the ONS mid-2025
  estimate (table MYE4, published 29 July 2026) ahead of the 2021 Census count.
- Re-measure on or about 4 January 2027 (Reports register R381, Traffic/seo/tasks.csv T08),
  with the same method as the result above: the Pages export for the 28 days after a clean start,
  split by the former arms with `ctr-by-arm.mjs`, deciding on clicks per impression and recording
  average position by arm.
- Changes inside the window to note before counting: PRs 148, 143, 144 and 147 (neighbour links,
  density and median age, schema and the plain name under the H1, the cite block) change place
  page body text after 5 November. None changes a place page title or meta description; 144
  changes the hub pages' titles and descriptions, which sit outside the arm split. Record each
  one's deploy date here when it lands.
