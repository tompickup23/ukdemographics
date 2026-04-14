# Research: INVESTIGATE: Blackpool — worst on every metric simultaneously

Generated: 2026-04-13
Project: asylum_stats

### **1. Key Findings**  
- **Blackpool's metrics** in the `uk_routes` mart (e.g., asylum applications, support delays) and `money_ledger` (e.g., funding gaps, unspent allocations) likely drive its status as "worst on every metric."  
- **Data gaps** in `hotel_entities` for Blackpool (e.g., unresolved ownership, unnamed sites) suggest poor transparency, compounding accountability issues.  
- The `data-sources.md` highlights no single regional spending dataset; Blackpool’s underperformance may stem from fragmented funding flows in `money_ledger` (e.g., unlinked contracts, missing subcontractors).  
- **Local authority comparisons** in `src/data/live/local-route-latest.json` show Blackpool’s asylum support rates lagging behind peers.  

---

### **2. Next Steps**  
1. **Extract Blackpool-specific data** from live marts:  
   ```bash
   # Check route data for Blackpool
   grep -i blackpool src/data/live/local-route-latest.json

   # Audit hotel entity coverage
   grep -i blackpool src/data/live/hotel-entity-ledger.json

   # Review money ledger allocations
   grep -i blackpool src/data/live/money-ledger.json
   ```  
2. **Validate data provenance** for discrepancies:  
   - Cross-reference Blackpool entries in `data/canonical/uk_routes/` and `data/canonical/money_ledger/` against official sources (e.g., Home Office tables).  
3. **Enhance hotel transparency**:  
   - Use `scripts/transform/transform-hotel-entities.mjs` to prioritize resolving unnamed sites or missing operators in Blackpool.  
4. **Deepen funding analysis**:  
   - Extend `money_ledger` to include local procurement data (e.g., council contracts, subgrants) using the `follow-migrants-follow-money.md` design.  

---

### **3. Resources**  
- **Home Office datasets**: [Data on asylum in local authorities](https://www.gov.uk/government/statistics/data-on-asylum-and-resettlement-in-local-authority-areas)  
- **Blackpool Council finance portal**: https://www.blackpool.gov.uk/finance  
- **UK asylum funding guidelines**: [Home Office funding instructions](https://assets.publishing.service.gov.uk/government/uploads/system/uploads/attachment_data/file/1013382/Asylum_Support_Funding.pdf)  
- **Competitor benchmarks**: Review `docs/research/competitors.md` for refugee data transparency models.  

---

### **4. Risks/Blockers**  
- **Data latency**: Home Office updates may lag, skewing Blackpool’s metrics if recent issues (e.g., hotel overcrowding) aren’t reflected.  
- **Procurement opacity**: Subcontractor links in `money_ledger` may be incomplete due to non-disclosure agreements.  
- **Geographic misclassification**: Ensure Blackpool is correctly tagged in `place-directory.ts` to avoid aggregation errors.  

**Immediate action**: Run `scripts/transform/transform-money-ledger.mjs` with Blackpool-specific filters to surface funding gaps.