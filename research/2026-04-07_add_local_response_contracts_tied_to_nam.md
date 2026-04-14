# Research: Add local response contracts tied to named hotels

Generated: 2026-04-07
Project: asylum_stats

# **Research Brief: Adding Local Response Contracts Tied to Named Hotels**
**Priority:** M | **Project:** Asylum Stats | **Owner:** Tom Pickup

---

## **Key Findings**
1. **Current Hotel Contract Data Gap**
   - The `hotel_entities` ledger (`data/canonical/hotel_entities/`, `src/data/live/hotel-entity-ledger.json`) tracks named hotels and owners but lacks **local response contracts** (e.g., councils procuring hotels for asylum housing).
   - The `money_ledger` (`data/canonical/money_ledger/`, `src/data/live/money-ledger.json`) includes public money rows but does not explicitly link contracts to named hotels.

2. **Relevant Docs & Plans**
   - `docs/product/hotel-tracker-plan.md`: Outlines a "named-site and area-sightings hotel tracker" but lacks contract integration.
   - `docs/product/follow-migrants-follow-money.md`: Defines entity/supplier ownership but needs contract normalization.
   - `docs/research/hotel-and-accountability-sources.md`: Lists potential sources for hotel contracts (e.g., council procurement portals, FOI disclosures).

3. **Existing Codebase Hooks**
   - `scripts/transform/transform-hotel-entities.mjs` and `transform-money-ledger.mjs` can be extended to ingest contract data.
   - `src/lib/hotel-data.ts` and `src/lib/money-data.ts` provide TypeScript interfaces for hotel/money entities.

---

## **Next Steps**
### **1. Identify Contract Data Sources**
- **Council Procurement Portals** (Burnley-specific):
  - Check [Burnley Council Contracts Register](https://www.burnley.gov.uk/contracts) for asylum-related hotel contracts.
  - Use FOI requests if data is missing (template: `docs/research/foi-request-template.md`).
- **National Contracts**:
  - [GOV.UK Contracts Finder](https://www.gov.uk/contracts-finder) (filter for "asylum accommodation").
  - [Home Office Asylum Accommodation](https://www.gov.uk/government/publications/asylum-accommodation-and-support) (links to providers like Serco, Mears).

### **2. Extend Data Pipeline**
- **Add Contract Schema**:
  Create `data/schemas/contracts.json` (example structure):
  ```json
  {
    "contract_id": "string",
    "hotel_id": "string",  // Links to hotel_entities
    "council": "string",
    "supplier": "string",
    "start_date": "YYYY-MM-DD",
    "end_date": "YYYY-MM-DD",
    "value_gbp": "number",
    "source_url": "string"
  }
  ```
- **Update Transform Scripts**:
  Modify `scripts/transform/transform-hotel-entities.mjs` to join contracts with hotel data:
  ```bash
  node scripts/transform/transform-hotel-entities.mjs --include-contracts
  ```
  - Output: Updated `src/data/live/hotel-entity-ledger.json` with `contracts` array per hotel.

### **3. Update UI Components**
- **Hotel Detail Page** (`src/pages/hotels/[id].astro`):
  Add a "Local Response Contracts" section using the extended ledger.
  Example:
  ```astro
  ---
  import { getHotelById } from '../../lib/hotel-data';
  const hotel = await getHotelById(Astro.params.id);
  ---
  <h2>Local Response Contracts</h2>
  {hotel.contracts.map(contract => (
    <ContractCard {...contract} />
  ))}
  ```

### **4. Validate with Burnley Case Study**
- Test the pipeline with **Burnley’s known hotels** (e.g., "The Victoria", "The Swan").
- Verify contract links in `src/data/live/hotel-entity-ledger.json`.

---

## **Resources**
- **Data Sources**:
  - [Burnley Council Contracts Register](https://www.burnley.gov.uk/contracts)
  - [GOV.UK Contracts Finder](https://www.gov.uk/contracts-finder)
  - [Home Office Asylum Accommodation](https://www.gov.uk/government/publications/asylum-accommodation-and-support)
- **Code References**:
  - `scripts/transform/transform-hotel-entities.mjs` (extend for contracts)
  - `src/lib/hotel-data.ts` (update TypeScript interfaces)
  - `src/pages/hotels/[id].astro` (add contract UI)

---

## **Risks/Blockers**
- **Data Availability**: Some councils may redact hotel names in contracts (cite FOI exemptions).
- **Schema Drift**: Ensure `contracts.json` aligns with `hotel_entities` and `money_ledger` IDs.
- **Performance**: Large contract datasets may slow down `hotel-entity-ledger.json` generation. Optimize with NDJSON streaming.

---
**Action**: Start with Burnley’s contracts, then generalize. Target completion: **2 weeks**.