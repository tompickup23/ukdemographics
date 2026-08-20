# Research: Rebuild base from Census single-year data (eliminate IPF)

Generated: 2026-04-14
Project: asylum_stats

### **Research Brief: Rebuild Base from Census Single-Year Data (Eliminate IPF)**
**Project:** Asylum Stats | **Priority:** H

---

#### **Key Findings**
1. **Current Data Pipeline Gap:**
   - The project relies on **official asylum/refugee statistics** (e.g., Home Office datasets) but lacks a **single-year census-based rebuild** to eliminate **Iterative Proportional Fitting (IPF)** dependencies.
   - **`data-sources.md`** confirms no direct census integration for asylum metrics, but **`archival-recovery.md`** suggests web archives could recover older regional series.

2. **Relevant Files:**
   - **Transform Scripts:** `scripts/transform/transform-routes.mjs` (routes), `scripts/transform/transform-hotel-entities.mjs` (hotels).
   - **Canonical Data:** `data/canonical/uk_routes/` (current route marts).
   - **Live Marts:** `src/data/live/route-dashboard.json`, `src/data/live/local-route-latest.json`.

3. **Census Data Opportunity:**
   - **UK Census 2021** (via [ONS](https://www.ons.gov.uk/)) includes **migration/refugee-related variables** (e.g., country of birth, nationality) that could proxy asylum flows.
   - **No direct IPF use** in current pipeline, but **`data-architecture.md`** warns against overhauling the stack without need.

---

#### **Next Steps**
1. **Extract Census Variables:**
   - Download **2021 Census Table TS007 (Country of Birth)** and **TS008 (Passports Held)** from [ONS](https://www.ons.gov.uk/census).
   - **Command:**
     ```bash
     curl -o data/raw/census-2021-ts007.csv "https://www.ons.gov.uk/file?uri=/census/2021/census-data/2021-census-ts007-england-and-wales.csv"
     ```

2. **Rebuild Route Marts:**
   - Modify `scripts/transform/transform-routes.mjs` to:
     - Replace IPF-dependent rows with **census-derived asylum proxies** (e.g., non-UK-born populations in Burnley).
     - **File Path:** `/opt/asylumstats/scripts/transform/transform-routes.mjs`.
     - **Example Code Snippet:**
       ```javascript
       // Replace IPF logic with census join
       const censusData = await loadCensusData('data/raw/census-2021-ts007.csv');
       const routeMart = joinByLA(canonicalRoutes, censusData, 'la_code');
       ```

3. **Validate Against Official Data:**
   - Compare rebuilt marts (`data/marts/uk_routes/`) with **Home Office asylum support stats** (`data/raw/immigration-system-statistics.csv`).
   - **Command:**
     ```bash
     node scripts/validate/validate-routes.mjs
     ```

4. **Update Live Marts:**
   - Regenerate `src/data/live/route-dashboard.json` and `local-route-latest.json`:
     ```bash
     npm run transform:routes
     ```

---

#### **Resources**
- **Census Data:**
  - [ONS 2021 Census Tables](https://www.ons.gov.uk/census/2021/census-data/2021censusdatatables)
- **Validation Tools:**
  - [R `ipf` Package](https://cran.r-project.org/web/packages/ipflsap/) (for IPF-free alternatives).
- **Current Pipeline Docs:**
  - `docs/product/data-architecture.md` (repository layout).

---
#### **Risks/Blockers**
1. **Census vs. Asylum Data Mismatch:**
   - Census counts **all migrants**, not just asylum seekers. **Mitigation:** Use **Home Office small boats data** (`data/raw/immigration-system-statistics.csv`) to filter.
2. **IPF Dependency in Legacy Code:**
   - Search for `ipf` in `scripts/transform/`:
     ```bash
     grep -r "ipf" scripts/transform/
     ```
   - Replace with **direct joins** or **weighted averages**.

---
**Action:** Prioritize **Step 2 (rebuild route marts)** to unblock Phase 1 of `roadmap.md`.