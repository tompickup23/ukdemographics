# Research: Add contract/money-record detail pages

Generated: 2026-04-07
Project: asylum_stats

### **Research Brief: Add Contract/Money-Record Detail Pages**
**Priority: M** | **Project: Asylum Stats**

---

#### **1. Key Findings**
- The project already has a **live `money-ledger.json`** (`src/data/live/money-ledger.json`) with 11 public rows, 6 with GBP values, and supplier profiles.
- The **money layer** distinguishes between route-specific, local-route-relevant, and context-only spending.
- The **site plan** (`docs/product/site-plan.md`) emphasizes accountability, requiring supplier and contract detail pages.
- The **data architecture** (`docs/product/data-architecture.md`) uses a static Astro site with JSON marts (`src/data/live/`).
- **Current gaps**:
  - No dedicated **contract/money-record detail pages** (only ledger rows).
  - Supplier profiles exist but lack deep linking to contracts.
  - The `money-ledger.json` structure needs expansion for contract-specific fields.

**Key Files/Paths:**
- `src/data/live/money-ledger.json` (current ledger)
- `scripts/transform/transform-money-ledger.mjs` (transform script)
- `src/pages/spending/` (current spending page)
- `src/components/DataDrawer.astro` (used for detail views)

---

#### **2. Next Steps**
**A. Define Contract/Money-Record Schema**
- Extend `money-ledger.json` to include:
  - `contract_id` (unique identifier)
  - `supplier_id` (link to supplier profile)
  - `start_date`, `end_date` (contract duration)
  - `award_value_gbp` (award amount)
  - `scope_notes` (route-specific/local relevance)
  - `source_url` (evidence link)
- **Action**: Update `schemas/money-record.schema.json` (create if missing).

**B. Create Detail Page Template**
- Add a new Astro page at `src/pages/spending/[contract_id].astro` (dynamic route).
- Use `DataDrawer.astro` for consistent layout.
- **Example structure**:
  ```astro
  ---
  const { contract_id } = Astro.params;
  const record = await getMoneyRecord(contract_id); // Implement in `src/lib/money-data.ts`
  ---
  <DataDrawer title={record.title}>
    <p>Supplier: <a href={`/suppliers/${record.supplier_id}`}>{record.supplier_name}</a></p>
    <p>Value: £{record.award_value_gbp}</p>
    <p>Scope: {record.scope_notes}</p>
    <a href={record.source_url}>View Source</a>
  </DataDrawer>
  ```

**C. Update Transform Script**
- Modify `scripts/transform/transform-money-ledger.mjs` to:
  - Parse contract-specific fields from raw data (e.g., `data/raw/contracts/*.csv`).
  - Generate `data/marts/money_contracts/` (NDJSON) and mirror to `src/data/live/money-contracts/`.
- **Command**:
  ```bash
  node scripts/transform/transform-money-ledger.mjs --contracts
  ```

**D. Link Ledger Rows to Detail Pages**
- Update `src/pages/spending/index.astro` to:
  - Add `<a href={`/spending/${record.contract_id}`}>View Contract</a>` to each ledger row.
  - Use `InvestigationTrail.astro` for breadcrumbs.

**E. Add Supplier Profile Integration**
- Ensure supplier IDs link to `/suppliers/[supplier_id]` (if not already implemented).
- **File**: `src/lib/money-data.ts` (add `getMoneyRecord()` function).

---
#### **3. Resources**
- **Data Sources**:
  - [Home Office Immigration Stats](https://www.gov.uk/government/collections/immigration-system-statistics) (for contract awards).
  - [Local Authority Data](https://www.gov.uk/government/statistics/data-on-asylum-and-resettlement-in-local-authority-areas) (for local response contracts).
- **Tools**:
  - Astro dynamic routes: [Astro Docs](https://docs.astro.build/en/guides/routing/#dynamic-routes).
  - NDJSON processing: Use `ndjson` npm package (`npm install ndjson`).
- **Existing Components**:
  - `DataDrawer.astro` (for consistent detail views).
  - `InvestigationTrail.astro` (for breadcrumbs).

---
#### **4. Risks/Blockers**
- **Data Gaps**: Contract details may be sparse in raw sources. Mitigate by:
  - Using FOI requests (track in `docs/research/data-sources.md`).
  - Labeling missing data as "unpublished" in the ledger.
- **Performance**: Large contract datasets may slow page loads. Optimize by:
  - Paginating `spending/index.astro`.
  - Using `Astro.glob()` for dynamic imports.
- **Provenance**: Ensure all contract data is sourced and timestamped in `data/raw/`.

---
**Next Action**: Start with schema updates in `money-ledger.json` and the dynamic detail page template.