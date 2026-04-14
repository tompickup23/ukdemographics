# Research: INVESTIGATE: 107k on asylum support — 20% in just 10 areas

Generated: 2026-04-13
Project: asylum_stats

### 1. **Key Findings**  
- **Data Concentration**: The 107k asylum support figure likely comes from the Home Office's "Data on asylum and resettlement in local authority areas" (linked in `docs/research/data-sources.md`). The 20% concentration in 10 areas aligns with the platform's focus on local authority comparisons (`uk_routes` mart).  
- **Current Pipeline**: The `uk_routes` mart already tracks 13,482 observations across 361 areas, including asylum support metrics (`src/data/live/local-route-latest.json`). The `transform-routes.mjs` script processes this data.  
- **Visual Gaps**: The roadmap notes weak comparative visuals in right-hand panels (e.g., `RegionAuthorityStage.astro`, `BenchmarkStrip.astro`).  

### 2. **Next Steps**  
1. **Validate Data Source**:  
   - Fetch latest Home Office local authority data:  
     ```bash  
     curl -O https://data.gov.uk/dataset/asylum-support-and-resettlement-statistics-local-authority-data  
     ```  
   - Compare against `data/raw/uk_routes/` to confirm 107k figure.  

2. **Update Transformation Script**:  
   - Modify `scripts/transform/transform-routes.mjs` to highlight top 10 areas with highest asylum support counts. Add a `top_areas` field in the output mart.  

3. **Enhance Visual Components**:  
   - Update `src/components/BenchmarkStrip.astro` to display a heatmap of asylum support density.  
   - Add a "Top 10 Areas" section to `src/pages/compare.astro` using the `top_areas` field.  

4. **Strengthen Money Ledger**:  
   - Add a `money-ledger` filter in `src/scripts/money-explorer.ts` to cross-reference asylum support funding against local authority data.  

5. **QA Checks**:  
   - Run:  
     ```bash  
     node scripts/transform/transform-routes.mjs --validate  
     ```  
   - Verify alignment with `docs/product/asylum-data-scope.md` rules (e.g., asylum support vs. context-only data).  

### 3. **Resources**  
- **Home Office Data**: [Asylum Support & Resettlement Statistics](https://data.gov.uk/dataset/asylum-support-and-resettlement-statistics-local-authority-data)  
- **Platform Docs**: `docs/research/data-sources.md`, `docs/product/data-architecture.md`  
- **Tools**: Node.js, GitHub Actions (for data refresh), VS Code (for component edits).  

### 4. **Risks/Blockers**  
- **Data Latency**: Home Office updates may lag, causing discrepancies with the 107k figure.  
- **Normalization Gaps**: Local authority data might lack granularity (e.g., missing subregion splits in `data-architecture.md`).  
- **Visual Debt**: Weakness in `RegionAuthorityStage.astro` could delay comparative analysis features.  

**Immediate Action**: Prioritize fetching and validating the latest Home Office dataset to confirm the 107k figure. Then update the transformation script and components to surface the 10-area concentration.