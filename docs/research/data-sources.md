# Data sources

This document focuses on sources that are realistic for a public, repeatable GitHub workflow.

## Core official sources

| Source | What it gives you | Geography | Time pattern | Why it matters | Link |
| --- | --- | --- | --- | --- | --- |
| Home Office immigration system statistics collection | National asylum applications, decisions, grants, returns, support, hotels, resettlement context | UK and national | Quarterly | Anchor national trend lines and context | https://www.gov.uk/government/collections/immigration-system-statistics |
| Data on asylum and resettlement in local authority areas | Local authority counts for asylum seekers receiving support and resettled people | Local authority, region, country | Quarterly | Core place-based comparison data | https://www.gov.uk/government/statistics/data-on-asylum-and-resettlement-in-local-authority-areas |
| Local authority data on immigration groups | Wider migrant-journey tables that can add context around groups in each place | Local authority, region, country | Quarterly or periodic | Useful for profile pages and comparator context | https://www.gov.uk/government/statistics/local-authority-data-on-immigration-groups |
| Home Office migration statistics collection | Release calendar and supporting publications | UK | Quarterly | Use for release tracking and methodology notes | https://www.gov.uk/government/collections/migration-statistics |
| RASI quarterly data tables | Asylum support and resettlement operational series, including transfer and support administration detail | Mostly national, some operational subseries | Quarterly | Useful for methodology, edge cases, and series stitching | https://www.gov.uk/government/collections/immigration-statistics-quarterly-release |

## Funding and spend sources

Spending is the hardest part of the product. There is no single clean UK regional asylum spending dataset. The practical answer is to split spend into clear families and label each family honestly.

| Spend family | Best available public input | Coverage | Recommended use | Link |
| --- | --- | --- | --- | --- |
| Asylum dispersal grant rates | Home Office asylum dispersal grant funding instructions | Local authority formula rates rather than audited spend | Estimate grant entitlement by area where the formula can be applied, and explain limitations | https://www.gov.uk/government/publications/asylum-dispersal-grant-funding-instruction |
| UK resettlement funding tariffs | Home Office UK resettlement schemes funding instructions | Local authority scheme payments and tariff rules | Estimate funding attached to arrivals by scheme and year | https://www.gov.uk/government/publications/uk-resettlement-schemes-funding-instructions |
| Unaccompanied asylum-seeking children funding | National Transfer Scheme and UASC funding instructions | England-focused local authority funding rules | Build an England-only UASC funding series with explicit caveats | https://www.gov.uk/government/publications/national-transfer-scheme-and-unaccompanied-asylum-seeking-children-programme-funding-instructions |
| National accommodation and hotel spend | Home Office annual report and major scrutiny reports | National only | National top-line context rather than regional comparison | https://www.gov.uk/government/organisations/home-office/about/our-governance#annual-report-and-accounts |
| Hotel cost and procurement scrutiny | NAO investigations, Home Affairs Committee reports, Home Office media facts pages | National, some regional/provider context | Accountability layer, promise tracker, contractor analysis | https://www.nao.org.uk/reports/investigation-into-asylum-accommodation/ |
| Local authority actual spend | Council budget books, transparency spend files, FOI responses, committee papers | Patchy and inconsistent | Phase 2 or 3 manual enrichment, not MVP core | Varies by authority |

## Supporting contextual sources

| Source | Why you need it | Link |
| --- | --- | --- |
| ONS population estimates | Rates per 10,000 residents and denominator handling | https://www.ons.gov.uk/peoplepopulationandcommunity/populationandmigration/populationestimates |
| ONS geography portal | Boundaries, lookup tables, and code changes | https://geoportal.statistics.gov.uk/ |
| Explore Education Statistics: children looked after in England | UASC context and local authority children numbers | https://explore-education-statistics.service.gov.uk/find-statistics/children-looked-after-in-england-including-adoptions |
| ONS regional labour market and housing pressure series | Optional explanatory overlays for analysis pages | https://www.ons.gov.uk/ |

## Regional partnership and sector sources

These sources are useful because they often provide more local context, older PDFs, or dashboard views that can fill gaps or inspire product structure. They should not overwrite official Home Office series. Use them as secondary or archival layers.

| Source | What it adds | Coverage | Link |
| --- | --- | --- | --- |
| North East Migration Partnership | Regional dashboard pattern, public asylum and refugee information | North East England | https://www.nemp.org.uk/ |
| Migration Yorkshire | Strong regional dashboard and explainer model | Yorkshire and Humber | https://www.migrationyorkshire.org.uk/ |
| East Midlands Councils migration work | Heatmaps and regional summary views | East Midlands | https://www.eastmidlandscouncils.gov.uk/what-we-do/migration/ |
| Migration London via London Councils | London migration policy and data context | London | https://www.londoncouncils.gov.uk/services/migration-london |
| Local Government East / Migration East | East of England regional context | East of England | https://www.localgoveastengland.gov.uk/our-work/migration-east/ |
| North West RSMP or related archive pages | Historic regional summaries, often only in archive copies now | North West England | https://northwestrsmp.org.uk/ |

## Archival sources

Archived regional pages matter because many partnerships published useful tables or PDFs and later removed or redesigned them.

| Archive source | Best use |
| --- | --- |
| UK Government Web Archive | Prefer for public-sector pages because it often preserves official PDFs and HTML faithfully |
| Internet Archive Wayback Machine | Use when the original domain is private, partnership-led, or absent from UKGWA |
| Search engine cached references and third-party citations | Good for discovery only, not final sourcing |

Store all archive-derived rows with:

- original page URL
- archive URL
- archive capture date
- extraction method
- reviewer status
- comparison note against official Home Office figures

## What to prioritise for MVP

Priority `A`:

- Home Office local authority asylum and resettlement tables
- Home Office national asylum quarterly series
- ONS population denominators
- hotel and cost accountability facts from NAO, Home Affairs Committee, and Home Office statements
- hotel evidence ledger from a small number of publicly documented councils

Priority `B`:

- Resettlement funding tariff estimates
- Asylum dispersal grant estimate layer
- one or two strong regional partnership views for context
- contractor geography and regional accountability context

Priority `C`:

- archived regional partnership historical recoveries
- local authority actual spend
- FOI-driven manual enrichments
- a broader named hotel estate ledger

## Release handling notes

- Treat national asylum chapters and local-authority/regional tables as separate release streams.
- Expect revisions. Do not overwrite old derived outputs without storing the release date and file hash.
- Keep series metadata at chart level so the site can say when a line is national `YE Dec 2025` but local authority data is only `YE Sep 2025`.
