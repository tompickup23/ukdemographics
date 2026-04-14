# Research: INVESTIGATE: Hyndburn — pop 86k, asylum rate higher than London boroughs

Generated: 2026-04-13
Project: asylum_stats

### 1. **Key Findings**  
- Hyndburn (E07000118) is a Lancashire Borough with 86k population and asylum support rates exceeding London averages. This aligns with the project’s focus on regional disparities in asylum accommodation.  
- Current `uk_routes` mart (`src/data/live/local-route-latest.json`) includes LA-level asylum support counts but lacks Hyndburn-specific analysis.  
- Hotel data for Lancashire is sparse: only 4 named sites exist in `hotel-entity-ledger.json`, none explicitly linked to Hyndburn.  
- Money ledger (`money-ledger.json`) has 11 rows nationally, but no Hyndburn-specific contracts or spending.  
- Competitor analysis (`docs/research/competitors.md`) highlights gaps in local authority hotel cost transparency, a priority for Hyndburn.  

---

### 2. **Next Steps**  
**A. Validate Hyndburn’s Asylum Stats**  
- Check latest Home Office LA data:  
  ```bash  
  curl -s https://data.gov.uk/dataset/asylum-seekers-support-by-local-authority-area | jq -r '.[] | select(.area == "Hyndburn")'  
  ```  
- Update `transform-routes.mjs` to include Hyndburn in `local-route-latest.json` if missing.  

**B. Investigate Hyndburn Hotel Evidence**  
- Search Lancashire County Council press releases and FOIA logs for hotel contracts.  
- Add findings to `data/manual/hotel_entities/hyndburn.csv` and run:  
  ```bash  
  node scripts/transform/transform-hotel-entities.mjs  
  ```  

**C. Expand Money Ledger for Hyndburn**  
- Scrape Hyndburn LA’s contracts register (https://hyndburn.gov.uk/foi-contracts) for asylum-related spending.  
- Add rows to `data/manual/money_ledger/hyndburn-spending.csv` with `route_type`, `amount_gbp`, and `supplier`.  

**D. Update Compare Page**  
- Modify `src/pages/compare.ts` to include Hyndburn in LA comparisons using its ONS code (E07000118).  

---

### 3. **Resources**  
- **Home Office Data**: [Asylum Seekers Support by LA](https://data.gov.uk/dataset/asylum-seekers-support-by-local-authority-area)  
- **Hyndburn Contracts Register**: https://hyndburn.gov.uk/foi-contracts  
- **Lancashire FOIA Hub**: https://lancashire.gov.uk/freedom-of-information/  
- **CSVKit**: `pip install csvkit` (for manual data cleanup)  

---

### 4. **Risks/Blockers**  
- **Data Gaps**: Hyndburn may not publish granular asylum spending data; manual FOIA requests may be required.  
- **Hotel Secrecy**: Contractors may obscure ownership via subsidiaries (see `docs/research/hotel-and-accountability-sources.md`).  
- **Time Constraints**: Phase 2 spatial analysis must align with current Astro components (e.g., `RegionMapExplorer.astro`).  

**Immediate Action**: Fetch Hyndburn’s latest asylum stats and hotel contracts by 2026-03-21 to align with the roadmap’s Phase 2 kickoff.