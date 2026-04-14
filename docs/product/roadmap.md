# Roadmap

## Current state as of 2026-03-14

The repo has moved past concept stage.

Live now:

- official national and local route marts
- hotel entity ledger with owner and operator evidence
- public money ledger with prime-provider scope, funding instructions, and scrutiny cost rows
- Astro pages for home, compare, routes, hotels, spending, sources, and methodology
- fixed two-panel place entry surfaces on home, `/places/`, and region pages
- Britain -> region -> subregion -> authority drilldown with reversible zoom controls
- desktop/tablet inset controls for dense Britain-map clusters

The job is no longer to prove the idea. It is to harden the live interaction model across the whole site and deepen the ledgers behind it.

## Phase 1: current accountability MVP

Already in place:

- national asylum and refugee route split
- local authority asylum-support comparison
- named and unnamed hotel evidence tracker
- owner/operator/entity coverage on hotel rows
- prime-provider mapping for visible current hotels
- public money ledger with route labels and supplier profiles
- source and methodology pages with hard scope rules
- staged geographic drilldown on the main place-entry surfaces

Main weaknesses still inside the MVP:

- the stronger place drilldown system is not yet carried consistently across compare, hotels, and spending
- county/cluster geography is still stronger in some regions than others
- right-hand place and region panels still need richer comparative visual treatment
- local response contracts are largely missing
- several refugee funding instruction tables still need full normalization
- subcontractor and council procurement joins are still thin

## Phase 2: finish the spatial analysis system

Build next:

- extend the same fixed-panel navigation model into compare, hotels, and spending
- add county- or cluster-aware geographic treatment beyond the current inset cards, starting with long regions
- strengthen place and region decks with clearer comparative visuals and more explicit story framing
- keep mobile on the simpler uncluttered interaction path while desktop/tablet carry denser navigation aids

## Phase 3: deepen the money layer

Build next:

- normalize tariff and grant tables from UK resettlement, Afghan, and Homes for Ukraine funding instructions
- add local response contracts tied to named hotels, refugee placement, or humanitarian response
- ingest council and wider public-body procurement only where the route or scheme link is explicit
- create supplier pages that combine prime providers, hotel entities, and public money rows
- add a clear split between `published value`, `tariff rate`, `forecast`, and `derived estimate`

## Phase 4: extend the site and supplier chain

Add:

- generated area pages from live route, hotel, and money marts
- subcontractor and service-vendor ledger
- hotel-owner and property-vehicle expansion
- supplier network views using AI DOGE integrity techniques
- secrecy-gap ranking by area and provider region

## Phase 5: archive and investigative advantage

Add:

- North West and other regional archive recoveries
- archive-labelled historical backfills
- CRM-driven investigation workflow for hotels, suppliers, owners, and FOIs
- integrity-led case files for repeated owner groups, operators, or procurement clusters
- editorial analysis snippets tied to each release and ledger update

## What not to do next

- do not collapse tariffs, forecasts, and actual spend into one number
- do not publish generic council procurement as asylum or refugee money without an explicit route link
- do not treat parliamentary hotel references as fully confirmed current sites without stronger corroboration
- do not let frontend components take over transformation logic that now lives cleanly in scripts
- do not rebuild the repo from scratch when the current live marts already define the working shapes
