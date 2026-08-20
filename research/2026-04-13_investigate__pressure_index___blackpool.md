# Research: INVESTIGATE: Pressure index — Blackpool, Blackburn, Burnley top across 5 domains

Generated: 2026-04-13
Project: asylum_stats

### **1. Key Findings**  
- **Pressure Index Composition**: The pressure index ranking Blackpool, Blackburn, and Burnley likely combines metrics from 5 domains:  
  - **Asylum Route Data**: Local authority counts from Home Office datasets (`data/marts/uk_routes/local-route-latest.json`).  
  - **Hotel Density**: Named/unnamed hotel evidence (`data/marts/hotel_entities/hotel-entity-ledger.json`).  
  - **Spending Allocation**: Public money ledger entries (`data/marts/money_ledger/money-ledger.json`).  
  - **Local Response Contracts**: Missing in current data (noted in `roadmap.md`).  
  - **Demographic Context**: Immigration group data (`data-sources.md`).  

- **Burnley’s Prominence**: Burnley’s high pressure likely stems from its **hotel entity density** (4 named sites in `hotel-entity-ledger.json`) and **asylum support rates** (see `local-route-latest.json`).  

- **Data Gaps**:  
  - Hotel integrity signals and subcontractor data are sparse (only 4 integrity signals in `hotel-entity-ledger.json`).  
  - Money ledger lacks local response contracts (critical for spending analysis).  

---

### **2. Next Steps**  
1. **Analyze Local Route Data**  
   - Inspect `data/marts/uk_routes/local-route-latest.json` to extract metrics for Blackpool, Blackburn, and Burnley.  
   - Command:  
     ```bash
     jq '.[] | select(.area == "Blackpool" or .area == "Blackburn" or .area == "Burnley")' data/marts/uk_routes/local-route-latest.json
     ```  

2. **Map Hotel Density**  
   - Cross-reference `hotel-entity-ledger.json` and `hotel-area-sightings.json` for these areas.  
   - File: `data/marts/hotel_entities/hotel-entity-ledger.json`  

3. **Enrich Money Ledger**  
   - Add local response contracts from Lancashire County Council (see `data-sources.md` for funding sources).  
   - Script: Update `scripts/transform/transform-money-ledger.mjs` to include contract data.  

4. **Define Pressure Index Methodology**  
   - Document weighting rules in `docs/research/data-sources.md` (e.g., 40% asylum routes, 30% hotels, 30% spending).  

5. **Visualize Pressure Rankings**  
   - Update `/compare` page to surface rankings using `BenchmarkStrip` or `KpiCard` components.  

---

### **3. Resources**  
- **Home Office Data**: [Asylum and resettlement stats](https://www.gov.uk/government/statistics/data-on-asylum-and-resettlement-in-local-authority-areas)  
- **Lancashire Funding**: [Lancashire AI DOGE Review](docs/research/lancashire-ai-doge-review.md)  
- **Data Tools**: `jq`, `ndjson-cli` for processing NDJSON files.  

---

### **4. Risks/Blockers**  
- **Incomplete Hotel Data**: Only 9 named sites in ledger; may require manual evidence collection (see `hotel-filters.ts`).  
- **Spending Data Gaps**: Local contracts missing; need to scrape council procurement portals (e.g., [Burnley Contracts](https://www.burnley.gov.uk/procurement))).  
- **Index Weighting**: No existing methodology; requires stakeholder input (prioritize transparency in `sources.md`).  

---  
**Action Now**: Run the `jq` command above to validate route data for the three towns. Begin drafting pressure index rules in `data-sources.md`.