# asylumstats.co.uk project pack

This folder is a build-ready planning pack and starter repo for a UK asylum and refugee accountability site.

It is designed around a static GitHub-hosted website with a repeatable data build, strong source provenance, and room for both official statistics and recovered regional archive series, local authority hotel evidence, and cost/accountability reporting.

## What is in here

- `docs/research/data-sources.md`: current source landscape, including official releases, regional partnerships, and funding/spend inputs.
- `docs/research/hotel-and-accountability-sources.md`: current hotel, cost, contractor, and secrecy source landscape.
- `docs/research/lancashire-ai-doge-review.md`: review of the current Lancashire / AI DOGE data platform and what should be reused.
- `docs/research/competitors.md`: competitor review and product gaps to exploit.
- `docs/research/archival-recovery.md`: how to recover older regional partnership series from web archives without breaking provenance.
- `docs/product/accountability-plan.md`: product strategy for investigative and accountability features.
- `docs/product/asylum-data-scope.md`: hard rules for what counts as route-specific asylum or refugee data, local route-relevant evidence, or context only.
- `docs/product/council-platform-model.md`: reusable council-accountability platform model derived from the Lancashire implementation.
- `docs/product/lancashire-ingestion-plan.md`: phased ingestion plan for spending, budgets, contracts, meetings, elections, and integrity data.
- `docs/product/hotel-tracker-plan.md`: data strategy for building a named-site and area-sightings hotel tracker.
- `docs/product/follow-migrants-follow-money.md`: entity, supplier, ownership, and integrity design for the money layer.
- `docs/product/data-architecture.md`: recommended repository layout, canonical data model, QA, and update flow.
- `docs/product/site-plan.md`: page structure, chart ideas, UX direction, and differentiation.
- `docs/product/roadmap.md`: phased delivery plan.
- `docs/build/claude-build-brief.md`: compact handoff brief for Claude to implement the repo.
- `data/manual/asylum-contract-ledger.csv`: starter public ledger for contract-scope, funding-instruction, and scrutiny cost rows.
- `data/manual/hotel-entity-links.csv`: manual owner and operator evidence for named hotel sites.
- `data/manual/hotel-integrity-signals.csv`: starter integrity findings with source trails.
- `data/source-catalog.csv`: source registry for ingestion planning.
- `data/canonical-metrics.csv`: starter metric catalog.
- `data/council-domain-catalog.csv`: domain inventory for the wider council-accountability platform.
- `data/council-source-catalog.csv`: source and API review for Lancashire / AI DOGE style datasets.
- `data/asylum-integrity-techniques.csv`: technique catalog for supplier, ownership, and integrity signals.
- `data/hotel-source-ledger.csv`: example evidence ledger for named and unnamed hotel sightings.
- `schemas/*.json`: canonical observation contracts for transformations.
- `schemas/asylum_supplier_profile.schema.json`, `schemas/asylum_contract_award.schema.json`, `schemas/hotel_owner_link.schema.json`, and `schemas/integrity_signal.schema.json`: starter entity and integrity contracts for the money layer.

## Recommended build direction

- Site framework: `Astro` or `Next.js` with static export.
- Data build: `Python + DuckDB + Parquet`.
- Charts: `Observable Plot` for line/bar/rank charts and `MapLibre` or static SVG for geography.
- Hosting: `GitHub Pages` or a static host with GitHub Actions.
- Update model: scheduled Action plus manual dispatch for release days.

## Product position

The site should not be another generic migration dashboard. It should be the best public place to:

- compare any UK area against peers and the national picture
- track asylum and refugee trends over time
- expose the hidden and shifting hotel estate
- track where costs, secrecy, and pressure are concentrated
- separate official counts from estimates and archive recoveries
- explain what changed, not just show charts
- make methodology and source provenance obvious on every chart

## Public data scope

The public product should only publish:

- `route_specific` sources such as small boat arrivals, asylum support totals, hotel counts, refugee resettlement schemes, Refugee Family Reunion, and clearly labelled Ukraine humanitarian-route data
- `local_route_relevant` evidence such as council statements, FOIs, and planning records explicitly referring to asylum hotels, refugee housing, Afghan arrivals, or Ukraine arrivals

It should not publish generic council spending, budgets, or procurement as if those were route-specific asylum or refugee spending.

Those wider council models can remain in the repo, but only as `context_only` infrastructure until specific rows are tied back to a route or scheme.

## Platform direction

The asylum site should sit on top of a broader accountability data platform, not a one-off dataset folder.

The current Lancashire / AI DOGE implementation already proves the broader platform can cover:

- spending transactions and fast search indexes
- budgets and GOV.UK finance outturns
- procurement notices
- meetings and voting records
- councillor and integrity datasets
- elections, wards, and geography
- cross-council supplier profiles

The new Lancashire modelling files in this repo are there to turn that practical experience into a cleaner canonical system.

## Live Lancashire layer

The repo now includes a real first-pass canonical ingestion for `Lancashire County Council`.

Run the current repo with:

- `npm run fetch:lancashirecc`
- `npm run transform:lancashirecc`
- `npm run ingest:lancashirecc`
- `npm run fetch:routes`
- `npm run transform:routes`
- `npm run ingest:routes`
- `npm run transform:hotels`
- `npm run ingest:hotels`
- `npm run transform:money`
- `npm run ingest:money`

Current outputs:

- raw files in `data/raw/lancashire_cc/`
- raw manifest in `data/raw/manifests/lancashire_cc.json`
- canonical outputs in `data/canonical/lancashire_cc/`
- marts in `data/marts/lancashire_cc/`
- live council pages at `/councils` and `/councils/lancashire-cc`

The current marts are designed to expose weak spots, not hide them. As of the latest run they show:

- `753,220` transaction rows across `20` monthly files
- a missing upstream monthly file for `2024-08`
- `GBP 255.0 million` tied to supplier labels containing `REDACT*`
- budget mapping coverage of `59.5%`
- a `GBP 127.8 million` difference between the upstream mapping layer total and the canonical transaction corpus

That Lancashire layer is useful as background accountability infrastructure, but it is not part of the public route-specific spend layer.

## Live route, hotel, and money layers

The public product is no longer mock-only.

Current live marts now include:

- `data/marts/uk_routes/` and `src/data/live/route-dashboard.json`
- `data/marts/hotel_entities/` and `src/data/live/hotel-entity-ledger.json`
- `data/marts/money_ledger/` and `src/data/live/money-ledger.json`

As of the latest run:

- the route layer contains `13,482` canonical observations across `361` areas
- the hotel entity layer contains `9` named sites, `4` current named sites, `4` entity links, `4` integrity signals, and `3` unnamed-only areas
- the public money layer contains `11` rows, `6` rows with explicit published GBP values, and `9` supplier or public-body profiles

The money layer is intentionally broad at this stage. It combines:

- current prime-provider regional scope
- official funding instructions and tariff components
- scrutiny and cost rows such as the `GBP 15.3 billion` 10-year forecast and `GBP 5.77 million` daily hotel cost

This is deliberate. It gives the public a visible accountability chain now, while local procurement and subcontractor ingestion is still missing.

## Scope: Transparency focus

asylumstats focuses on public spending transparency and demographic data accountability:

- Public spending on asylum accommodation (Home Office published figures)
- Geographic distribution of asylum support (ONS local authority data)
- Demographic projections using Census-observed data (Hamilton-Perry methodology)
- Contractor and provider transparency (published procurement data)

The site is data-driven and sources all claims to official government publications. It does not make policy recommendations or political endorsements.

## Strongest hooks confirmed from current public sources

- On `2026-02-26`, the Home Office said `107,200` people were receiving asylum support at the end of `December 2025`, with `31,000` in hotel accommodation and around `64,000` awaiting an initial decision.
- On `2026-01-23`, the government told the Home Affairs Committee there were `197` asylum hotels in use as of `2026-01-05`, down from more than `400` in summer `2023`.
- On `2024-11-08`, the National Audit Office said hotels housed `35%` of people in asylum accommodation but accounted for `76%` of annual accommodation contract costs in the first seven months of `2024/25`, with the 10-year accommodation contract forecast rising to `GBP 15.3 billion`.
- On `2025-06-12`, the Home Office said hotel use cost `GBP 5.77 million` per day on average in `2024/25`.
- On `2025-11-27`, the latest local-authority asylum and resettlement release publicly available on GOV.UK still showed the year ending `September 2025`, with Glasgow, Birmingham, Liverpool, Hillingdon, and Manchester holding the highest support counts.

## Important data caveat

As of `2026-02-28`, the latest national asylum statistics chapters were published for the year ending `December 2025` on `2026-02-26`, while the latest public local-authority and regional tables surfaced in the researched GOV.UK pages were still the year ending `September 2025`, updated `2025-11-27`. Build the site so release calendars can differ by dataset family.

## Current state (14 Mar 2026)

The site is **live at asylumstats.co.uk** with automated GitHub Pages deployment.

- **183 pages** built from live data
- **147 area place pages** generated from live GOV.UK local authority route data (areas with ≥200 supported asylum)
- Routes, hotels, spending, compare, sources, methodology all use live data
- Homepage, `/places/`, and `/places/regions/*` now use a fixed two-panel drilldown system
- Britain -> region -> subregion -> place drilldown is live on the places entry surfaces, with zoom history and breadcrumb reset
- Desktop and tablet now use inset controls for dense Britain-map clusters such as South East / East of England and London / Midlands
- Mobile stays on a simpler uncluttered raw-map flow
- Homepage uses live top areas, route cards, hotel entity coverage, and money ledger preview
- **26 tests** (vitest) covering CSV parser, data loaders, and source scope integrity
- GitHub Pages deploy now runs `npm test`, `npm run check`, `npm run build`, `npm run test:mobile`, and `npm run test:desktop`
- **Zero references** to AI DOGE or ECA CRM on any published page (enforced by tests)
- Weekly data refresh workflow (manual dispatch or Monday 8am cron)
- See `AGENTS.md` for full agent/developer guide

### Next priorities

- Extend the same map/data-navigation discipline into compare, hotels, and spending so those surfaces stop behaving like separate UI systems
- Add stronger county- and cluster-aware geographic treatment beyond the current inset controls, especially for long English regions
- Upgrade the right-hand place and region panels with richer comparative visuals and clearer auto-written analysis
- Deeper normalization of refugee funding instruction tariff tables
- Local response contracts and council procurement tied to named hotels or schemes
- Subcontractor ingestion and supplier network expansion
- SEO (OpenGraph, structured data, sitemap.xml)
- Accessibility audit (ARIA labels, screen reader testing)
- E2E tests with Playwright against production-critical flows
