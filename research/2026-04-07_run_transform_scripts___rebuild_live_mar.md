# Research: Run transform scripts — rebuild live marts

Generated: 2026-04-07
Project: asylum_stats

**Research Brief: Run Transform Scripts — Rebuild Live Marts (Priority: M)**
*Project: Asylum Stats*
*Date: 2026-03-14*

---

### **Key Findings**
1. **Live Marts Status**:
   - Core marts (`uk_routes`, `hotel_entities`, `money_ledger`) are live but need hardening (see `data-architecture.md`).
   - Outputs are generated via transform scripts in `scripts/transform/` and written to:
     - `data/canonical/` (intermediate NDJSON)
     - `data/marts/` (processed JSON)
     - `src/data/live/` (Astro-ready data).

2. **Broken Map Feature**:
   - Likely tied to outdated `src/data/live/route-dashboard.json` or `local-route-latest.json` (see `site-plan.md`).
   - Verify map data sources in `docs/research/data-sources.md` (Home Office immigration stats).

3. **Transform Scripts**:
   - Current scripts:
     - `scripts/transform/transform-routes.mjs`
     - `scripts/transform/transform-hotel-entities.mjs`
     - `scripts/transform/transform-money-ledger.mjs`
   - All three need re-running to regenerate live marts (see `data-architecture.md`).

4. **Data Flow Gaps**:
   - Local response contracts and subcontractor joins are missing (see `roadmap.md`, Phase 2).
   - Spending normalization is incomplete (see `claude-build-brief.md`).

---

### **Next Steps**
1. **Rebuild Live Marts**:
   - Run transform scripts in order:
     ```bash
     cd /opt/asylumstats
     node scripts/transform/transform-routes.mjs
     node scripts/transform/transform-hotel-entities.mjs
     node scripts/transform/transform-money-ledger.mjs
     ```
   - Verify outputs in:
     - `src/data/live/route-dashboard.json`
     - `src/data/live/hotel-entity-ledger.json`
     - `src/data/live/money-ledger.json`

2. **Fix Map Feature**:
   - Check `src/data/live/route-dashboard.json` for valid geographic data.
   - If missing, re-fetch Home Office data (see `docs/research/data-sources.md`).

3. **Deep Dive Money Ledger**:
   - Add local response contracts (see `claude-build-brief.md`).
   - Normalize funding instruction tables (see `roadmap.md`).

4. **Update Astro Pages**:
   - Replace mock place pages with generated data (see `site-plan.md`).
   - Use `src/lib/route-data.ts`, `src/lib/hotel-data.ts`, and `src/lib/money-data.ts` for data loading.

---
### **Resources**
- **Data Sources**:
  - [Home Office Immigration Stats](https://www.gov.uk/government/collections/immigration-system-statistics)
  - [Local Authority Data](https://www.gov.uk/government/statistics/data-on-asylum-and-resettlement-in-local-authority-areas)
- **Transform Scripts**:
  - `scripts/transform/transform-routes.mjs` (routes)
  - `scripts/transform/transform-hotel-entities.mjs` (hotels)
  - `scripts/transform/transform-money-ledger.mjs` (money)
- **Outputs**:
  - `src/data/live/*.json` (Astro-ready marts)

---
### **Risks/Blockers**
1. **Data Provenance**:
   - Ensure NDJSON outputs in `data/canonical/` are preserved for reproducibility (see `data-architecture.md`).
2. **Map Feature**:
   - If map still fails, check `src/components/RegionTileMap.astro` for outdated data loading logic.
3. **Time Sensitivity**:
   - Home Office data updates quarterly; verify latest release date in `docs/research/data-sources.md`.

---
**Action**: Prioritize running transform scripts to regenerate live marts. Verify map feature post-rebuild.