# Research: INVESTIGATE: North West carries 1 in 5 UK asylum seekers — more than London

Generated: 2026-04-13
Project: asylum_stats

### **1. Key Findings**  
- **Regional Disparity Drivers**: The North West’s disproportionate share (20%+) of UK asylum seekers likely stems from:  
  - **Home Office Contracting**: Evidence in `hotel_entities` shows outsourced hotel management clusters in the region (see `src/data/live/hotel-entity-ledger.json`).  
  - **Funding Allocations**: The `money_ledger` reveals regional spending prioritization (e.g., £Xm in North West vs. London in `src/data/live/money-ledger.json`).  
  - **Local Authority Capacity**: Data in `uk_routes` (`src/data/live/local-route-latest.json`) indicates higher asylum support approvals in North West councils.  
- **Data Gaps**: Current `hotel-area-sightings.json` lacks granularity on why North West is prioritized. Missing: local authority decision logs, Home Office placement criteria.  

---

### **2. Next Steps**  
1. **Enhance Regional Drilldown**  
   - Extend `RegionTileMap.astro` to highlight North West anomalies.  
   - Command: `npm run build && npm run preview` after modifying `/src/components/RegionTileMap.astro` to surface North West stats.  
2. **Add Placement Criteria Data**  
   - Scrape Home Office hotel contracts (use `scripts/fetch/fetch-contracts.mjs`) for regional clauses.  
   - Add to `data/manual/hotel-contracts/` and link to `hotel_entities` via `transform-hotel-entities.mjs`.  
3. **Normalize Funding by Population**  
   - Use ONS population data (URL: [ONS Population Estimates](https://data.gov.uk/dataset/ons-population-estimates)) to adjust `money_ledger` spending ratios.  
   - Update `scripts/transform/transform-money-ledger.mjs` to include per-capita metrics.  
4. **Build North West Comparison Panel**  
   - Modify `/src/pages/compare.ts` to default to North West vs. London comparisons using `local-route-latest.json`.  

---

### **3. Resources**  
- **Home Office Stats**: [Immigration System Statistics](https://www.gov.uk/government/collections/immigration-system-statistics) (current national/la trends).  
- **ONS Data**: [Population Estimates](https://data.gov.uk/dataset/ons-population-estimates) (for normalizing spend).  
- **FOIA Toolkit**: Use `docs/research/archival-recovery.md` methods to request placement criteria from Home Office.  
- **Local Authority Dashboards**: [Lancashire AI DOGE Review](docs/research/lancashire-ai-doge-review.md) (reuse LA data models).  

---

### **4. Risks/Blockers**  
- **Secrecy in Contracts**: Hotel operator terms (e.g., Clearsprings Readies) may omit regional criteria; FOIA requests could face delays.  
- **Data Lag**: Quarterly updates to `data-sources.md` inputs may delay real-time insights.  
- **Normalization Complexity**: Mismatched geographies (e.g., North West vs. Government Office Regions) could skew spend-per-capita analysis.  

---  
**Priority Command**: `node scripts/transform/transform-money-ledger.mjs` to begin funding normalization.  
**Target File**: Update `/src/components/RegionTileMap.astro` to emphasize North West hotspots.