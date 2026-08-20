# Research: Carry place drilldown consistently into compare, hotels, spending pages

Generated: 2026-04-07
Project: asylum_stats

**Research Brief: Extending Place Drilldown to Compare, Hotels, and Spending Pages**
*Priority: H | Project: Asylum Stats*

---

### **Key Findings**
1. **Current State**:
   - Place drilldown works on `Home`, `/places/`, and region pages (via `RegionAuthorityStage.astro`, `HomeMapStage.astro`).
   - Live marts (`route-dashboard.json`, `hotel-entity-ledger.json`, `money-ledger.json`) exist in `src/data/live/` but are not consistently used in **Compare**, **Hotels**, or **Spending** pages.
   - Place drilldown logic is centralized in `place-drilldown.ts` and `place-directory.ts` (lib files).

2. **Gaps**:
   - **Compare Page**: Uses `compare-explorer.ts` but lacks fixed-panel place drilldown (per `site-plan.md`).
   - **Hotels Page**: Entity-ledger (`hotel-entity-ledger.json`) lacks place-aware filtering.
   - **Spending Page**: Money-ledger (`money-ledger.json`) has no spatial context in current UI.

3. **Opportunities**:
   - Reuse `RegionAuthorityStage.astro` component (already used in Home/Region pages) for consistent UX.
   - Extend `place-drilldown.ts` to filter marts by place (e.g., Burnley) in Compare/Hotels/Spending.

---

### **Next Steps**

#### **1. Update Compare Page (`/compare/`)**
- **Action**: Replace mock place controls with `RegionAuthorityStage.astro`.
  - **File**: `src/pages/compare.astro`
  - **Code**:
    ```astro
    ---
    import RegionAuthorityStage from '../components/RegionAuthorityStage.astro';
    const currentPlace = "Burnley"; // Dynamic via URL param
    ---
    <RegionAuthorityStage place={currentPlace} />
    ```
- **Test**: Run `npm run dev` and verify drilldown works in Compare.

#### **2. Extend Hotels Page (`/hotels/`)**
- **Action**: Add place filter to `hotel-entity-ledger.json`.
  - **File**: `scripts/transform/transform-hotel-entities.mjs`
  - **Code**:
    ```javascript
    // Add place field to canonical rows
    const withPlace = hotel => ({
      ...hotel,
      place: hotel.localAuthority // or derive from postcode
    });
    ```
- **File**: `src/pages/hotels.astro`
  - Use `RegionAuthorityStage.astro` + filter ledger by `place`:
    ```astro
    ---
    import { filterByPlace } from '../lib/hotel-data.ts';
    const hotels = filterByPlace("Burnley");
    ---
    ```

#### **3. Enhance Spending Page (`/spending/`)**
- **Action**: Add spatial context to `money-ledger.json`.
  - **File**: `scripts/transform/transform-money-ledger.mjs`
  - **Code**:
    ```javascript
    // Add place field to money rows
    const withPlace = row => ({
      ...row,
      place: row.localAuthority || row.supplierLocation
    });
    ```
- **File**: `src/pages/spending.astro`
  - Use `RegionAuthorityStage.astro` + group money rows by place:
    ```astro
    ---
    import { groupByPlace } from '../lib/money-data.ts';
    const moneyByPlace = groupByPlace("Burnley");
    ---
    ```

#### **4. Verify Data Flow**
- **Command**: Rebuild marts:
  ```bash
  npm run transform:all
  ```
- **Check Outputs**:
  ```bash
  cat src/data/live/hotel-entity-ledger.json | jq '.[] | select(.place == "Burnley")'
  ```

---

### **Resources**
- **Components**:
  - `RegionAuthorityStage.astro` (reusable drilldown)
  - `place-drilldown.ts` (core logic)
- **Data**:
  - `src/data/live/hotel-entity-ledger.json`
  - `src/data/live/money-ledger.json`
- **Transform Scripts**:
  - `scripts/transform/transform-hotel-entities.mjs`
  - `scripts/transform/transform-money-ledger.mjs`

---

### **Risks/Blockers**
- **Data Gaps**: Some hotels/money rows lack `localAuthority` fields. Fix via:
  ```bash
  # Manual edit in data/manual/hotel-entities.csv
  ```
- **Performance**: Large marts may slow pages. Optimize with:
  ```javascript
  // In lib files, use memoization or pagination
  ```