# Archival recovery plan

Historic regional partnership data is valuable, but it needs a controlled ingestion path.

## Why this matters

- Regional partnerships sometimes published time series before GOV.UK improved place-level releases.
- Some North West material appears to have moved or disappeared from the live web.
- Older PDFs and HTML tables can fill narrative gaps, especially for pre-redesign periods.

## Recovery workflow

1. Start with discovery.
   Search the live site, the UK Government Web Archive, the Wayback Machine, and citations in other public documents.
2. Capture provenance immediately.
   Record the original URL, archive URL, capture date, title, and a local screenshot or PDF copy.
3. Extract conservatively.
   Prefer HTML tables first, embedded CSV/XLS second, OCR of image/PDF tables only when necessary.
4. Validate against official series.
   Compare totals, dates, and geography labels to nearby Home Office releases.
5. Publish with labels.
   Mark recovered series as `archive-derived` until reviewed.

## Storage rules

Suggested folders:

- `data/raw/archive/<source_id>/<capture_date>/`
- `data/manual/archive_extractions/`
- `data/qa/archive_validation/`

Every recovered dataset should carry:

- `archive_source_url`
- `archive_capture_date`
- `original_publisher`
- `extraction_method`
- `review_status`
- `reviewer`
- `validation_note`

## Good uses of archived data

- Backfilling older regional summaries
- Recovering discontinued PDF tables
- Reconstructing narrative context for “what changed over the last decade”

## Bad uses of archived data

- Replacing current official Home Office figures
- Mixing archived regional definitions into official local-authority series without flags
- Publishing manually transcribed values without a provenance trail

## Minimum validation checks

- Period labels line up with quarter or year definitions.
- Geography names map to current or historical official codes.
- Totals do not exceed plausible official counts.
- Units are explicit: people, households, placements, tariff amount, or percentage.
- A second pass review exists for OCR-derived tables.

## Recommended publication rule

Do not merge archive-derived observations into the same line as official observations. Keep them in the same chart only if:

- the legend distinguishes them clearly
- hover text states the status
- the methodology page explains the stitch

## North West specific note

The North West is a strong candidate for archive recovery because public references suggest older statistics pages existed on the regional partnership domain. Build the data model so North West archive recoveries are a first-class input, not an afterthought.
