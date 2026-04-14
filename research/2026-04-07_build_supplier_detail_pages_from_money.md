# Research: Build supplier detail pages from money + hotel entity ledgers

Generated: 2026-04-07
Project: asylum_stats

### **Research Brief: Supplier Detail Pages from Money + Hotel Entity Ledgers**
**Priority: H** | **Project: Asylum Stats** | **Owner: Tom Pickup**

---

## **Key Findings**
1. **Existing Data Structures**
   - **Hotel Entity Ledger**: Located in `src/data/live/hotel-entity-ledger.json` (9 named sites, 4 current, 4 entity links).
   - **Money Ledger**: Located in `src/data/live/money-ledger.json` (11 public rows, 6 with GBP values, 9 supplier profiles).
   - **Supplier Profiles**: Embedded in `money-ledger.json` but not yet exposed as standalone pages.

2. **Current Gaps**
   - No dedicated **supplier detail pages** (e.g., `/suppliers/[supplier-name]`).
   - Money/hotel records reference suppliers but lack deep linking or contextual drilldown.
   - `entity-explorer.ts` and `money-explorer.ts` scripts exist but are not wired to new pages.

3. **Relevant Files**
   - **Transform Scripts**:
     - `scripts/transform/transform-hotel-entities.mjs` (hotel entity processing)
     - `scripts/transform/transform-money-ledger.mjs` (money ledger processing)
   - **Libraries**:
     - `src/lib/entities.ts` (entity resolution logic)
     - `src/lib/money-data.ts` (money ledger access)

---

## **Next Steps**
### **1. Define Supplier Page Structure**
- **Action**: Create a new page template in `src/pages/supplier/[slug].astro`.
- **Data Source**:
  - Extract supplier IDs from `hotel-entity-ledger.json` (e.g., `owner`, `operator` fields) and `money-ledger.json` (e.g., `supplier` field).
  - Merge supplier details into a canonical list (e.g., `src/data/live/suppliers.json`).
- **Command**:
  ```bash
  mkdir -p src/pages/supplier && touch src/pages/supplier/[slug].astro
  ```

### **2. Wire Up Supplier Data**
- **Action**: Modify `src/lib/entities.ts` to export a `getSupplierById()` function.
- **Example**:
  ```typescript
  // src/lib/entities.ts
  export function getSupplierById(id: string) {
    const suppliers = await import("../../data/live/suppliers.json");
    return suppliers.find(s => s.id === id);
  }
  ```

### **3. Create Dynamic Supplier Pages**
- **Action**: Use Astro’s dynamic routing in `[slug].astro`:
  ```astro
  ---
  import { getSupplierById } from "../../lib/entities";
  const { slug } = Astro.params;
  const supplier = await getSupplierById(slug);
  ---
  <h1>{supplier.name}</h1>
  <p>Role: {supplier.role}</p>
  ```

### **4. Link Suppliers from Existing Pages**
- **Action**: Update `hotel-entity-ledger.json` and `money-ledger.json` to include supplier links:
  ```json
  {
    "id": "serco",
    "name": "Serco Group plc",
    "role": "hotel_operator",
    "hotel_links": ["/hotels/serco-runwood-house"],
    "money_links": ["/spending/serco-contract-2024"]
  }
  ```

### **5. Test & Deploy**
- **Command**:
  ```bash
  npm run build && npm run preview
  ```
- **URL**: `http://localhost:3000/supplier/serco`

---

## **Resources**
- **Astro Dynamic Routing**: [Docs](https://docs.astro.build/en/guides/routing/#dynamic-routes)
- **NDJSON Processing**: Use `ndjson` CLI to inspect `data/canonical/hotel_entities/*.ndjson`.
- **Example Supplier Data**: `data/manual/suppliers.csv` (if manual curation is needed).

---

## **Risks/Blockers**
1. **Supplier Name Collisions**: Ensure unique IDs (e.g., `serco-limited` vs. `serco-plc`).
2. **Data Normalization**: Merge hotel/money supplier fields into a single canonical list.
3. **Performance**: Pre-generate `suppliers.json` in `scripts/transform/` to avoid runtime merges.

**Next Review**: After supplier page MVP is live, validate with stakeholders.