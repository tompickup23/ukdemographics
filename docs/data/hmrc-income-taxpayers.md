# HMRC income taxpayers by local authority

`src/data/live/income-taxpayers-la.json` is an annual, source-derived dataset.
It does not change a published page or calculate asylum costs.

## Refresh

Run from the repository root:

```sh
node scripts/fetch/fetch-hmrc-spi-la.mjs --dry-run
node scripts/fetch/fetch-hmrc-spi-la.mjs
node scripts/transform/transform-hmrc-spi-la.mjs
npx vitest run tests/income-taxpayers-la.test.ts
```

The fetch discovers HMRC accredited statistics releases through the GOV.UK search
API. It selects the newest tax year from exact release titles, then follows the
content API's attachment. It respects robots.txt and keeps download attempts in
`data/raw/manifests/`. Both ODS files are tracked so tests and future consumers can
replay the transform offline after the working checkout is removed. Upstream
replacements are retained beside the original, with a hash suffix.

The transform checks each manifest's SHA-256 before reading cells. It reads the
SPI edition from the workbook and the national outturn boundary and projection
assumptions from Table 2.1's Contents and Footnotes sheets. It refuses unrecognised
headers, units, missing markers, duplicate codes, inconsistent confidence bounds,
changed authority coverage or a local sum outside the two percent reconciliation.

## Fields and coverage

`areas` is keyed by the original HMRC authority code. Every record contains the
taxpayer count, lower and upper 95% confidence bounds, mean and median total
income, tax-year edition, publication date, and sheet, row and cell locators.
Counts are individuals converted from the source's thousands. Income is pounds
per year. Published rounding is retained. `null` means HMRC did not publish a
value and has an explanatory note; it never means zero.

The 2023 to 2024 edition contains 361 authority rows, of which 359 have taxpayer
counts. Torbay (E06000027, row 320) has a median but no count, interval or mean.
Isles of Scilly (E06000053, row 314) has none of those measures. Both sheets mark
the missing cells `[Not available]`. Neither row is absent or joined to Cornwall.
The reason for each unavailable cell is not inferred. Sheffield E08000019 and
Barnsley E08000016 retain HMRC codes; asylumstats already resolves the corresponding
Home Office E08000039 and E08000038 codes.

`coverage.localAuthorityTaxpayers` sums only published local counts. It must remain
distinct from the same-year national outturn in `national.years`. HMRC's notes
explain that the geographical tables omit the supplementary PAYE sample, and
some individuals in UK totals cannot be allocated to an area. Missing local cells
and rounding also prevent complete reconciliation. Do not assign the difference
to Torbay, Scilly or any other area, or sum local intervals into a UK interval.

`national.years` retains Table 2.1's historical series and distinguishes outturn,
projected and unavailable years. Projection assumptions carry their source note.
Every source's URL, release title, publication and retrieval dates, file path and
SHA-256 are in `sources`; source coverage notes retain their worksheet locators.

## First banked editions

- HMRC Personal Incomes Statistics, tax year 2023 to 2024, Tables 3.12 to 3.15a,
  published 29 April 2026. Local counts and incomes use Table 3.14; count intervals
  use Table 3.14a. SHA-256:
  `f70e210eb2931d9a6da5f8b6fa184b902b51ef9e2c9fb3588323907647d7672c`.
- HMRC Income Tax liabilities statistics, tax years 2023 to 2024 through 2026 to
  2027, Tables 2.1 to 2.6, published 15 July 2026. National counts use Table 2.1,
  `2_1_IT_payers_by_demographic`. SHA-256:
  `40e1c7bb75d484132e8329fcac75f16e1a96305302fc422ee446a688d52bdbc2`.

Both were retrieved on 24 October 2026. Live links are retained in the manifests
and output. Source hashes here document this banked edition, not a permanent
restriction on annual refreshes.

## Downstream gate

The next asylumstats module PR must add this file to `SYNCED_FILES` and use its
existing commit-pinned UKD sync, after this UKD PR is merged. If explicitly built
before merge, use the UKD branch's full commit hash and `--allow-unmerged`, and
identify that dependency in the asylumstats PR body. Do not copy files by hand.
This UKD-only step neither changes the asylumstats sync registration nor opens a
second PR: the requested sequence allows one PR at each review gate.
