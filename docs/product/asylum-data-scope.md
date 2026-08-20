# Asylum and refugee data scope

This project should publish route-specific asylum and refugee accountability data, not generic public-sector data with an asylum wrapper.

## Public scope classes

### `route_specific`

Publish directly on public pages.

Includes:

- small boat or other irregular asylum-route figures
- asylum support totals and hotel accommodation figures
- refugee resettlement scheme totals
- Afghan Resettlement Programme figures
- UK Resettlement Scheme and related scheme totals where published
- Refugee Family Reunion route figures
- Ukraine humanitarian-route figures where clearly labelled

### `local_route_relevant`

Publish publicly, but keep separate from national totals.

Includes:

- council statements naming asylum hotels
- FOIs on hotel use or hotel closure
- planning or licensing papers explicitly tied to asylum accommodation
- local public documents explicitly tied to Afghan, Ukraine, or other refugee-route housing and service response

### `context_only`

Keep as research infrastructure unless a specific row can be promoted.

Includes:

- whole-council spending ledgers
- generic council procurement feeds
- whole-body budget totals
- generic supplier profiles not yet tied to a route or scheme

## Critical route rule

Never collapse these into one undifferentiated “migrant” or “refugee” count:

- small boat arrivals
- asylum seekers receiving support
- refugee resettlement schemes
- Refugee Family Reunion
- Ukraine humanitarian routes

Small boat arrivals are an irregular asylum route, not a refugee scheme.

## Inclusion test

A dataset, row, or fact should only appear on public route charts if at least one of the following is true:

- the source explicitly identifies an asylum route, refugee scheme, family route, or humanitarian route
- the source is a local public document explicitly referring to asylum accommodation or a named refugee or humanitarian scheme
- the metric is a documented derived estimate built only from route-specific inputs

If not, keep it as `context_only`.

## Product implication

This means:

- the spending page shows route-specific contract and hotel cost material only
- the hotel page stays focused on the asylum accommodation estate
- compare pages should eventually let users switch between asylum support, small boats, Afghan programme, UK resettlement, and Ukraine routes
- council accountability models remain useful, but are background context until rows are tied to a route or scheme

## Current repo status

As of the latest repo pass:

- public pages now use live `route_specific` and `local_route_relevant` marts for routes, hotels, and the public money ledger
- the live Lancashire council model remains in the repo as `context_only` infrastructure
- the public money ledger mixes prime-provider scope, funding instructions, and scrutiny cost rows, but still excludes generic council procurement unless explicitly promoted
