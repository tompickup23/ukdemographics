# Research: Strengthen subcontractor and council procurement joins

Generated: 2026-04-07
Project: asylum_stats

Here's a research brief on strengthening subcontractor and council procurement joins for the Asylum Stats project.

### 1. Key Findings

The project explicitly identifies "subcontractor and council procurement joins are still thin" as a main weakness within the current MVP (`roadmap.md`). Addressing this is a high priority, specifically listed as "Deepen the money ledger with local response contracts and more tariff nor" in the `claude-build-brief.md`.

*   **Existing Structure:** The `money_ledger` (`src/data/live/money-ledger.json`) is the designated place for public money rows, covering prime contract scope, funding instructions, and scrutiny cost indicators. It currently has `11` public rows and `9` supplier or public-body profiles (`claude-build-brief.md`).
*   **Data Flow:** The current architecture supports ingesting CSV, JSON, XLSX, ODS, and manual ledgers into `data/raw/` or `data/manual/`, transforming them to `NDJSON` in `data/canonical/`, and then exporting to `data/marts/` and `src/data/live/` via scripts like `scripts/transform/transform-money-ledger.mjs` (`data-architecture.md`).
*   **Design Guidance:** The `docs/product/follow-migrants-follow-money.md` document contains the entity, supplier, ownership, and integrity design for the money layer, which will be crucial for structuring new procurement data. The `docs/product/council-platform-model.md` offers a reusable model for council accountability.
*   **Missing Data:** "Local response contracts are largely missing" and "several refugee funding instruction tables still need full normalization" (`roadmap.md`).

### 2. Next Steps

1.  **Identify & Source Local Procurement Data:**
    *   **Action:** Research and collect local authority procurement data, focusing on contracts related to asylum support, contingency accommodation, and refugee schemes. Prioritize councils in Lancashire initially, leveraging insights from `docs/product/lancashire-ingestion-plan.md`.
    *   **Method:** Look for published contract registers, spending data, and tender portals from individual councils.
    *   **File Path:** Raw data should be placed in `/opt/asylumstats/data/raw/` (for official downloads) or `/opt/asylumstats/data/manual/` (for curated ledgers).
2.  **Extend `money_ledger` Schema:**
    *   **Action:** Review `docs/product/follow-migrants-follow-money.md` to ensure new procurement data (e.g., subcontractor details, contract values, dates, IDs, related prime contracts) can be accommodated within the existing entity, supplier, and ownership design. Update `schemas/money