# Lancashire ingestion plan

This is the practical route from the current Lancashire / AI DOGE outputs to a reusable platform.

## Phase 1: stabilize the current domains

### Spending

Observed current pattern:

- monthly chunk files such as `spending-2025-12.json`
- search/index file `spending-index.json`

Ingest approach:

- fetch monthly files as raw
- normalize into one canonical transaction fact table
- export both transaction chunks and a fast search index

### Budgets

Observed current pattern:

- `budgets.json`
- `budgets_summary.json`
- `budgets_govuk.json`
- `budget_variance.json`
- `budget_mapping.json`

Ingest approach:

- keep local and GOV.UK finance tables as separate source families
- normalize service categories
- version the mapping layer
- generate comparison marts only after canonical normalization

### Procurement

Observed current pattern:

- `procurement.json`

Ingest approach:

- fetch Contracts Finder notice data or scrape notice pages if no stable API route is used
- normalize notice type, dates, values, and award supplier names

### Meetings and votes

Observed current pattern:

- `meetings.json`
- `voting.json`

Ingest approach:

- scrape ModernGov or council meeting pages
- split committee metadata, meeting metadata, vote events, and vote records

### Councillors and integrity

Observed current pattern:

- `councillors.json`
- `councillor_profiles.json`
- `integrity.json`

Ingest approach:

- keep councillor reference and integrity results separate
- version integrity runs
- store every external check family in provenance metadata

### Elections and geography

Observed current pattern:

- `elections.json`
- `wards.json`
- `ward_boundaries.json`
- shared election reference files

Ingest approach:

- keep election event, ward result, and candidate result tables distinct
- separate boundary geometry from election results

## Source and API review

| Source family | Access pattern | Role in platform | Notes |
| --- | --- | --- | --- |
| Council transparency spend publications | download or scrape | core spending facts | Usually monthly XLSX, CSV, or HTML-derived |
| GOV.UK local authority finance outturn | official download | canonical budget layer | Best official comparable finance base |
| Contracts Finder | public notice pages and data extraction | procurement layer | Observed Lancashire output uses Contracts Finder as source |
| ModernGov council pages | scrape | meetings, committees, councillors | Strong practical source, but not a clean formal public API in the reviewed setup |
| Companies House API | official API | integrity and supplier enrichment | Critical for officer, PSC, and status checks |
| Electoral Commission data | official public data/search | donations and integrity | Best treated as a separate enrichment family |
| FCA Register | official search/data source | integrity enrichment | Niche but useful where regulated roles matter |
| Democracy Club API/CSV | civic data API and downloads | elections and candidate context | Strong reusable elections source |
| Postcodes.io | open API | geography normalization | Useful for postcode and administrative lookup |
| ONS geography datasets | official downloads | boundaries and codes | Required for a clean body and geography model |

## Recommended file layout

```text
platform/
  raw/
    bodies/
      lancashire_cc/
        spending/
        budgets/
        procurement/
        meetings/
        elections/
        integrity/
  canonical/
    dim_body.parquet
    dim_source.parquet
    dim_supplier.parquet
    dim_councillor.parquet
    fact_spending_transaction.parquet
    fact_budget_outturn.parquet
    fact_budget_mapping.parquet
    fact_procurement_notice.parquet
    fact_meeting.parquet
    fact_vote_event.parquet
    fact_vote_record.parquet
    fact_election_result.parquet
    fact_integrity_profile.parquet
  marts/
    body_summary/
    spending/
    budgets/
    procurement/
    meetings/
    integrity/
    suppliers/
  publish/
    lancashirecc/
      data/
```

## QA checks

- transaction ids are stable within a source family
- budget categories map to an allowed canonical vocabulary
- procurement values have consistent low/high/awarded relationships
- meeting dates and vote dates line up
- councillor ids are stable across meetings, votes, and integrity data
- source metadata exists for every dataset
- empty datasets declare a status and reason

## Best next implementation move

Model Lancashire County Council first, but keep every schema body-agnostic.

That gives you:

- one real council proving the model
- a clean path to all 15 Lancashire councils
- a reusable accountability platform for asylumstats and other sites
