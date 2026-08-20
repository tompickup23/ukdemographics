# Research: Ingest council procurement only where route/scheme link is explicit

Generated: 2026-04-07
Project: asylum_stats

**Research Brief: Ingest Council Procurement Only Where Route/Scheme Link is Explicit**
*Priority: M | Project: Asylum Stats*

---

### **Key Findings**
1. **Current Gaps**: The money ledger (`src/data/live/money-ledger.json`) lacks explicit links between council procurement and asylum/refugee schemes. The `docs/product/data-architecture.md` and `claude-build-brief.md` confirm this is a Phase 2 priority.
2. **Relevant Files**:
   - `src/lib/money-data.ts` (money ledger logic)
   - `docs/product/accountability-plan.md` (rules for procurement inclusion)
   - `docs/product/follow-migrants-follow-money.md` (entity/supplier design)
3. **Data Sources**: No single UK regional asylum procurement dataset exists. Per `data-sources.md`, spending must be split into families (e.g., contracts, tariffs) with explicit labeling.

---

### **Next Steps**
1. **Audit Existing Procurement Data**:
   - Check `data/raw/` and `data/manual/` for council contracts related to asylum/hotels.
   - **Command**:
     ```bash
     find /opt/asylumstats/data -type f \( -name "*.csv" -o -name "*.xlsx" \) | grep -i "procurement\|contract\|council"
     ```
   - **Action**: Tag rows where scheme/route links are explicit (e.g., "Homes for Ukraine" or "Asylum Support").

2. **Update Money Ledger Schema**:
   - Add `routeScheme` field to `src/lib/money-data.ts` to enforce explicit links.
   - **Example**:
     ```typescript
     interface MoneyRow {
       id: string;
       routeScheme?: "asylumSupport" | "ukraine" | "afghan" | null; // Explicit only
       council?: string;
     }
     ```

3. **Filter Procurement in Transforms**:
   - Modify `scripts/transform/transform-money-ledger.mjs` to skip rows without `routeScheme`.
   - **Pseudocode**:
     ```javascript
     if (!row.routeScheme) {
       console.warn(`Skipping procurement row ${row.id}: no routeScheme`);
       return;
     }
     ```

4. **Test in Staging**:
   - Run the money ledger transform and verify output in `src/data/live/money-ledger.json`.
   - **Command**:
     ```bash
     node scripts/transform/transform-money-ledger.mjs
     ```

---

### **Resources**
- **Money Ledger Docs**: `/opt/asylumstats/docs/product/follow-migrants-follow-money.md`
- **Data Flow**: `/opt/asylumstats/docs/product/data-architecture.md`
- **Example Procurement Data**: UK Government Contracts Finder ([https://www.contractsfinder.service.gov.uk](https://www.contractsfinder.service.gov.uk))

---

### **Risks/Blockers**
1. **Data Scarcity**: If no explicit links exist, procurement may need to be excluded entirely (per `accountability-plan.md`).
2. **Schema Changes**: Updating `money-data.ts` may require updates to dependent components (e.g., `MoneyExplorer.astro`).
3. **Provenance**: Manual ledgers in `data/manual/` must include source URLs to avoid breaking provenance.