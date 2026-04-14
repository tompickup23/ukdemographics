# Research: Extract Home Office nationality dimension from transform pipeline

Generated: 2026-04-14
Project: asylum_stats

### **Research Brief: Extract Home Office Nationality Dimension from Transform Pipeline**
**Project:** Asylum Stats | **Priority:** H

---

#### **Key Findings**
1. **Current Pipeline Structure**:
   - The nationality dimension is likely embedded in the **Home Office immigration system statistics** (see `data-sources.md`).
   - The **`uk_routes`** transform pipeline (`scripts/transform/transform-routes.mjs`) is the primary candidate for extraction, as it processes national asylum data.
   - The **canonical output** is in `data/canonical/uk_routes/` (NDJSON format), which feeds into `src/data/live/route-dashboard.json` and `src/data/live/local-route-latest.json`.

2. **Missing Dimension**:
   - The nationality breakdown (e.g., Syrian, Afghan, Albanian) is not explicitly called out in the current pipeline but is likely available in the raw Home Office CSV/JSON sources (e.g., `data/raw/immigration-system-statistics/`).
   - The **`data-architecture.md`** confirms that nationality is a core dimension in the Home Office datasets.

3. **Relevant Files**:
   - **Transform Script**: `/opt/asylumstats/scripts/transform/transform-routes.mjs`
   - **Raw Data Path**: `/opt/asylumstats/data/raw/immigration-system-statistics/` (check for nationality columns in asylum applications/grants).
   - **Canonical Output**: `/opt/asylumstats/data/canonical/uk_routes/` (verify if nationality is already partially extracted).

---

#### **Next Steps**
1. **Inspect Raw Data**:
   ```bash
   # List raw files (likely CSV/JSON from Home Office)
   ls -la /opt/asylumstats/data/raw/immigration-system-statistics/

   # Check for nationality columns (e.g., "Nationality", "Country of Origin")
   head -n 5 /opt/asylumstats/data/raw/immigration-system-statistics/*asylum*.csv | grep -i "nationality"
   ```
   - If missing, download the latest dataset from:
     [Home Office Immigration System Statistics](https://www.gov.uk/government/collections/immigration-system-statistics).

2. **Modify Transform Script**:
   - Update `/opt/asylumstats/scripts/transform/transform-routes.mjs` to extract nationality from raw data and add it to the canonical output.
   - Example addition:
     ```javascript
     // Inside transform-routes.mjs
     const nationality = row["Nationality"] || row["Country of Origin"];
     output.push({ ...row, nationality });
     ```

3. **Regenerate Marts**:
   ```bash
   # Run the transform pipeline
   cd /opt/asylumstats
   node scripts/transform/transform-routes.mjs

   # Verify output in canonical mart
   head -n 5 /opt/asylumstats/data/canonical/uk_routes/*.ndjson
   ```

4. **Update Live Marts**:
   ```bash
   # Rebuild live JSON marts (if automated)
   npm run build:marts  # Check package.json for exact command
   ```

5. **Validate in Frontend**:
   - Check `src/data/live/route-dashboard.json` for the new `nationality` field.
   - Update components (e.g., `src/components/PathwayMixCard.astro`) to display nationality breakdowns.

---

#### **Resources**
- **Home Office Data**: [Immigration System Statistics](https://www.gov.uk/government/collections/immigration-system-statistics)
- **Schema Reference**: `/opt/asylumstats/schemas/` (check for nationality field definitions).
- **Tooling**: Use `jq` to inspect NDJSON:
  ```bash
  cat /opt/asylumstats/data/canonical/uk_routes/*.ndjson | jq 'select(.nationality)'
  ```

---
#### **Risks/Blockers**
1. **Data Format Changes**:
   - Home Office may restructure CSV columns. Validate with `head` before scripting.
2. **Pipeline Breaks**:
   - Test changes in a branch first:
     ```bash
     git checkout -b feature/nationality-dimension
     ```
3. **Performance**:
   - Large datasets may slow NDJSON processing. Use `pnpm` or `bun` for speed:
     ```bash
     pnpm install && pnpm run transform
     ```

**Action**: Start with Step 1 (inspect raw data) to confirm nationality availability. Proceed to transform script updates if confirmed.