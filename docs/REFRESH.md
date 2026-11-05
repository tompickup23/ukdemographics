# Refreshing the data

The `Refresh data` workflow (`.github/workflows/refresh-data.yml`) runs every Monday at 08:00 UTC and can be started by hand from the Actions tab. It refreshes six public datasets that need no key, tests the result, and commits to main only data that passed. A run that commits dispatches `deploy.yml`; nothing else deploys from it.

`docs/refresh-ledger.md` has one row per run, with the failing step and the fix for each red run.

## What each run does

1. Fetch each dataset's raw file into `data/raw/<dataset>/`, which is gitignored.
2. Run the dataset's Python transform to write `src/data/live/<file>.json`.
3. Decide whether anything substantive changed. Lines that only move `generatedAt`, `generated_at` or `lastUpdated` do not count.
4. Run `npm test` on the refreshed data.
5. Commit the data and its manifests to main, never deleting a data file, then dispatch the deploy.

Each of the six ingests is secondary. If its fetch or transform fails, a restore step puts back that dataset's committed files and its manifest, and the other ingests carry on. Main keeps the last data that passed.

## The six ingests

| Step | Publisher | Where the fetch finds the file | Transform | Output | Cadence |
|---|---|---|---|---|---|
| Stop and search | data.police.uk | `https://data.police.uk/api/crimes-street-dates` names the newest three months and the forces listed for each; then one `https://data.police.uk/api/stops-force?force=<force>&date=<month>` per force-month | `transform_stop_and_search.py` | `stop-and-search.json` | Monthly, refetched weekly |
| Births by parents' country of birth | ONS | The newest edition's workbook linked from `https://www.ons.gov.uk/peoplepopulationandcommunity/birthsdeathsandmarriages/livebirths/datasets/parentscountryofbirth` | `transform_births_by_mother_cob.py` then `transform_births_history.py` | `births-by-mother-cob.json`, `births-history-national.json` | Annual (May) |
| TB notifications | UKHSA | The GOV.UK search API lists UKHSA's official statistics; the edition with the latest end year wins and its England supplementary data tables are fetched | `transform_tb.py` | `tb-notifications.json` | Annual |
| Council Taxbase | MHCLG | The GOV.UK search API finds the newest "Council Taxbase <year> in England" and its local authority level workbook | `transform_council_tax_spd.py` | `council-tax-spd.json` | Annual (November) |
| Adult social care | DHSC | The GOV.UK search API finds the newest "Adult social care finance report, England" and "Adult social care activity report, England" separately, then each one's data tables | `tests/test_asc_schema.py` then `transform_asc.py` | `asc-dashboard.json` | Annual (October, activity can slip) |
| Special educational needs | DfE | The explore education statistics API (`https://api.education.gov.uk/statistics/v1`) finds the newest release of `special-educational-needs-in-england` and queries its two data sets | `transform_send.py` | `send-dashboard.json` | Annual (June) |

Fetch scripts are under `scripts/fetch/`, transforms under `scripts/transform/`, and outputs under `src/data/live/`.

After the ingests, the workflow compares the MP list with the Parliament Members API (`https://members-api.parliament.uk/api`). That step never commits. It keeps one issue, "MP list differs from Parliament", open while the two differ.

## How every fetch behaves

- **One request per file.** A refusal or an error is recorded, not retried. No fetch retries with another user agent.
- **One user agent.** Every request carries `ukdemographics-data-fetch`, set in `scripts/lib/retrieval-log.mjs`.
- **robots.txt first.** Each fetch reads the host's robots.txt before its other requests and stops on a disallow.
- **Every attempt is recorded** in `data/raw/manifests/<dataset>.json`, with the URL, time, outcome, HTTP status, robots status, SHA-256 and size. Stop and search is refetched in full every week, so `police_stops.json` keeps a one-line summary per run and the full per-file attempts of the latest run only.
- **Never the Nomis dataset API.** Its robots.txt disallows it; see `scripts/lib/nomis-guard.mjs`.

Stop and search spaces its requests two seconds apart. On 4 November 2026 data.police.uk answered HTTP 429 to 5 of 92 back-to-back requests. The fetch stops with exit 1 if any listed force-month fails, so no total is published with a force missing.

## When a run goes red

There are two ways, and each opens an issue labelled `refresh-failed`.

- **An ingest failed.** The workflow keeps one open issue titled "Data refresh: an ingest failed". It names each failed ingest and quotes the end of its fetch and transform logs. Each fetch names the publisher and the URL it could not use. The issue is rewritten on every failing run and closed by the first run in which all six ingests pass.
- **The refreshed data failed `npm test`.** The data is pushed to a `data/refresh-failed-<date>` branch instead of main, and an issue titled "Data refresh failed the tests (<date>)" links the run and the branch.

To tell whose fix it is, open the publisher's page named in the log. A moved file, a renamed sheet or column, or a new edition's layout is the script's to fix: change the script and add a fixture test for the new shape, as `tests/test_asc_schema.py` does for the DHSC workbook. A withdrawn file, a gated page or a refusal is the publisher's: the fetch should fail with a message naming the publisher and the URL, and the dataset waits.

## Running it locally

Use Node 22 and Python 3.11 with the workflow's packages:

```bash
python3 -m pip install pandas==2.2.3 odfpy==1.4.1 openpyxl==3.1.5
```

Then run each fetch and its transform in the workflow's order, and `npm test` last. For example:

```bash
node scripts/fetch/fetch-dhsc-asc.mjs
```

```bash
python3 -m unittest discover -s tests -p test_asc_schema.py
```

```bash
python3 scripts/transform/transform_asc.py
```

A local run writes to the manifests. Commit them only with the data they describe, as the workflow does.

## Datasets that need a key

The workflow sets no secrets and none of the steps below runs in it today. Adding a repository secret on its own changes nothing: a workflow step that reads it has to be added as well.

### DWP Stat-Xplore: `STATXPLORE_API_KEY`

Four fetch scripts read this environment variable and stop with exit 2 when it is missing.

| Fetch | Raw file | Transform | Output |
|---|---|---|---|
| `fetch-nino.mjs` | `data/raw/supplementary/nino-statxplore-cube.json` | `transform_nino.py` | `nino-dashboard.json` |
| `fetch-nino-demographic.mjs` | `data/raw/supplementary/nino-demographic-cube.json` | `transform_nino_demographic.py` | `nino-demographic-profile.json` |
| `fetch-nino-historical.mjs` | `data/raw/supplementary/nino-by-year/<year>.json` | `transform_nino_historical.py` | `nino-historical.json`, `nino-nationality-history.json` |
| `fetch-pip-pcon.mjs` | `data/raw/supplementary/pip-pcon-latest.json` | `transform_pip_pcon.py` | `pip-pcon.json` |

To create the key:

1. Register for a free account at `https://stat-xplore.dwp.gov.uk/webapi/jsf/login.xhtml`.
2. Confirm the account from the email Stat-Xplore sends.
3. Sign in, open Tools, then Open Data API, and copy the key.

To store it, open the repository's Settings, then Secrets and variables, then Actions. Choose New repository secret, name it `STATXPLORE_API_KEY` and paste the key. Nobody else needs to see the value, and it should never be printed in a log or a file.

Once the secret exists, a step can pass it to these four scripts with `env: STATXPLORE_API_KEY: ${{ secrets.STATXPLORE_API_KEY }}`. Wire each one as a secondary ingest like the six above: a fetch, a transform and a restore step, all listed in the ingest-failed issue step. Before they run weekly, these four scripts should be moved onto the shared fetch helper. They do not yet send the neutral user agent or write a manifest.

### Companies House: no key name

No script reads a Companies House key. `scripts/fetch_transform_companies_house_psc.py` downloads the free persons with significant control bulk snapshot from `download.companieshouse.gov.uk` without one. Its URL names one snapshot date (28 April 2026), and it is not in the workflow. A Companies House REST API key comes from `https://developer.company-information.service.gov.uk/`. If a script ever uses one, that script sets the secret's name.

### HM Land Registry: no key name

No script in this repository fetches from HM Land Registry, so there is no key name to set. If one is added, the script sets the secret's name and this page should list it.
