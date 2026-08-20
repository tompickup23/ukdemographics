# Data architecture

## Current working architecture

The repo is already running a simple static architecture that works for GitHub hosting and public-source provenance.

- Site: `Astro`
- Processing: `node` transform scripts
- Inputs: CSV, JSON, XLSX, ODS, and manual ledgers
- Canonical outputs: `NDJSON`
- Public page inputs: small `JSON` marts in `src/data/live/`

This is good enough for the current phase. Do not rewrite it just to match an abstract preferred stack.

## Current repository shape

```text
asylumstats/
  src/
    components/
    data/
      live/
      mock/
    layouts/
    lib/
    pages/
  data/
    raw/
    manual/
    canonical/
    marts/
  docs/
  scripts/
    fetch/
    transform/
  schemas/
```

## Data flow now

1. Source or curate raw inputs.
   Official downloads go in `data/raw/`. Manual ledgers and evidence files go in `data/manual/`.
2. Transform to canonical rows.
   Scripts write `NDJSON` and manifests into `data/canonical/`.
3. Export page-ready marts.
   Scripts write compact JSON slices into `data/marts/` and mirror live copies into `src/data/live/`.
4. Load from `src/lib/*`.
   Astro pages consume live marts through thin loader files instead of embedding transformation logic.

## Live marts currently in play

### `uk_routes`

Purpose:

- official route and scheme statistics
- national cards
- local authority comparison rows

Key outputs:

- `data/canonical/uk_routes/`
- `data/marts/uk_routes/`
- `src/data/live/route-dashboard.json`
- `src/data/live/local-route-latest.json`

### `hotel_entities`

Purpose:

- named hotel evidence
- unnamed area sightings
- owner/operator links
- hotel integrity signals

Key outputs:

- `data/canonical/hotel_entities/`
- `data/marts/hotel_entities/`
- `src/data/live/hotel-entity-ledger.json`
- `src/data/live/hotel-area-sightings.json`

### `money_ledger`

Purpose:

- public money rows covering prime contract scope, funding instructions, and scrutiny cost indicators
- supplier and public-body profiles
- investigative leads

Key outputs:

- `data/canonical/money_ledger/`
- `data/marts/money_ledger/`
- `src/data/live/money-ledger.json`

### `lancashire_cc`

Purpose:

- background council-accountability infrastructure
- whole-council spend, budgets, mappings, and procurement context

Key outputs:

- `data/canonical/lancashire_cc/`
- `data/marts/lancashire_cc/`

This remains `context_only` until individual rows are explicitly tied to asylum or refugee routes.

## Core canonical contracts

### `canonical_observation`

Use for:

- official time series
- local authority and national route observations

### `hotel_site`

Use for:

- named current and historical sites
- parliamentary references
- public-evidence hotel records

### `hotel_owner_link`

Use for:

- freeholder, owner-group, operator, manager, and brand-operator links to sites

### `integrity_signal`

Use for:

- entity-resolution gaps
- ownership complexity
- secrecy-gap flags
- other publishable integrity findings

### `asylum_contract_award`

Current role:

- broad public money record contract for the starter ledger

Current record types:

- `prime_contract_scope`
- `funding_instruction`
- `scrutiny_estimate`
- `cost_indicator`
- `local_response_contract`

This is broader than the filename suggests. That is acceptable for now because the public money ledger is still being assembled from mixed official and evidence-led sources. If the ledger grows substantially, split it later into separate contract and funding tables.

### `asylum_supplier_profile`

Use for:

- prime providers
- hotel operators
- freeholders and owner groups
- public bodies receiving or administering route-linked funding

## Manual ledgers that matter

### `data/manual/hotel-entity-links.csv`

Use for:

- documentary owner/operator matches
- company numbers
- confidence-backed site-to-entity links

### `data/manual/hotel-integrity-signals.csv`

Use for:

- publishable hotel integrity findings

### `data/manual/asylum-contract-ledger.csv`

Use for:

- starter public money rows
- route-linked funding instructions
- scrutiny cost and forecast rows
- prime-provider regional scope

## QA rules

Minimum rules:

- one canonical record per stable source row or curated ledger row
- every public money row must carry a scope class
- route-specific funding rows must not be presented as actual spend totals unless they truly are totals
- hotel entity links need a confidence label and a source trail
- integrity signals must read like evidence-backed findings, not accusations
- generic council procurement must stay out of the public route layer until explicitly promoted

## Build and refresh commands

Current working commands:

- `npm run ingest:routes`
- `npm run ingest:hotels`
- `npm run ingest:money`
- `npm run ingest:lancashirecc`
- `npm run build`

## Next architectural step

Do next:

1. Add generated area marts that merge route, hotel, and money slices per place.
2. Add supplier detail marts keyed by supplier ID.
3. Add local response contract ingestion.
4. Keep manual ledgers small, explicit, and reviewable until automated extraction is strong enough to replace them safely.
