# Research: INVESTIGATE: Blackburn, Burnley, Hyndburn — 3 towns in national top 10

Generated: 2026-04-13
Project: asylum_stats

**Research Brief: Blackburn, Burnley, Hyndburn — 3 towns in national top 10 (Asylum Stats)**

**1. Key Findings**

The project's existing data architecture and live marts are well-positioned to investigate the "national top 10" status of Blackburn, Burnley, and Hyndburn. This ranking likely refers to local authority data on asylum seekers receiving support or similar metrics, which is a core part of the `asylumstats.co.uk` platform's MVP.

*   **Core Data Source:** The most relevant data is derived from the Home Office's "Data on asylum and resettlement in local authority areas" (referenced in `docs/research/data-sources.md`). This provides "Core place-based comparison data" at the local authority level.
*   **Internal Data Mart:** This official data is processed into the `uk_routes` canonical series and exposed via `src/data/live/local-route-latest.json`. This JSON file should contain the latest local authority comparison rows, including counts for asylum seekers receiving support.
*   **Existing Functionality:** The site already features "pressure ranking from local authority route data" on the Home page and "local authority asylum-support comparison" (per `site-plan.md` and `roadmap.md`). The "fixed two-panel place entry surfaces" and "Britain -> region -> subregion -> authority drilldown" are designed to display this information.
*   **Data Processing:** The `scripts/transform/transform-routes.mjs` script is responsible for ingesting and transforming the raw Home Office data into the `uk_routes` canonical format and subsequently into `src/data/live/local-route-latest.json`.

**2. Next Steps**

1.  **Confirm "Top 10" Status:**
    *   Inspect `src/data/live/local-route-latest.json` to identify the specific metric (e.g., "asylum seekers receiving support") and confirm the current ranking of Blackburn, Burnley, and Hyndburn.
    *   If the