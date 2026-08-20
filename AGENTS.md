# asylumstats.co.uk — Agent Guide

## What This Is

UK asylum and refugee accountability site. Astro 5 static site deployed to GitHub Pages at asylumstats.co.uk. Tracks asylum support, hotel secrecy, public money, and local area pressure using official GOV.UK statistics, Companies House data, council evidence, and parliamentary scrutiny reports.

## Architecture

- **Framework:** Astro 5 static site (zero JS runtime, pure HTML/CSS output)
- **Language:** TypeScript data loaders, Astro components, Node.js transform scripts (.mjs)
- **Hosting:** GitHub Pages via GitHub Actions (`deploy.yml`)
- **Domain:** asylumstats.co.uk (DNS on one.com, A records + CNAME → GitHub Pages)
- **Dependencies:** Only 2 production deps: `astro` and `xlsx`. Dev: `vitest`

## Data Pipeline

```
data/raw/           → scripts/fetch/     → fetches from GOV.UK APIs / xlsx downloads
data/manual/        → hand-curated CSVs  → contract ledger, hotel evidence, entity links
data/canonical/     → scripts/transform/ → normalised intermediate data
data/marts/         → scripts/transform/ → aggregated analysis-ready marts
src/data/live/      → used at build time → Astro pages read these via TypeScript loaders
src/data/mock/      → editorial content  → overview.json (official KPIs), releases.json (diary)
```

### 4 Data Pipelines

| Pipeline | Fetch | Transform | Live Output |
|----------|-------|-----------|-------------|
| Routes | `fetch-routes.mjs` (GOV.UK xlsx) | `transform-routes.mjs` | `route-dashboard.json`, `local-route-latest.json` |
| Hotels | Manual CSVs | `transform-hotel-entities.mjs` | `hotel-entity-ledger.json`, `hotel-area-sightings.json` |
| Money | Manual CSV + live hotel data | `transform-money-ledger.mjs` | `money-ledger.json` |
| LCC | `fetch-lancashire-cc.mjs` | `transform-lancashire-cc.mjs` | Council marts (context only, not public) |

### Shared Utilities

- `scripts/lib/csv-parser.mjs` — RFC 4180 CSV parser, `readCsv()`, `fileSha256()`, `hashId()`. Used by both transform scripts.

## Key File Locations

### Pages (src/pages/)
| File | Purpose |
|------|---------|
| `index.astro` | Homepage: KPIs, route cards, top areas, hotel sites, money preview |
| `routes.astro` | Route dashboard: national snapshot, route families, illegal entry methods |
| `hotels.astro` | Hotel tracker: entity resolution, named sites, secrecy gap analysis |
| `spending.astro` | Money ledger: contract records, supplier profiles, integrity techniques |
| `compare.astro` | Area comparison: side-by-side local authority metrics |
| `places/[code].astro` | Per-area pages (147 areas from live data, ≥200 supported asylum) |
| `councils/[body].astro` | Council detail (LCC only, context infrastructure) |
| `councils/index.astro` | Council catalog |
| `sources.astro` | Source ledger with scope labels |
| `methodology.astro` | Methodology and editorial rules |
| `releases.astro` | Release diary |

### Data Loaders (src/lib/)
| File | Purpose |
|------|---------|
| `route-data.ts` | `loadRouteDashboard()`, `loadLocalRouteLatest()` — typed interfaces for 361 areas |
| `hotel-data.ts` | `loadHotelEntityLedger()` — sites, areas, entity links, integrity signals |
| `money-data.ts` | `loadMoneyLedger()` — records, supplier profiles, investigative leads |
| `council-data.ts` | `getCouncilSnapshots()` — LCC spending/budget analysis |

### Components
| File | Purpose |
|------|---------|
| `KpiCard.astro` | Reusable KPI card with label, value, context, source link |
| `SiteHeader.astro` | Navigation header (8 nav items) |
| `BaseLayout.astro` | Base HTML layout with fonts, prototype banner |

### Styles
- `src/styles/global.css` — Warm cream/earth tones, glassmorphism panels, responsive at 820px

## Build Commands

```bash
# Dev server
npm run dev

# Production build (157 pages, ~900ms)
npm run build

# Run tests (26 tests, 3 files)
npm test

# Type check
npm run check

# Data ingestion
npm run ingest:routes      # Fetch + transform routes
npm run ingest:hotels      # Transform hotel entities
npm run ingest:money       # Transform money ledger
npm run ingest:lancashirecc # Fetch + transform LCC data
```

## Tests

- **Framework:** Vitest v4
- **Config:** `vitest.config.ts`
- **Location:** `tests/`
- **Current:** 26 tests across 3 files (csv-parser, data-loaders, source-scope)
- **Run:** `npm test` or `npx vitest run`

## Deployment

Push to `main` triggers `.github/workflows/deploy.yml`:
1. `npm ci` → `npm run build` → upload `dist/` artifact → deploy to GitHub Pages

Weekly data refresh: `.github/workflows/refresh-data.yml` (manual dispatch or Monday 8am cron):
1. Runs all 3 public ingestion pipelines → auto-commits changed data

## Critical Rules

1. **Scope discipline is law**: Only `route_specific` and `local_route_relevant` content on public pages. Generic council spending stays as `context_only` background infrastructure.
2. **Source provenance on every claim**: Every KPI, chart, and data point must have a `sourceUrl` linking to the original official publication.
3. **Do NOT reference AI DOGE or ECA CRM**: These are internal research tools. All published content must be self-standing. Tests enforce this.
4. **Do NOT publish Lancashire council spending as asylum data**: The LCC layer is context infrastructure only.
5. **Mock data is editorial content**: `overview.json` contains real official statistics hand-curated with source URLs. `releases.json` is a manually curated diary. Both are fine to keep and update.
6. **Large data files are gitignored**: LCC spending chunks (~760MB) are excluded. Run `npm run ingest:lancashirecc` to regenerate.
7. **CSV parser is shared**: Use `scripts/lib/csv-parser.mjs` — do not duplicate.
8. **Test before push**: `npm run build && npm test` should both pass.

## Data Stats (current)

- **Route data:** 13,482 observations across 361 local authority areas
- **Hotel entity ledger:** 9 named sites, 4 current, 4 entity links, 4 integrity signals, 3 unnamed-only areas
- **Money ledger:** 11 records, 9 supplier/body profiles, investigative leads
- **LCC context layer:** 753,220 transactions (20 monthly files, context only)
- **Place pages:** 147 generated from live data (areas with ≥200 supported asylum)

## Next Priorities for Improvement

1. **More live data**: Deeper normalisation of refugee funding instruction tariff tables
2. **Local procurement**: Council procurement tied to named hotels or schemes
3. **Subcontractor ingestion**: Expand supplier network beyond prime providers
4. **Charts**: Add Observable Plot or similar for route trends, area comparisons
5. **Map integration**: MapLibre or Leaflet for geographic visualisation of hotel locations and area pressure
6. **More tests**: E2E tests, transform script output validation
7. **SEO**: Add OpenGraph meta tags, structured data, sitemap.xml
8. **Accessibility audit**: Screen reader testing, ARIA labels on data tables
9. **Performance**: Consider image optimisation, font subsetting
10. **Content expansion**: More editorial content for releases, place page narratives

## Editorial Position

The site is an accountability product aimed at:
- Home Office secrecy and opacity
- Expensive hotel dependence
- Uneven geographic concentration
- Slow decision-making that keeps people in temporary accommodation
- Opaque contractor performance and public spending

It is NOT anti-migrant. The "scandalous" energy goes toward waste, opacity, and system failure — not toward asylum seekers.
