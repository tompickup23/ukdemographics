# Research: Add county/cluster-aware geography for long regions

Generated: 2026-04-07
Project: asylum_stats

### **Research Brief: Add County/Cluster-Aware Geography for Long Regions**
**Priority: M (Medium) | Project: Asylum Stats**

---

#### **1. Key Findings**
- The project already has a **geographic drilldown system** (`Britain → Region → Subregion → Authority`) but lacks **county/cluster-aware treatment** for long regions (e.g., Lancashire, Yorkshire).
- The **`RegionTileMap.astro`** and **`RegionMapExplorer.astro`** components handle clustering but do not yet distinguish between **county-level clusters** (e.g., Lancashire) and **long-region clusters** (e.g., North West).
- The **`place-directory.ts`** (`/opt/asylumstats/src/lib/place-directory.ts`) likely contains geographic hierarchies but may need extension for county/cluster metadata.
- The **`data/canonical/uk_routes/`** and **`data/marts/uk_routes/`** structures may need augmentation to include **county/cluster identifiers** for long regions.

**Relevant Files:**
- `/opt/asylumstats/src/components/RegionTileMap.astro` (handles clustering)
- `/opt/asylumstats/src/lib/place-directory.ts` (geographic hierarchy)
- `/opt/asylumstats/src/data/live/route-dashboard.json` (current geographic data structure)

---

#### **2. Next Steps**
**A. Define County/Cluster Boundaries**
1. **Review existing geographic data** in `place-directory.ts`:
   ```bash
   cat /opt/asylumstats/src/lib/place-directory.ts
   ```
   - Check if `county` or `cluster` fields exist. If not, extend the schema.

2. **Update place directory** to include **county/cluster metadata**:
   - Example addition:
     ```typescript
     interface Place {
       id: string;
       name: string;
       region: string;
       county?: string; // e.g., "Lancashire"
       cluster?: string; // e.g., "North West Long Region"
     }
     ```
   - **File to modify:** `/opt/asylumstats/src/lib/place-directory.ts`

**B. Modify RegionTileMap.astro for County/Cluster Awareness**
1. **Update clustering logic** in `RegionTileMap.astro`:
   - Reference: `/opt/asylumstats/src/components/RegionTileMap.astro`
   - Add conditional styling for long regions:
     ```astro
     {place.cluster === "North West Long Region" && (
       <div class="long-region-cluster">{place.name}</div>
     )}
     ```

2. **Test with sample data**:
   ```bash
   npm run dev
   ```
   - Verify that **Lancashire** and other long regions render distinctly.

**C. Extend UK Routes Data Mart**
1. **Update `uk_routes` canonical data** to include `county`/`cluster` fields:
   - **File to modify:** `/opt/asylumstats/data/canonical/uk_routes/`
   - Example:
     ```json
     {
       "area": "Lancashire",
       "region": "North West",
       "county": "Lancashire",
       "cluster": "North West Long Region"
     }
     ```

2. **Regenerate marts**:
   ```bash
   node scripts/transform/transform-routes.mjs
   ```

**D. Update Visualization Components**
1. **Modify `RegionMapExplorer.astro`** to support county/cluster filters:
   - **File:** `/opt/asylumstats/src/components/RegionMapExplorer.astro`
   - Add a dropdown for `county`/`cluster` selection.

2. **Test in browser**:
   ```bash
   npm run build && npm run preview
   ```

---

#### **3. Resources**
- **Data Sources:**
  - [Home Office Local Authority Data](https://www.gov.uk/government/statistics/data-on-asylum-and-resettlement-in-local-authority-areas) (for county mappings)
  - [ONS Geography Portal](https://geoportal.statistics.gov.uk/) (for cluster boundaries)
- **Tools:**
  - **Astro:** `/opt/asylumstats/package.json` (check for `@astrojs/map` or similar)
  - **GeoJSON:** Use [UK Police Data API](https://data.police.uk/) for county boundaries.

---
#### **4. Risks/Blockers**
- **Data Gaps:** If `county`/`cluster` fields are missing in source data, manual mapping may be required.
- **Performance:** Large geographic datasets may slow down `RegionTileMap.astro`. Optimize with **topojson** or **simplification**.
- **Provenance:** Ensure any manual mappings are documented in `/docs/research/data-sources.md`.

---
**Next Action:**
1. **Immediate:** Extend `place-directory.ts` with county/cluster metadata.
2. **Short-term:** Modify `RegionTileMap.astro` for conditional styling.
3. **Validation:** Test with `npm run dev` and verify Lancashire/long-region rendering.