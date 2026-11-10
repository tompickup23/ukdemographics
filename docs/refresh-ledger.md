# Refresh data ledger

One row per `Refresh data` workflow run from 12 October 2026. Source for the run list:
`gh run list --workflow refresh-data.yml`. Failure detail is from the run jobs, and from the
bodies of PR 128, issue 127 and PR 131. The 9 November row is from the run's steps and its
commit, read on 10 November 2026.

| Date (UTC) | Outcome | Failing step | Fix PR | Issue |
|---|---|---|---|---|
| 2026-10-12 | success | (none) | (none) | (none) |
| 2026-10-19 | success | (none) | (none) | (none) |
| 2026-10-26 | failure | Transform DHSC adult social care tables (new finance edition header labels); restore put back `asc-dashboard.json` but not its manifest, so Test the refreshed data failed and nothing was committed. Parked on `data/refresh-failed-2026-10-26-1505`. | [PR 128](https://github.com/tompickup23/ukdemographics/pull/128) (merged 27 October 2026): every secondary restore step also restores that ingest's manifest | [Issue 127](https://github.com/tompickup23/ukdemographics/issues/127) |
| 2026-11-02 | failure | Transform DHSC adult social care tables still failed on the 2025 to 2026 finance workbook labels. After PR 128 the restore kept the committed ASC file and its manifest, so the other five datasets passed the tests and were committed; the final Fail if the refreshed data failed the tests step turned the run red because ASC was skipped. | [PR 131](https://github.com/tompickup23/ukdemographics/pull/131) (merged 2 November 2026): accept the new DHSC finance workbook schema and update the current ASC finding figures | (none; issue 127 covers the 26 October failure) |
| 2026-11-09 | success | (none). All six ingests passed, so no restore step ran. The run was scheduled for 08:00 and started at 18:34. It committed `39d5f0c`: stop and search, the SEN dashboard, and the manifests for stop and search, births, TB, Council Taxbase, adult social care and SEN. | (none) | (none for the refresh). The MP list check in the same run opened [issue 156](https://github.com/tompickup23/ukdemographics/issues/156), a party change for one seat that needs an independent source. [Issue 127](https://github.com/tompickup23/ukdemographics/issues/127) is still open, although its fix merged and this run passed. |

Runs: [12 Oct](https://github.com/tompickup23/ukdemographics/actions/runs/38285538782),
[19 Oct](https://github.com/tompickup23/ukdemographics/actions/runs/39277809059),
[26 Oct](https://github.com/tompickup23/ukdemographics/actions/runs/40345189613),
[2 Nov](https://github.com/tompickup23/ukdemographics/actions/runs/41496977826),
[9 Nov](https://github.com/tompickup23/ukdemographics/actions/runs/42675269074).

## Changes after the 2 November run

The 2 November failure opened no issue, because only a test failure opened one. From 4 November 2026 the workflow keeps one open `refresh-failed` issue, "Data refresh: an ingest failed", for any fetch or transform failure. It quotes the end of each failed step's log and closes when all six ingests pass. Stop and search became a secondary ingest like the other five. Its fetch now reads robots.txt, sends the neutral user agent, makes one request per file with no retry and records a manifest. A local replay on 4 November 2026 had data.police.uk answer HTTP 429 to 5 of 92 back-to-back requests, so requests are now spaced two seconds apart. `docs/REFRESH.md` describes every step.
