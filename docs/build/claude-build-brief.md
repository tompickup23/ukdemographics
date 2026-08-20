# Claude build brief

Extend the existing `asylumstats` repo. Do not rebuild it from scratch.

## What already works

The repo already has:

- an Astro site scaffold that builds cleanly
- live official route marts
- a live hotel entity ledger
- a live public money ledger
- working pages for home, compare, routes, hotels, spending, sources, and methodology

Current live data outputs include:

- `src/data/live/route-dashboard.json`
- `src/data/live/local-route-latest.json`
- `src/data/live/hotel-entity-ledger.json`
- `src/data/live/hotel-area-sightings.json`
- `src/data/live/money-ledger.json`

Current transform scripts include:

- `scripts/transform/transform-routes.mjs`
- `scripts/transform/transform-hotel-entities.mjs`
- `scripts/transform/transform-money-ledger.mjs`

## Current repo state you should preserve

Product rules already encoded:

- small boats are not a refugee scheme
- asylum support, Afghan schemes, UK resettlement, family reunion, and Homes for Ukraine stay split where possible
- hotel lists are treated as incomplete public-evidence ledgers, not official estate registers
- owner, operator, and prime provider are separate roles
- public money rows distinguish route-specific, local-route-relevant, and context-only material
- generic council finance stays out of public asylum/refugee charts unless explicitly promoted

## Working outputs as of 2026-02-28

- route layer: `13,482` canonical observations across `361` areas
- hotel layer: `9` named sites, `4` current named sites, `4` entity links, `4` integrity signals, `3` unnamed-only areas
- money layer: `11` public rows, `6` rows with published GBP values, `9` supplier or public-body profiles

## Most important next build steps

1. Replace the remaining mock place pages with generated pages from live marts.
2. Build supplier detail pages from the money ledger and hotel entity ledger.
3. Add contract or money-record detail pages.
4. Deepen the money ledger with local response contracts and more tariff normalization.
5. Extend hotel pages toward site detail pages and owner-group recurrence views.

## Files to treat as source of truth

Core docs:

- `README.md`
- `docs/product/asylum-data-scope.md`
- `docs/product/site-plan.md`
- `docs/product/data-architecture.md`
- `docs/product/follow-migrants-follow-money.md`
- `docs/product/hotel-tracker-plan.md`
- `docs/product/roadmap.md`

Core live data and transforms:

- `src/data/live/*.json`
- `data/manual/asylum-contract-ledger.csv`
- `data/manual/hotel-entity-links.csv`
- `data/manual/hotel-integrity-signals.csv`
- `data/hotel-source-ledger.csv`
- `scripts/transform/transform-routes.mjs`
- `scripts/transform/transform-hotel-entities.mjs`
- `scripts/transform/transform-money-ledger.mjs`

Core loaders and pages:

- `src/lib/route-data.ts`
- `src/lib/hotel-data.ts`
- `src/lib/money-data.ts`
- `src/pages/index.astro`
- `src/pages/routes.astro`
- `src/pages/hotels.astro`
- `src/pages/spending.astro`

## What to build next in code

### 1. Generated place pages

Create page-ready place marts that merge:

- route pressure
- hotel evidence
- money-ledger rows
- supplier summaries

Replace the remaining mock content under `src/pages/places/`.

### 2. Supplier detail pages

Use `money-ledger.json` supplier profiles as the starting point.

Each supplier page should show:

- supplier role
- linked sites
- route families
- public money rows
- integrity signals where applicable
- unresolved gaps

### 3. Money detail pages

Create detail views for public money rows so the user can inspect:

- source
- row type
- route family
- whether the number is a total, tariff, forecast, or cost indicator
- linked sites or suppliers

### 4. Keep the tone and logic

Do:

- keep the accountability tone sharp and evidence-first
- keep charts and tables close to their source links
- keep caveats visible
- keep route separation explicit

Do not:

- flatten tariffs and forecasts into fake spend totals
- redesign the site into a generic dashboard
- remove the hotel secrecy-gap framing
- replace live marts with broad new mocks

## Build commands that currently work

- `npm run ingest:routes`
- `npm run ingest:hotels`
- `npm run ingest:money`
- `npm run build`

`npm run check` is not yet usable without installing `@astrojs/check` and `typescript`.

## Outcome expected from your next pass

After your pass, the repo should have:

- generated live place pages
- reusable supplier and money-detail routes
- deeper public money coverage
- no regression in source labeling or scope discipline
