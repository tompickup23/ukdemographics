# Research: Run fetch-routes.mjs — refresh GOV.UK route data

Generated: 2026-04-07
Project: asylum_stats

### **Research Brief: Running `fetch-routes.mjs` to Refresh GOV.UK Route Data**

#### **Key Findings**
1. **Purpose of `fetch-routes.mjs`**:
   - Fetches and refreshes UK asylum/refugee route data from GOV.UK sources.
   - Outputs structured data for the `uk_routes` mart (`data/canonical/uk_routes/` → `src/data/live/route-dashboard.json`).
   - Critical for the **Compare** and **Routes** pages in the Astro site.

2. **Current Data Flow**:
   - Raw GOV.UK CSVs/JSONs → `data/raw/` → `scripts/fetch/fetch-routes.mjs` → `data/canonical/uk_routes/` → `src/data/live/route-dashboard.json`.
   - Existing marts are already live but may need updates due to GOV.UK schema changes or new releases.

3. **Dependencies**:
   - Requires Node.js (v18+ recommended).
   - Uses `node-fetch` or `axios` (check `package.json` for exact deps).
   - Relies on GOV.UK URLs defined in `scripts/fetch/fetch-routes.mjs`.

4. **Potential Issues**:
   - GOV.UK may change CSV/JSON schemas (e.g., column renames, new fields).
   - Rate limits or 404s if URLs are outdated (check `data-sources.md` for official links).

---

#### **Next Steps**
1. **Verify the Script**:
   - Path: `/opt/asylumstats/scripts/fetch/fetch-routes.mjs`
   - Check for:
     - Correct GOV.UK URLs (e.g., `https://www.gov.uk/government/statistics/data-on-asylum-and-resettlement-in-local-authority-areas`).
     - Error handling for missing/changed fields.

2. **Run the Script**:
   ```bash
   cd /opt/asylumstats
   node scripts/fetch/fetch-routes.mjs
   ```
   - Expected output:
     - New files in `data/canonical/uk_routes/` (NDJSON + manifests).
     - Updated `src/data/live/route-dashboard.json`.

3. **Validate Outputs**:
   - Compare old vs. new `route-dashboard.json`:
     ```bash
     diff src/data/live/route-dashboard.json src/data/live/route-dashboard.json.bak
     ```
   - Check Astro dev server for errors:
     ```bash
     npm run dev
     ```

4. **Update Dependencies (if needed)**:
   - Ensure `node-fetch` or `axios` is installed:
     ```bash
     npm install node-fetch@3
     ```

5. **Automate Future Runs**:
   - Add to `cron` or GitHub Actions (example `.github/workflows/fetch-routes.yml`):
     ```yaml
     - name: Refresh route data
       run: node scripts/fetch/fetch-routes.mjs
     ```

---

#### **Resources**
- **GOV.UK Data Sources**:
  - [Asylum & Resettlement in Local Authority Areas](https://www.gov.uk/government/statistics/data-on-asylum-and-resettlement-in-local-authority-areas)
  - [Migration Statistics Release Calendar](https://www.gov.uk/government/collections/migration-statistics)
- **Node.js**: [v18+ Docs](https://nodejs.org/docs/latest-v18.x/)
- **Astro**: [Data Loading Guide](https://docs.astro.build/en/guides/data-loading/)

---
#### **Risks/Blockers**
- **GOV.UK API Changes**: If URLs/schemas break, update `fetch-routes.mjs` immediately.
- **Missing Fields**: Script may fail silently. Add `console.log` debug steps.
- **Rate Limits**: Use `setTimeout` between fetches if throttling occurs.

**Priority**: M (Medium) – Critical for data freshness but not blocking current MVP.