# Research: Strengthen right-hand place/region panels — richer comparative visuals

Generated: 2026-04-07
Project: asylum_stats

### **Research Brief: Strengthening Right-Hand Place/Region Panels with Richer Comparative Visuals**
**Priority: H** | **Project: Asylum Stats**

---

#### **1. Key Findings**
- **Current State**:
  - Right-hand panels exist as static place/region "decks" (e.g., `src/components/DataDrawer.astro`, `src/components/HomeSystemDeck.astro`).
  - Live data marts (`src/data/live/route-dashboard.json`, `local-route-latest.json`, `money-ledger.json`) are underutilized in these panels.
  - Comparative visuals are limited to basic KPI cards (`KpiCard.astro`) and static text.

- **Gaps**:
  - No dynamic charts or comparative metrics in right-hand panels (e.g., asylum vs. resettlement trends, hotel pressure, spending breakdowns).
  - Geographic drilldown (Britain → region → subregion → authority) lacks consistent visual feedback in panels.
  - Missing integration of `money-ledger.json` and `hotel-entity-ledger.json` into place/region comparisons.

- **Opportunities**:
  - Leverage existing transform scripts (`scripts/transform/transform-routes.mjs`, `transform-money-ledger.mjs`) to precompute comparative metrics.
  - Use `RegionTileMap.astro` and `TrendChart.astro` components as templates for richer visuals.

---

#### **2. Next Steps**
**A. Enhance Right-Hand Panels**
1. **Update `DataDrawer.astro`** (path: `/opt/asylumstats/src/components/DataDrawer.astro`):
   - Add dynamic charts using `TrendChart.astro` for route comparisons (e.g., asylum vs. resettlement trends).
   - Integrate `money-ledger.json` to show spending breakdowns by place/region.
   - **Command**:
     ```bash
     # Test changes locally
     cd /opt/asylumstats && npm run dev
     ```

2. **Modify `HomeSystemDeck.astro`** (path: `/opt/asylumstats/src/components/HomeSystemDeck.astro`):
   - Replace static text with comparative visuals (e.g., "Pressure Ranking" from `local-route-latest.json`).
   - Add a "Money at a Glance" section using `money-data.ts` (`/opt/asylumstats/src/lib/money-data.ts`).

**B. Precompute Comparative Metrics**
1. Extend `transform-routes.mjs` (path: `/opt/asylumstats/scripts/transform/transform-routes.mjs`) to:
   - Calculate **per-place/region** asylum vs. resettlement ratios.
   - Output to `src/data/live/place-comparison.json`.
   **Example snippet**:
   ```javascript
   // In transform-routes.mjs
   const placeComparison = areas.map(area => ({
     area,
     asylumRatio: area.asylum / (area.asylum + area.resettlement),
     spending: moneyLedger.filter(row => row.area === area.id).reduce((sum, row) => sum + (row.amount || 0), 0)
   }));
   ```

2. Add a new `PlaceComparisonCard.astro` component (path: `/opt/asylumstats/src/components/PlaceComparisonCard.astro`) to display these metrics.

**C. Integrate Hotel Pressure Visuals**
- Use `hotel-area-sightings.json` to add a "Hotel Pressure" gauge in right-hand panels.
- **File**: `/opt/asylumstats/src/lib/hotel-data.ts` (extend to compute pressure scores).

---

#### **3. Resources**
- **Data Files**:
  - `src/data/live/route-dashboard.json` (route metrics)
  - `src/data/live/money-ledger.json` (spending data)
  - `src/data/live/hotel-area-sightings.json` (hotel pressure)
- **Components**:
  - `TrendChart.astro`, `KpiCard.astro`, `RegionTileMap.astro`
- **Libraries**:
  - D3.js (for custom charts) or Chart.js (simpler integration).

---

#### **4. Risks/Blockers**
- **Data Latency**: Live marts (`src/data/live/`) may not auto-update. Ensure transforms run on data changes.
  **Fix**: Add a `watch` script in `package.json`:
  ```json
  "scripts": {
    "watch:data": "nodemon --watch data/raw --exec 'npm run transform'"
  }
  ```
- **Visual Clutter**: Right-hand panels may become overloaded.
  **Fix**: Prioritize top 3 metrics per panel (e.g., asylum ratio, spending, hotel pressure).

---
**Action**: Start with `DataDrawer.astro` and `transform-routes.mjs` updates. Validate with `npm run dev` before scaling.