# UK Demographics — Claude Code Context

## Overview
Population data for every community. Ethnic projections, school data, housing demand, health and tenure by ethnic group, and now per-constituency political mapping across **996 pages** (320 local authorities + 631 UK constituencies + dashboards + findings).

**Stack:** Astro 5 + design tokens (Tailwind dropped 19-20 May) + TypeScript. Inline SVG charts (no chart library).
**Hosting:** GitHub Pages only (NOT Cloudflare).
**Domain:** ukdemographics.co.uk.
**Data:** ONS Census 2021 (NOMIS — TS012, TS029, RM134, RM043, RM192, RM021), DWP NINo + PIP (Stat-Xplore), ONS births, MHCLG CTB1, DfE School Census, ONS Open Geography Portal LAD24↔CTY24 + PCON24↔LAD25 crosswalks, UKE GE 2024 shares, Parliament Members API.

**Cross-repo data dependency (10 Aug 2026):** `scripts/transform/transform_asylum_bridge.py` reads `/Users/tompickup/asylumstats/data/raw/uk_routes/*.xlsx` directly off disk — a hardcoded absolute path, not an API. Local-only (not in CI); output gets committed. Only works on this Mac with `asylumstats` present at that exact path.

## Key surfaces

- `/places/<slug>/` — 320 LA profiles, 23 sections each. NOMIS Census data wired (TS029 English proficiency, RM134 tenure by ethnic group, RM043 health by ethnic group). District pages fall back to parent county for ASC with a clear caveat banner.
- `/constituencies/<slug>/` — 631 UK PCONs with sitting MP card, 2024 GE bar chart, PIP claimants, constituent LAs. Index at `/constituencies/`.
- `/national/` — Rebuilt with NINo 2002-2025 arc + births-by-COB 2008-2024 share charts (inline SVG).
- `/findings/` — 16 Tom-voice pieces. Schema enum: `demographics | projections | fertility | schools | housing | health | migration | validation | crime | social-care | send` ("economy" is NOT valid).
- Dashboards: `/regional/` `/your-area/` `/pressure/` `/schools/` `/housing/` `/compare/`.

## CI / deploy

- GH Actions on Node 22. `actions/checkout@v4`, `actions/setup-node@v4`.
- `npm test` (vitest) + `npm run check` (astro check, strict) + `BUILD_OG=1 npm run build` + Playwright (mobile + desktop chromium).
- `BUILD_OG=1` is set in both deploy.yml + site-checks.yml via `env:` block (PreToolUse security hook rejects inline `KEY=val` form). Iteration `npm run build` (without `BUILD_OG`) skips the ~340-card Satori pass.
- `Refresh data` cron runs Mondays 08:00 UTC. Currently wires stop-and-search; pattern is ready for more datasets as secrets are added.
- Site-checks.yml + deploy.yml are kept in lockstep — same step list.

## Rules

- **No AI tells, no hedging.** Findings use declarative voice. Numbers cross-reference the data files. Sources cited with exact NOMIS / ONS / DWP table.
- **Anonymous.** No "Tom Pickup" attribution anywhere user-facing (footer/privacy/terms/accessibility/JSON-LD all use "an independent demographic research project" + "© ukdemographics.co.uk"). The `tompickup23` GitHub URLs in data sources are kept as functional links.
- **British English** throughout.
- **Mobile-first** — every chart `viewBox`-sized; no horizontal scroll allowed (Playwright enforces ≤2px tolerance).
- **NOMIS sub-level codes have a leading underscore** (`_1, _2, ...`). Don't assume bare digits.
- **ASC/SEND are upper-tier services.** Non-met districts (E07) fall back to parent county (E10) via `src/lib/area-hierarchy.ts`.
- **Findings collection schema is fixed** — see enum above. Build will fail fast if you use a new value.
- **Design tokens, no Tailwind.** Use `--space-*`, `--text-*`, `--accent`, `--status-*`, `--surface`, `--panel`, `--ink-*`, `--muted`, `--border*`, `--shadow*`, `--radius*`. Light mode via `@media (prefers-color-scheme: light)`. Hover backgrounds use `color-mix(in srgb, var(--accent) 8%, transparent)` so they adapt.
- **Components**: `StatCard.astro`, `RaceBar.astro`, `HeroClock.astro` — use these for any new big-number / categorical-share / hero-stat surfaces. CSS classes live in global.css (`.stat-card`, `.stat-card-row`, `.hero-race`, `.hero-clock`).
- **OG cards on shared standard** with UKE + AS — dark gradient, 40×40 brand tile, hero block, single-line footer. Render pipeline: Satori → @resvg/resvg-js.
- **GH Pages, not CF.** Don't run a "remove oversized files" step pattern from AI DOGE.

## Refresh / rebuild scripts

| Script | Purpose | Cadence |
|---|---|---|
| `scripts/fetch/fetch-nomis-census.mjs` | TS029 + RM134 + RM043 from NOMIS | One-shot (Census 2021 is fixed) |
| `scripts/fetch/fetch-la-hierarchy.mjs` | District → county lookup from ONS Open Geography | Annual or after LGR events |
| `scripts/fetch/fetch-stop-and-search.mjs` | data.police.uk monthly | Weekly via cron |
| `scripts/build/build-pcon-dataset.mjs` | Join UKE GE 2024 + crosswalk + PIP into per-PCON | When upstream changes |

Other Python transforms in `scripts/transform/transform_*.py` handle the NINo / PIP / payroll / births / TB / etc. pipelines. Most run manually because raw data is gitignored.

## Related projects

- **asylumstats.co.uk** — Asylum & immigration data (sister site, cross-linked footer + sister-pill in header). OG cards on shared standard.
- **ukelections.co.uk** — UKE (data source for 2024 GE shares + PCON↔LAD crosswalk; sister-pill + footer link). OG cards on shared standard.
- **burnleycouncil** — AI DOGE council transparency platform (different domain, different stack)

## Session memory

End-of-session state for the 19 May 2026 P0+P1+P2 sprint: `~/.claude/projects/-Users-tompickup-clawd/memory/session_19may_ukd_p0_p1_p2.md`. End-of-session state for the 19-20 May aesthetic + OG harmonisation: `session_19_20may_ukd_elevation_og_harmonisation.md`. P3 plan: `ukdemographics_p3_plan.md`.

## Cross-repo lessons (5 Jul 2026)

Hard-won gotchas for this site live in the clawd repo: `/Users/tompickup/clawd/docs/lessons/sister-sites.md` (deploy flows, CSP/Pagefind/Astro 6 gotchas, OG-card standard, em-dash sweep method) and `/Users/tompickup/clawd/docs/lessons/editorial-method.md` (fact-check protocol, factual anchors). Read the relevant one before major work, and append new lessons there, not here.
