# Lancashire / AI DOGE review

Inspection date: `2026-02-28`

Reviewed assets:

- `tompickup23/tompickup23.github.io`
- `tompickup23/lancashire` on branch `gh-pages`
- `lancashirecc/data/*` as a representative council data pack

This review is aimed at one question:

`What should be kept, what should be normalized, and what should become the platform backbone for asylumstats and future accountability products?`

## What the current platform already does well

### 1. It is already a multi-domain accountability system

The Lancashire implementation is not just a spending search tool. In the `lancashirecc/data` folder, the observed domains include:

- monthly spending chunks such as `spending-2025-12.json`
- spending indexes such as `spending-index.json`
- local budget summaries such as `budgets.json` and `budgets_summary.json`
- GOV.UK finance data such as `budgets_govuk.json`
- budget crosswalks such as `budget_mapping.json`
- procurement notices such as `procurement.json`
- meetings and committee structure such as `meetings.json`
- councillor reference data such as `councillors.json`
- integrity outputs such as `integrity.json`
- voting records such as `voting.json`
- elections and ward data such as `elections.json`, `wards.json`, and `ward_boundaries.json`
- shared cross-council files such as `shared/lgr_budget_model.json` and `shared/integrity_cross_council.json`
- editorial outputs such as `articles-index.json`

That breadth is valuable. Do not throw it away.

### 2. It uses the right publishing pattern for GitHub Pages

The current platform uses:

- static per-council microsites
- council-scoped data folders
- pre-built indexes for fast UI
- service worker and manifest support
- SEO metadata generated per council

That is a good delivery model for public-interest sites where reliability and low hosting complexity matter.

### 3. It already separates raw-ish and derived layers in practice

Observed examples:

- `spending-2025-12.json` is close to a raw canonical transaction list
- `spending-index.json` is an optimized search/filter layer
- `budget_mapping.json` is a derived crosswalk layer
- `articles/*.json` are editorial outputs

This is the correct instinct. The problem is that the layers are not formalized cleanly enough.

### 4. The integrity layer is unusually ambitious

Observed `integrity.json` signals include:

- Companies House matching
- Electoral Commission checks
- FCA checks
- MP financial interests cross-reference
- family and network heuristics
- revolving-door logic
- shell-company and threshold-manipulation style flags

That is strong differentiation. It should become a first-class fact layer with clear provenance and risk scoring rules.

## Main findings

### Finding 1: the platform is rich, but the data contract is implicit rather than explicit

The current repo has many useful JSON outputs, but there is no single canonical schema family tying them together.

Why this matters:

- onboarding a new council is harder than it should be
- cross-council comparison logic becomes fragile
- derived layers are harder to audit
- downstream products like asylumstats cannot safely reuse the platform without reading every file shape separately

### Finding 2: raw, derived, editorial, and publish artifacts are mixed together

In the observed council data folder, these all sit side by side:

- transaction lists
- indexes
- crosswalk mappings
- shared reference data
- article metadata
- compressed `.br` and `.gz` copies

This is practical for static deployment, but weak for long-term data engineering. Build artifacts should not be the canonical data layer.

### Finding 3: `budget_mapping.json` is strategically important but structurally weak

This file is one of the most valuable ideas in the whole system because it links messy council department labels to finance categories. But as observed, it is shaped as a giant object keyed by raw department string.

That creates problems:

- hard to diff across versions
- awkward to review and approve manually
- no stable mapping ids
- no effective validity periods
- difficult to carry confidence, reviewer, and method history cleanly

This layer should become a normalized table, not a freeform object map.

### Finding 4: body identifiers and shared dimensions need cleaning

Observed ids include forms such as:

- `lancashire_cc`
- `blackburn`
- `lancashire_fire`

These are workable but not yet a strong platform dimension. The broader platform needs one body dimension with:

- stable internal id
- display name
- legal body name
- body type
- ONS or comparable official code where available
- website
- region
- parent/peer relationships

### Finding 5: data status needs to be explicit, especially for placeholders

Observed examples:

- `pay_comparison.json` was effectively empty in the reviewed file
- `foi_templates.json` had an empty `templates` array

That is fine if intentional, but the platform should never make the frontend infer whether a file is:

- empty because no data exists
- empty because ingestion failed
- empty because the feature is not yet shipped
- empty because the council does not publish it

Add explicit dataset status metadata.

### Finding 6: compressed publish artifacts should move out of the canonical data model

The `.json`, `.json.br`, and `.json.gz` triples are useful for static delivery, but they should be generated at publish time, not treated as equal-status repo artifacts in the conceptual model.

## High-value pieces to preserve

- per-council microsite publishing
- static data delivery
- `spending-index` style fast search layer
- cross-council supplier profiles
- budget mapping as a core bridge layer
- cross-council integrity datasets
- meetings and voting as structured accountability content
- editorial outputs generated from data

## What the next version should change

### 1. Formalize layers

Use four explicit layers:

- `raw`
- `canonical`
- `marts`
- `publish`

### 2. Formalize ids

Create stable ids for:

- body
- supplier
- councillor
- meeting
- vote event
- procurement notice
- budget line
- source file

### 3. Split domain schemas

At minimum:

- spending transactions
- budget outturn
- budget mapping
- procurement notices
- meetings
- councillor profiles
- integrity profiles
- election results
- vote events
- supplier profiles

### 4. Treat derived layers as auditable products

For every derived dataset, keep:

- method version
- generated timestamp
- source dependencies
- confidence or review status where applicable

## Why this matters for asylumstats

The asylum product should not copy AI DOGE visually and call it done. The real opportunity is to reuse the stronger platform ideas:

- place pages
- cross-area comparison
- evidence-led editorial outputs
- fast static search indexes
- clear source provenance
- a disciplined raw-to-derived pipeline

That makes asylumstats a domain product on top of a reusable accountability platform, not a one-off dashboard.
