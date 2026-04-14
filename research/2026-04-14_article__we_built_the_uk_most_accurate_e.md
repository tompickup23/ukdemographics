# Research: Article: We built the UK most accurate ethnic projection model — because nobody else would

Generated: 2026-04-14
Project: asylum_stats

**Research Brief: "We built the UK’s most accurate ethnic projection model — because nobody else would"**

### **Key Findings**
1. **No Public Ethnic Projection Model Exists**
   - UK lacks an **official ethnic breakdown projection model** for asylum/refugee data. Existing models (e.g., ONS projections) focus on general population, not asylum routes.
   - **Competitor gap**: No NGO, think tank, or government body publishes granular ethnic projections for asylum seekers by route (e.g., Afghan, Syrian, Ukrainian).
   - **File reference**: `docs/research/competitors.md` confirms no direct competitor in this space.

2. **Ethnic Data Sources Are Fragmented**
   - **Home Office immigration stats** (e.g., [Asylum Applications by Ethnicity](https://www.gov.uk/government/statistics/immigration-system-statistics-quarterly-release)) provide **historical ethnic breakdowns** but **not forward projections**.
   - **Local authority data** (e.g., `data/raw/la-asylum-support-*.csv`) includes ethnicity fields but lacks modeling methodology.
   - **File reference**: `docs/research/data-sources.md` lists ethnicity sources under "Core official sources."

3. **Ethnic Projection Feasibility**
   - **Methodology**: Use **historical asylum applicant ethnicity trends** + **ONS population projections** + **route-specific growth assumptions** (e.g., Afghan schemes post-2021).
   - **Data gaps**:
     - No **official ethnic projections** for asylum routes.
     - **Local authority ethnicity data** is inconsistent (some LAs report, others don’t).
   - **File reference**: `docs/product/data-architecture.md` outlines canonical data model; ethnicity could be added as a derived field.

4. **Integration with Asylum Stats Platform**
   - **Current gaps**:
     - No ethnic breakdown in `uk_routes` mart (`src/data/live/route-dashboard.json`).
     - No ethnic filters in `hotel_entities` or `money_ledger`.
   - **Opportunity**: Add **ethnic projection as a new mart** (`uk_ethnic_projections.json`) with drilldown to LA level.

---

### **Next Steps (Actionable)**
1. **Build Ethnic Projection Mart**
   - **Step 1**: Create `scripts/transform/transform-ethnic-projections.mjs`
     ```javascript
     // Pseudocode for projection logic
     import { readCsv } from './lib/csv-reader.mjs';
     import { writeNdjson } from './lib/ndjson-writer.mjs';

     const ethnicData = await readCsv('data/raw/asylum-ethnicity-historical.csv');
     const onsProjections = await readCsv('data/raw/ons-population-projections.csv');

     // Apply growth assumptions by route (e.g., Afghan schemes = +20% Asian ethnicity)
     const projections = ethnicData.map(row => ({
       ...row,
       projected_2026: row.ethnic_group * 1.2, // Example growth factor
     }));

     await writeNdjson(projections, 'data/canonical/ethnic_projections/');
     ```
   - **Step 2**: Export to `src/data/live/ethnic-projections.json`
   - **Step 3**: Add new page `/routes/ethnic-projections` (mirror `routes/` structure).

2. **Extend Existing Marts with Ethnicity**
   - Modify `scripts/transform/transform-routes.mjs` to include ethnicity fields:
     ```javascript
     // Add to uk_routes canonical output
     const routeWithEthnicity = {
       ...routeData,
       ethnic_breakdown: await loadEthnicProjections(routeData.la_code),
     };
     ```

3. **Add Ethnic Filters to UI**
   - Update `src/components/RegionTileMap.astro` to include ethnicity dropdown:
     ```astro
     <select onChange={(e) => filterByEthnicity(e.target.value)}>
       <option value="all">All Ethnicities</option>
       <option value="asian">Asian</option>
       <option value="african">African</option>
     </select>
     ```

4. **Source New Ethnicity Data**
   - **API**: ONS Population Projections ([link](https://www.ons.gov.uk/peoplepopulationandcommunity/populationandmigration/populationprojections))
   - **CSV**: Home Office ethnicity stats ([link](https://www.gov.uk/government/statistics/immigration-system-statistics-quarterly-release))
   - **Manual**: Add LA-specific ethnicity data from `data/raw/la-asylum-support-*.csv`.

---

### **Resources**
| Resource | URL | Purpose |
|----------|-----|---------|
| ONS Population Projections | [https://www.ons.gov.uk/peoplepopulationandcommunity/populationandmigration/populationprojections](https://www.ons.gov.uk/peoplepopulationandcommunity/populationandmigration/populationprojections) | Base population growth assumptions |
| Home Office Ethnicity Data | [https://www.gov.uk/government/statistics/immigration-system-statistics-quarterly-release](https://www.gov.uk/government/statistics/immigration-system-statistics-quarterly-release) | Historical asylum applicant ethnicity |
| Asylum Stats Data Pipeline | `/opt/asylumstats/scripts/transform/` | Reuse existing NDJSON/JSON transforms |

---

### **Risks/Blockers**
1. **Data Gaps**
   - Some LAs **don’t report ethnicity** in asylum support data. Fallback: Use regional averages (e.g., North West ethnic distribution).
   - **Mitigation**: Flag missing data in `src/data/live/ethnic-projections.json` with `is_estimated: true`.

2. **Methodology Criticism**
   - Projections may be accused of **bias** (e.g., overestimating certain ethnic groups).
   - **Mitigation**: Publish **full methodology** in `docs/methodology/ethnic-projections.md` with sensitivity analysis.

3. **Performance**
   - Adding ethnicity to `route-dashboard.json` may **bloat the file** (current size: ~1.2MB).
   - **Mitigation**: Split into `route-dashboard.json` (core) and `route-ethnicity.json` (optional).

---
**Priority**: High (H) – fills a critical gap in UK asylum data accountability. **Next action**: Create `transform-ethnic-projections.mjs` and validate with Burnley LA data.