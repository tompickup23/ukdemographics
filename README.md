# UK Demographics

Source for [ukdemographics.co.uk](https://ukdemographics.co.uk/), an independent demographic research project. The site publishes population estimates, Census tables and projections for local authorities in England and Wales, with county, region and Westminster constituency pages, maps, findings and downloadable data.

Every published figure names its source. The site lists them at [/sources/](https://ukdemographics.co.uk/sources/) and offers the observed figures as CSV at [/data/](https://ukdemographics.co.uk/data/).

## Coverage

Coverage counts are never typed into copy. `src/lib/coverage.ts` derives them from the datasets the pages render, and `tests/coverage.test.ts` pins them: 318 local authorities with a place page, and 631 of the 650 Commons seats with a constituency page. A dataset change that moves either count fails that test and has to be an explicit decision.

## Stack

- Astro static build with TypeScript. Versions are in `package.json`.
- Design tokens in plain CSS (`src/styles/global.css`). No Tailwind.
- Charts and maps are inline SVG. No chart library.
- Hosted on GitHub Pages at the domain in `CNAME`.
- GitHub Actions on Node 22 run the unit tests, the type check, the build and the Playwright layout tests on every pull request (`.github/workflows/site-checks.yml`) and again before each deploy (`deploy.yml`).

## Commands

```bash
npm ci                 # install the locked dependencies
npm run dev            # local dev server
npm test               # unit tests (vitest)
npm run check          # astro check, strict TypeScript
npm run build          # static build into dist/
npm run test:mobile    # Playwright layout tests, phone viewport
npm run test:desktop   # Playwright layout tests, desktop viewport
```

`npm run build` first runs `scripts/check/county-reconciliation.mjs`, which verifies the pinned county Census sources. The share card pass is skipped unless `BUILD_OG=1` is set, as it is in CI.

## Data and sources

- `src/data/live/` holds the committed JSON the pages read. Most files record their source and the date they were last updated.
- `data/raw/manifests/` holds one manifest per refreshed dataset: publisher, release, where the file was found and its hash. Most raw downloads are gitignored.
- `data/geography/` holds the boundary file the maps read, with its fetch script and source record.
- `data/model/INPUTS.json` lists the projection model's inputs with a hash for each.
- The `Refresh data` workflow runs every Monday at 08:00 UTC. `docs/REFRESH.md` describes what it does and `docs/refresh-ledger.md` has one row per run.
- The Nomis dataset API is not used. `scripts/lib/nomis-guard.mjs` stops the scripts that once called it, and the Census tables are held as committed JSON.

## The projection model

The model code is in `scripts/model/`. `docs/model/RUN_ORDER.md` gives the order the scripts run in, and `docs/model/V81_READINESS.md` records what is ready and what blocks the next version. The published validation and its limits are on the site's [/methodology/](https://ukdemographics.co.uk/methodology/) page, which is the place to quote from. `docs/data-currency-audit-2026-08-13.md` is the record of the August 2026 model audit.

## Repository layout

| Path | What it holds |
|---|---|
| `src/pages/` | Routes: place, county, region and constituency pages, dashboards, findings, maps, data downloads, sitemaps |
| `src/components/`, `src/layouts/` | Astro components and page shells |
| `src/lib/` | Data access, coverage counts, search listings, the map renderer (`src/lib/map/`) |
| `src/content/findings/` | The findings, as Markdown with a fixed schema |
| `src/data/` | Live datasets and lookups |
| `scripts/fetch/`, `scripts/transform/`, `scripts/build/` | Fetches, transforms and derived-file builders |
| `scripts/model/` | The projection model and its validation |
| `tests/` | Unit tests, Playwright specs and the Python schema test for the adult social care workbook |
| `docs/` | Refresh notes, model notes, the search listing test and correction records |
| `public/` | Static assets |

`docs/product/`, `docs/research/` and `docs/build/` hold planning notes from the sister site asylumstats.co.uk, kept for context. `docs/product/README.md` explains why. They are not a plan for this site.

## Conventions

`CLAUDE.md` (also linked as `AGENTS.md`) is the working reference: key surfaces, the map module, CI and deploy, house rules and the refresh scripts. Read it before changing anything.
