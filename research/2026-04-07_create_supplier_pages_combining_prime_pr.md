# Research: Create supplier pages combining prime providers, hotel entities, money rows

Generated: 2026-04-07
Project: asylum_stats

### **Research Brief: Supplier Pages for Prime Providers, Hotel Entities, and Money Rows**
**Priority: H | Project: Asylum Stats**

---

### **1. Key Findings**
- **Current State**:
  - The project has live marts for routes, hotels, and money (`src/data/live/`).
  - Supplier profiles exist in the `money-ledger.json` (e.g., prime providers, contractors).
  - Hotel entities (`hotel-entity-ledger.json`) include owner/operator links but lack supplier detail pages.
  - Money ledger (`money-ledger.json`) includes GBP values and supplier/public-body profiles but no dedicated detail pages.
  - **Gaps**: No unified supplier pages combining prime providers, hotel entities, and money rows.

- **Relevant Files**:
  - `src/data/live/money-ledger.json` (11 public rows, 9 supplier profiles).
  - `src/data/live/hotel-entity-ledger.json` (9 named sites, 4 entity links).
  - `src/lib/money-data.ts` (supplier/profile logic).
  - `src/lib/entities.ts` (hotel entity handling).

---

### **2. Next Steps**
#### **A. Create Supplier Detail Pages**
1. **Define Supplier Schema**:
   - Merge `money-ledger` (prime providers) and `hotel-entity-ledger` (owners/operators).
   - Add a new `suppliers/` route in Astro.
   - **File**: `src/pages/suppliers/[supplierId].astro`.

2. **Generate Supplier IDs**:
   - Use existing `supplierId` from `money-ledger.json` (e.g., `Serco`, `Mears`).
   - **Command**:
     ```bash
     jq -r '.[] | .supplierId' src/data/live/money-ledger.json | sort -u > suppliers.txt
     ```

3. **Build Supplier Page**:
   - **Template**: `src/layouts/BaseLayout.astro` (reuse existing layout).
   - **Data Fetch**: Use `src/lib/money-data.ts` to load supplier details.
   - **Example**:
     ```astro
     ---
     import { getSupplierById } from '../../lib/money-data';
     const { supplierId } = Astro.params;
     const supplier = await getSupplierById(supplierId);
     ---
     <h1>{supplier.name}</h1>
     <p>Role: {supplier.role} (Prime Provider / Operator)</p>
     ```

#### **B. Link Suppliers to Hotels & Money Rows**
1. **Update Hotel Entity Ledger**:
   - Add `supplierId` to hotel entities (e.g., `hotel-entity-ledger.json`).
   - **Example**:
     ```json
     {
       "hotelId": "RAF Scampton",
       "operator": "Serco",
       "supplierId": "Serco"
     }
     ```

2. **Update Money Ledger**:
   - Ensure all prime providers have `supplierId` (e.g., `Mears`, `Clearsprings`).
   - **File**: `data/manual/supplier-profiles.json` (manual overrides).

#### **C. Add Navigation**
- **Site Header**: Add "Suppliers" link to `src/components/SiteHeader.astro`.
- **Money/Hotel Pages**: Link suppliers in tables (e.g., `src/pages/spending.astro`).

---

### **3. Resources**
- **Data Files**:
  - `src/data/live/money-ledger.json` (supplier profiles).
  - `src/data/live/hotel-entity-ledger.json` (operators).
- **Transform Scripts**:
  - `scripts/transform/transform-money-ledger.mjs` (update schema).
- **Astro Docs**: [Dynamic Routes](https://docs.astro.build/en/guides/routing/#dynamic-routes).

---

### **4. Risks/Blockers**
- **Data Gaps**: Some suppliers may lack unique IDs (manual cleanup needed).
- **Provenance**: Ensure supplier links don’t break existing data chains.
- **Time**: Prioritize suppliers with the most hotel/money rows first (e.g., Serco, Mears).

---
**Action**: Start with `Serco` and `Mears` as test cases. Use `jq` to validate merged data before building pages.