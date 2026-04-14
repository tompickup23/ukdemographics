# Research: Extend fixed-panel nav model into compare, hotels, spending

Generated: 2026-04-07
Project: asylum_stats

### **Research Brief: Extend Fixed-Panel Nav Model into Compare, Hotels, and Spending**
**Priority:** M | **Project:** Asylum Stats

---

#### **Key Findings**
1. **Current State:**
   - The site has a **fixed two-panel navigation model** (left: map/place entry, right: comparative/deck panel) working on `/places/` and region pages (`RegionAuthorityStage.astro`).
   - **Live marts** (`route-dashboard.json`, `hotel-entity-ledger.json`, `money-ledger.json`) exist in `src/data/live/`, but the **Compare, Hotels, and Spending pages** lack this navigation model.
   - **Transform scripts** (`transform-routes.mjs`, `transform-hotel-entities.mjs`, `transform-money-ledger.mjs`) generate canonical data in `data/canonical/` and marts in `data/marts/`.

2. **Gaps Identified:**
   - **Compare page** (`/compare/`) uses a mock layout (`Compare.astro`) without the fixed-panel model.
   - **Hotels page** (`/hotels/`) and **Spending page** (`/spending/`) lack structured place-entry panels.
   - **Component reuse:** `RegionAuthorityStage.astro` (works for regions) could be adapted for Compare/Hotels/Spending.

3. **Data Flow:**
   - **Input:** Raw data in `data/raw/` (CSV/XLSX) → **Transform:** Scripts in `scripts/transform/` → **Output:** Marts in `src/data/live/`.
   - **Current marts:**
     - `route-dashboard.json` (UK routes)
     - `hotel-entity-ledger.json` (named/unnamed hotels)
     - `money-ledger.json` (public money rows)

---

#### **Next Steps**
1. **Extend Fixed-Panel Model to Compare Page**
   - **Action:** Modify `/src/pages/compare.astro` to use `RegionAuthorityStage.astro` (or a new `CompareStage.astro` component).
   - **Command:**
     ```bash
     cp src/components/RegionAuthorityStage.astro src/components/CompareStage.astro
     # Edit CompareStage.astro to filter routes (uk_routes) for comparison.
     ```
   - **Data Source:** Use `src/data/live/route-dashboard.json` (filter by `area_type: "local_authority"`).

2. **Adapt Model for Hotels Page**
   - **Action:** Update `/src/pages/hotels.astro` to include:
     - Left panel: `RegionTileMap.astro` (for hotel clusters).
     - Right panel: `DataDrawer.astro` (hotel entity ledger).
   - **Command:**
     ```bash
     # Verify hotel data exists in src/data/live/hotel-entity-ledger.json
     cat src/data/live/hotel-entity-ledger.json | jq 'length'  # Should return >0
     ```
   - **Component:** Reuse `HotelFilters.astro` (`src/scripts/hotel-filters.ts`) for filtering.

3. **Add Place-Entry Panels to Spending Page**
   - **Action:** Modify `/src/pages/spending.astro` to mirror the fixed-panel model.
   - **Data Source:** Use `src/data/live/money-ledger.json` (filter by `route_label`).
   - **Command:**
     ```bash
     # Check money-ledger structure
     cat src/data/live/money-ledger.json | jq '.[0]'  # Inspect schema
     ```

4. **Update Navigation Links**
   - **Action:** Ensure all pages (`compare`, `hotels`, `spending`) link to the same place-entry surfaces.
   - **File:** Update `src/components/SiteHeader.astro` to include:
     ```astro
     <a href="/compare/">Compare Routes</a>
     <a href="/hotels/">Hotel Tracker</a>
     <a href="/spending/">Spending Ledger</a>
     ```

5. **Test Data Refresh**
   - **Command:**
     ```bash
     npm run build  # Rebuild marts from raw data
     npm run preview  # Check localhost:3000/compare, /hotels, /spending
     ```

---
#### **Resources**
- **Data Marts:**
  - `src/data/live/route-dashboard.json` (routes)
  - `src/data/live/hotel-entity-ledger.json` (hotels)
  - `src/data/live/money-ledger.json` (spending)
- **Components:**
  - `RegionAuthorityStage.astro` (template for fixed panels)
  - `RegionTileMap.astro` (map clusters)
  - `DataDrawer.astro` (comparative deck)
- **Transform Scripts:**
  - `scripts/transform/transform-routes.mjs`
  - `scripts/transform/transform-hotel-entities.mjs`
  - `scripts/transform/transform-money-ledger.mjs`

---
#### **Risks/Blockers**
1. **Data Gaps:**
   - If `hotel-entity-ledger.json` or `money-ledger.json` is empty, verify transforms:
     ```bash
     node scripts/transform/transform-hotel-entities.mjs
     ```
2. **Component Conflicts:**
   - If `RegionAuthorityStage.astro` doesn’t fit Compare/Hotels/Spending, create new components (`CompareStage.astro`, `HotelStage.astro`).
3. **Performance:**
   - Large `money-ledger.json` may slow pages. Optimize with:
     ```bash
     jq 'map(select(.route_label == "asylum_support"))' src/data/live/money-ledger.json > filtered.json
     ```