# Research: INVESTIGATE: 5 councils estimated minority WB before 2050 on Census trends

Generated: 2026-04-13
Project: asylum_stats

1. **Key Findings**  
   - The existing `uk_routes` mart (src/data/live/route-dashboard.json) contains local authority asylum support data but lacks ethnic demographic projections.  
   - Docs/research/data-sources.md confirms no current integration of ONS Census projections or ethnicity breakdowns.  
   - The Home Office's "local authority data on immigration groups" (last row in core sources table) may contain contextual demographic data but is not yet processed.  
   - New data required: ONS Subnational Population Projections by ethnicity (2020-based, 2022-based when available).  

2. **Next Steps**  
   ```bash
   # 1. Fetch ONS Census projections (example URL structure - actual URL requires council selection)
   wget https://data.gov.uk/dataset/subnational-population-projections-ethnicity -O data/raw/ons_projections.csv

   # 2. Create new canonical directory
   mkdir -p data/canonical/demographic_projections

   # 3. Transform ONS data to canonical NDJSON (example script - adjust for actual data structure)
   node scripts/transform/transform-ons-projections.mjs

   # 4. Add new mart export
   mkdir -p data/marts/demographic_projections
   # Generate src/data/live/demographic-projections.json
   ```

   - Add new section to `/compare` page to show projections vs current asylum routes  
   - Update `docs/product/asylum-data-scope.md` to include "context-only" demographic projections per scope rules  

3. **Resources**  
   - [ONS Subnational Population Projections (ethnicity)](https://data.gov.uk/dataset/subnational-population-projections-ethnicity)  
   - [Census 2021 Ethnicity Data](https://census.gov.uk/census/census-2021-data/ethnicity)  
   - `docs/research/data-sources.md` for existing asylum data context  
   - `src/lib/route-data.ts` as example for integrating new projection data  

4. **Risks/Blockers**  
   - ONS projections may not include all 5 councils - manual FOI requests may be needed  
   - Data scope conflict: Demographic projections are "context-only" per product rules but require explicit labeling  
   - Missing 2023-2050 time series in current data architecture (requires new time handling in transform scripts)  
   - Visualizing projections vs actuals may confuse users - needs clear methodology notes  

**Immediate Action**: Fetch ONS projections for Lancashire, Birmingham, Manchester, Leicester, and Bristol (historically early minority-WB councils) using automated script.