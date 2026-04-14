# Research: Replace remaining mock place pages with generated pages from live marts

Generated: 2026-04-07
Project: asylum_stats

**Research Brief: Replace Mock Place Pages with Live Marts (Priority H)**

---

### **Key Findings**
1. **Mock Place Pages Identified**
   - The project still contains mock place pages that need replacing with live-generated content from `src/data/live/` marts.
   - **File Paths for Mock Pages**:
     - `src/pages/places/[placeId].astro` (likely the primary mock place page)
     - `src/pages/regions/[regionId].astro` (may also contain mock content)
   - **Live Marts Available**:
     - `src/data/live/route-dashboard.json` (UK routes)
     - `src/data/live/local-route-latest.json` (local authority routes)
     - `src/data/live/hotel-entity-ledger.json` (hotel data)
     - `src/data/live/money-ledger.json` (public money data)
     - `src/data/live/hotel-area-sightings.json` (unnamed hotel sightings)

2. **Current Data Pipeline**
   - Marts are generated via transform scripts (e.g., `scripts/transform/transform-routes.mjs`).
   - **Live marts are already consumed** in other pages (e.g., compare, hotels, spending) via `src/lib/*` loaders.
   - **No need to rewrite the architecture**—just extend existing patterns.

3. **Place Page Structure**
   - Place pages should mirror the **two-panel discipline** used in `src/components/RegionAuthorityStage.astro` (left: map/chart, right: data deck).
   - **Example Components to Reuse**:
     - `RegionAuthorityStage.astro` (for geographic drilldown)
     - `LocalEvidenceTimeline.astro` (for local route data)
     - `InvestigationTrail.astro` (for money/hotel/entity links)

---

### **Next Steps**
1. **Audit Mock Pages**
   - Run a search for `mock` or `placeholder` in `src/pages/places/` and `src/pages/regions/`:
     ```bash
     grep -r "mock\|placeholder" src/pages/places/ src/pages/regions/
     ```
   - **Expected Output**: Identify hardcoded/mock content (e.g., placeholder charts or text).

2. **Replace Mock Content with Live Marts**
   - **For `[placeId].astro`**:
     - Load data from `src/data/live/local-route-latest.json` (local authority routes) and `src/data/live/hotel-area-sightings.json` (hotels in the area).
     - **Example Loader**:
       ```javascript
       // src/lib/place-data.ts
       import localRouteData from '../data/live/local-route-latest.json';
       export function getPlaceData(placeId: string) {
         return localRouteData.find(d => d.placeId === placeId);
       }
       ```
     - **Example Component Update**:
       ```astro
       ---
       import { getPlaceData } from '../lib/place-data';
       const place = getPlaceData(Astro.params.placeId);
       ---
       <LocalEvidenceTimeline data={place.evidence} />
       <InvestigationTrail items={place.moneyLinks} />
       ```

3. **Update Region Pages**
   - **File**: `src/pages/regions/[regionId].astro`
   - **Action**: Replace mock region summaries with data from:
     - `src/data/live/route-dashboard.json` (national routes)
     - `src/data/live/hotel-entity-ledger.json` (hotels in the region)
   - **Example**:
     ```astro
     ---
     import routeData from '../../data/live/route-dashboard.json';
     const region = routeData.find(d => d.regionId === Astro.params.regionId);
     ---
     <KpiCard title="Asylum Support" value={region.asylumSupportCount} />
     ```

4. **Verify Drilldown Consistency**
   - Ensure the **same panel discipline** is applied across:
     - Home (`src/pages/index.astro`)
     - Compare (`src/pages/compare/[routeId].astro`)
     - Places/Regions
   - **Check**: `src/components/RegionAuthorityStage.astro` is reused in all three.

5. **Test the Build**
   - Run the Astro dev server and verify place/region pages load live data:
     ```bash
     npm run dev
     ```
   - **Expected**: No console errors; data renders correctly.

---
### **Resources**
- **Live Marts**: `src/data/live/*.json`
- **Transform Scripts**: `scripts/transform/*.mjs` (e.g., `transform-routes.mjs`)
- **Component Patterns**:
  - `RegionAuthorityStage.astro` (two-panel layout)
  - `LocalEvidenceTimeline.astro` (local route data)
  - `InvestigationTrail.astro` (money/hotel links)
- **Documentation**:
  - `docs/product/site-plan.md` (page structure)
  - `docs/product/data-architecture.md` (data flow)

---
### **Risks/Blockers**
1. **Missing Data in Marts**
   - **Risk**: A place/region may lack data in live marts.
   - **Mitigation**: Check `src/data/live/*.json` for gaps. If missing, update transform scripts (e.g., `scripts/transform/transform-routes.mjs`).
   - **Command**:
     ```bash
     jq 'length' src/data/live/local-route-latest.json  # Should return >0
     ```

2. **Breaking Changes**
   - **Risk**: Updating place pages may break existing links (e.g., from compare pages).
   - **Mitigation**: Use the same `placeId`/`regionId` keys across all pages. Verify with:
     ```bash
     npm run build  # Check for Astro errors
     ```

3. **Performance**
   - **Risk**: Large JSON marts may slow page loads.
   - **Mitigation**: Use Astro’s `partial` hydration or lazy-load components (e.g., `InvestigationTrail`).

---
**Action**: Start with `[placeId].astro` and `[regionId].astro`, then validate the build. Proceed to supplier/money detail pages next.