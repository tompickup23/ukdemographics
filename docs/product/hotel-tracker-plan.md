# Hotel tracker plan

## What the hotel tracker is for

There is public interest in where hotel use is happening, but the Home Office does not publish a comprehensive named-site list. The tracker should therefore show both what is known and what is withheld.

## Three datasets, not one

### `hotel_national_series`

Purpose:

- national hotel counts
- people in hotels
- share of supported people in hotels
- daily or annual hotel cost where available

Status:

- mostly official

### `hotel_site_ledger`

Purpose:

- named hotel sites
- current or historical status
- evidence type
- confidence
- source URLs

Status:

- public-evidence dataset

### `hotel_area_sightings`

Purpose:

- places where hotel use is publicly confirmed but names may be withheld
- sighting count
- people housed if available
- last confirmation date

Status:

- mixed official and public-evidence

### `hotel_entity_links`

Purpose:

- owner groups
- freeholders
- operator brands
- operator entities
- company numbers
- documentary link confidence

Status:

- public-entity evidence only where the match is strong enough to publish

### `hotel_integrity_signals`

Purpose:

- entity-resolution gaps
- ownership-chain complexity
- parliamentary-reference-only flags
- other AI DOGE-style transparency and integrity signals tied to a named site

Status:

- derived accountability layer with explicit source links

## Evidence classes

Use these values:

- `named_current`
- `named_historical`
- `unnamed_count_only`
- `parliamentary_reference`
- `media_only_provisional`

## Confidence levels

Use these values:

- `high`: council statement, planning papers, official contract or legal documents
- `medium`: FOI response, parliamentary material, public inquiry records
- `low`: media-only without stronger public document

## Key columns

### Site ledger

- `site_id`
- `site_name`
- `site_type`
- `area_name`
- `area_code`
- `region_name`
- `country_name`
- `status`
- `evidence_class`
- `confidence`
- `people_housed_reported`
- `date_first_public`
- `date_last_public`
- `operator_name`
- `source_title`
- `source_url`
- `notes`

### Entity links

- `link_id`
- `site_id`
- `entity_name`
- `company_number`
- `link_role`
- `confidence`
- `evidence_count`
- `source_urls`
- `generated_at`
- `notes`

### Area sightings

- `sighting_id`
- `area_name`
- `area_code`
- `named_site_count`
- `unnamed_site_count`
- `people_housed_reported`
- `date_last_public`
- `source_title`
- `source_url`
- `notes`

## UX rules

- Do not label an area as having zero hotels unless there is direct evidence of zero.
- Instead use `no public evidence logged` where appropriate.
- Let users filter to `current`, `historical`, `named only`, and `unnamed count only`.
- Put evidence links directly in the table, not behind a methodology page.
- Keep `owner`, `operator`, and `prime provider` as separate labels.
- Treat `unresolved ownership/operator` as a publishable transparency finding, not as a reason to suppress the site row.

## Best visual treatment

- accountability KPI row
- named-site table
- secrecy-gap scatter or ranked bars
- timeline of hotel count and cost
- map only if it adds clarity

## Mock-data guidance

The starter repo should include:

- a small named-site ledger with current and historical examples
- an area-sightings table showing that some places have public count data without names
- national hotel/cost headline facts

That is enough to make the product vision obvious even before full ingestion exists.

## Current repo status

The repo now has a first live entity layer:

- `data/hotel-source-ledger.csv` for named-site evidence
- `data/manual/hotel-area-sightings.csv` for named and unnamed area counts
- `data/manual/hotel-entity-links.csv` for owner/operator evidence
- `data/manual/hotel-integrity-signals.csv` for publishable transparency signals
- `scripts/transform/transform-hotel-entities.mjs` to export canonical and live marts
- `src/data/live/hotel-entity-ledger.json` as the public page input

This should be extended with Companies House, land, charge, and planning evidence rather than replaced with a black-box crawler.
