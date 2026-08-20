# Follow Migrants, Follow The Money

This product should join three systems that are usually reported separately:

- `route and scheme movement`
- `site and accommodation infrastructure`
- `entity, supplier, and ownership chains`

That is the core product edge.

## What the site should track

### 1. People and routes

Track, separately:

- small boat arrivals
- asylum support stock
- contingency accommodation stock
- Afghan Resettlement Programme
- UK resettlement schemes and predecessor schemes
- Community Sponsorship
- Refugee Family Reunion
- Homes for Ukraine and wider Ukraine routes where clearly labelled

### 2. Sites and places

Track:

- named hotels
- unnamed hotel sightings
- local authority route pressure
- contingency concentration
- resettlement concentration
- place-level secrecy gaps

### 3. Money and entities

Track:

- prime Home Office providers
- hotel operators and management companies
- freeholders and property SPVs
- subcontractors and service vendors
- councils and other public bodies with route-linked response costs

## AI DOGE techniques that matter here

The useful AI DOGE inheritance is not the branding. It is the integrity method stack:

- beneficial ownership chain mapping
- company status and shell indicators
- cross-body supplier matching
- property-to-spend linking
- threshold-splitting checks
- temporal clustering around site activation
- director overlap and network scoring
- revolving-door and interest checks
- anomaly detection in repeated local costs
- secrecy-gap tracking

These should become first-class data layers, not blog-post ideas.

## Role of ECA CRM

The CRM-style workflow should be treated as the operational intake layer for:

- hotel-owner leads
- FOIs
- planning documents
- council papers
- supplier/entity resolution
- publication readiness checks

That is a research workflow, not a public source.

## Public publish rules

- Do not publish an owner or operator claim without a strong documentary match.
- Do not publish generic council contracts or spend as asylum or refugee money unless the route link is explicit.
- Publish risk signals with provenance and confidence, not as unsupported allegations.
- Keep official counts, local evidence, and integrity-derived findings visibly separate.

## Minimum entity model

The build should support:

- `asylum_supplier_profile`
- `asylum_contract_award`
- `hotel_owner_link`
- `integrity_signal`

## Current repo status

The starter repo now already has a live first-pass money layer:

- `data/manual/asylum-contract-ledger.csv`
- `scripts/transform/transform-money-ledger.mjs`
- `data/marts/money_ledger/money-ledger.json`
- `src/data/live/money-ledger.json`

That public money ledger currently mixes:

- prime provider regional scope
- official funding instructions
- scrutiny and cost rows

This is deliberate. It is better to show a clearly labelled partial money chain than to pretend the site has clean local actual spend before the evidence exists.

The repo also now has a live hotel entity layer that money rows can connect to:

- `data/manual/hotel-entity-links.csv`
- `data/manual/hotel-integrity-signals.csv`
- `src/data/live/hotel-entity-ledger.json`

## Next money-layer build steps

- normalize the component tariff tables inside refugee and humanitarian funding instructions
- ingest local response contracts tied to named hotels or route-specific response work
- join supplier profiles to generated place pages
- expand supplier profiles from primes and hotel entities into subcontractors and service vendors
- add explicit `published total`, `tariff`, `forecast`, and `derived estimate` display states

## Best public outputs

- site pages showing route pressure plus hotel evidence
- supplier pages showing role, geography, and linked sites
- owner pages where evidence is strong enough
- contract pages with route family, value, supplier, and linked sites
- place pages showing who is housing, who is paying, and what is being hidden
