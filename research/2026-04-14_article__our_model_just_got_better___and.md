# Research: Article: Our model just got better — and here is how we proved it

Generated: 2026-04-14
Project: asylum_stats

### **Research Brief: "Our model just got better — and here is how we proved it"**
**Project:** Asylum Stats | **Priority:** H

---

#### **Key Findings**
1. **MVP is live but needs hardening** – The platform already tracks asylum routes, hotel entities, and public money ledgers (`src/data/live/route-dashboard.json`, `hotel-entity-ledger.json`, `money-ledger.json`). Weaknesses include inconsistent place drilldown, missing local response contracts, and thin subcontractor/council procurement data (see `roadmap.md`).
2. **Data provenance is strong** – Canonical NDJSON outputs (`data/canonical/`) and marts (`data/marts/`) are generated via transform scripts (`scripts/transform/*.mjs`). No need to rewrite the architecture (see `data-architecture.md`).
3. **Money ledger is the priority gap** – Only 11 public rows exist (`money-ledger.json`), with 6 having GBP values. Local response contracts and tariff normalization are missing (see `claude-build-brief.md`).
4. **Hotel integrity signals are underused** – Only 4 named sites and 4 entity links exist (`hotel-entity-ledger.json`). More operator/supplier evidence is needed (see `hotel-and-accountability-sources.md`).
5. **Place pages are still mock** – Replace hardcoded place pages with generated pages from live marts (see `site-plan.md`).

---

#### **Next Steps**
**1. Harden the Money Ledger (Critical Path)**
- **Action:** Deepen the `money-ledger.json` with local response contracts and supplier profiles.
  - **File:** `scripts/transform/transform-money-ledger.mjs`
  - **Input:** Add `data/manual/local-response-contracts.csv` (template: `docs/product/lancashire-ingestion-plan.md`).
  - **Command:**
    ```bash
    node scripts/transform/transform-money-ledger.mjs --add-local-contracts
    ```
  - **Verify:** Check `src/data/live/money-ledger.json` for new rows.

**2. Build Supplier Detail Pages**
- **Action:** Create pages for suppliers linked in the money ledger (e.g., Serco, Mears).
  - **Files:**
    - `src/pages/suppliers/[slug].astro` (dynamic route)
    - `src/lib/money-data.ts` (add `getSupplierById()`).
  - **Example:**
    ```astro
    ---
    import { getSupplierById } from '../../lib/money-data';
    const { slug } = Astro.params;
    const supplier = getSupplierById(slug);
    ---
    <h1>{supplier.name}</h1>
    ```

**3. Replace Mock Place Pages**
- **Action:** Generate place pages dynamically from `local-route-latest.json`.
  - **File:** `src/pages/places/[areaCode].astro`
  - **Command:**
    ```bash
    node scripts/build-place-pages.mjs --from-local-routes
    ```
  - **Verify:** Check `src/pages/places/[areaCode].astro` renders data correctly.

**4. Add Hotel Integrity Signals**
- **Action:** Expand `hotel-entity-ledger.json` with operator/supplier links.
  - **File:** `data/manual/hotel-operators.csv` (add new rows).
  - **Transform:** Update `scripts/transform/transform-hotel-entities.mjs` to ingest this file.
  - **Command:**
    ```bash
    node scripts/transform/transform-hotel-entities.mjs --add-operators
    ```

**5. Strengthen Place Drilldown**
- **Action:** Extend the two-panel navigation model to `/compare`, `/hotels`, and `/spending`.
  - **File:** `src/components/RegionAuthorityStage.astro` (add comparative visuals).
  - **Example:**
    ```astro
    <BenchmarkStrip routeA="asylum-support" routeB="homes-for-ukraine" />
    ```

---

#### **Resources**
- **Official Data Sources:**
  - Home Office Immigration Stats: [https://www.gov.uk/government/collections/immigration-system-statistics](https://www.gov.uk/government/collections/immigration-system-statistics)
  - Local Authority Data: [https://www.gov.uk/government/statistics/data-on-asylum-and-resettlement-in-local-authority-areas](https://www.gov.uk/government/statistics/data-on-asylum-and-resettlement-in-local-authority-areas)
- **Tools:**
  - NDJSON linting: `npm install -g ndjson-cli`
  - CSV validation: `csvlint` (CLI tool).

---
#### **Risks/Blockers**
1. **Data Gaps:** Local response contracts may require FOI requests (see `docs/product/lancashire-ingestion-plan.md`).
2. **Provenance:** Ensure all manual ledgers (`data/manual/`) include `source_url` and `last_updated` fields.
3. **Performance:** Large NDJSON files may slow transforms. Use `jq` for filtering:
   ```bash
   jq 'select(.area_code == "E06000001")' data/canonical/money_ledger.ndjson > temp.ndjson
   ```