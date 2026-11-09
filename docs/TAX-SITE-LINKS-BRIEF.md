# Council tax and council profile links on place pages (L2) | brief

Prepared 9 November 2026 in Claude Code for a Codex build. Binding. It is the UK Demographics instance of the template in UK Councils, `docs/SISTER-LINK-BRIEF-TEMPLATE.md` on branch `docs/sister-link-template` (read it with `git -C ~/ukcouncils show origin/docs/sister-link-template:docs/SISTER-LINK-BRIEF-TEMPLATE.md`). Where this brief and the template differ, this brief wins; where this repo's CLAUDE.md and either differ, CLAUDE.md wins.

## 1. Authority

Decision 7, taken 9 November 2026: UK Demographics place pages may carry a contextual line linking the council's page on UK Council Tax and on UK Councils. No footer change. Nothing else on the site changes.

## 2. Parameters

| Parameter | Value |
|---|---|
| Repo and base | `ukdemographics` at `origin/main` `76c33df56f178b723858f2f75a52a30a91b3dd87` |
| Worktree and branch | `~/wt/ukd-links`, `feat/tax-site-links`. Fetch and rebase onto `origin/main` before starting |
| Page template | `src/pages/places/[slug].astro` (route `/places/<slug>/`, from `getPublicPlaceAreas()` in `src/lib/site.ts`) |
| Pages built by that route | 318 (63 E06, 164 E07, 36 E08, 33 E09, 22 W06), keys of `src/data/live/ethnic-projections.json` |
| Join field | `area.areaCode` (Census 2021 codes) |
| Code aliases | `canonicalAreaCode()` in `src/lib/area-codes.ts`, from `src/data/lookups/area-code-aliases.json`: crosswalk `E08000038` resolves to `E08000016` (Barnsley), `E08000039` to `E08000019` (Sheffield). Resolve the crosswalk code onto this site's code; do not add a second alias table |
| Name for the check | `area.areaName` |
| Name the line prints | `displayName` (what the H1 prints, line 649, from `plainPlaceName()`) |
| Placement | A new cross link block directly after the UK Places block (the `{ukPlacesUrl && (...)}` block ending near line 1855) and before `<CiteThisPage>`, using the existing `as-cross-link`, `as-cross-inner`, `as-cross-label` and `as-cross-desc` classes. Label: "Council tax and the council". The description span holds the line from section 3 with its two links. No button element; no new CSS unless the links need the existing link colour token |
| Known refusals | None |
| Counts | 296 of 318 with the line; 22 without, all W06 (UK Councils has no Welsh profiles, and the two link line needs both; UK Council Tax does have the 22 Welsh pages at `/wales/<slug>/`, so a UK Council Tax only line for Wales is follow up L2b, out of scope here); 0 English pages without |
| Unit test | `tests/tax-site-links.test.ts` |
| Dist check | `scripts/check/tax-site-links.mjs`, added to both `.github/workflows/site-checks.yml` and `.github/workflows/deploy.yml` after the `published-anonymity.mjs` step (the two files are kept in lockstep) |
| Text test | `scripts/check/published-dashes.mjs` and `scripts/check/published-anonymity.mjs` already sweep the built pages; the unit test checks the line string |
| Build hold | None |

## 3. The line

> Council tax bands and the 2026/27 Band D for Burnley on UK Council Tax; the council's profile on UK Councils.

Built from the crosswalk `year` and `displayName`, never typed. Links: "Burnley on UK Council Tax" to `https://ukcounciltax.co.uk/councils/burnley/`; "the council's profile on UK Councils" to `https://ukcouncils.co.uk/councils/burnley/`. Both URLs come from the crosswalk slug, which differs from this site's slug for some councils (Folkestone and Hythe is `shepway` on both tax sites); never build them from `slugifyAreaName()`.

The page already reads `src/data/live/council-tax-spd.json`. Do not add any council tax figure to the line or near it; the line names the band and the year and links.

## 4. Data and scripts

As template section 4: `data/links/ukcounciltax-councils.json`, `data/links/ukcouncils-councils.json`, `data/links/tax-site-crosswalk.json`; `scripts/links/copy-tax-crosswalk.mjs <ukcouncils checkout>` (run it against `~/ukcouncils` after `git -C ~/ukcouncils fetch` and a checkout of `origin/main`, or a fresh worktree of it) and `scripts/links/fetch-tax-sitemaps.mjs`. Add `npm` scripts `links:crosswalk` and `links:fetch`. The data stays out of the Monday `Refresh data` cron: a refresh is a deliberate run and a commit.

`data/` at the repo root already holds committed source data (`data/geography/` and others), so `data/links/` sits beside it. `tests/coverage.test.ts` sweeps `src/` and `public/` for hard coded coverage counts: put no count in page copy, only in tests and the check script.

## 5. Join, as run on 9 November 2026

Crosswalk from UK Councils `151dc0f`, 296 English billing authorities; both sitemaps fetched 2026-11-09T10:02Z, 296 council URLs each, every crosswalk slug present in both.

| Step | Result |
|---|---|
| Place codes equal to a crosswalk code | 294 |
| Added by the Barnsley and Sheffield aliases | 2 |
| Joined | 296 |
| Name check refusals | 0. One name differs and passes on the official name: `E07000112` "Folkestone and Hythe" here, "Shepway" in the registry, official name "Folkestone & Hythe Council" |
| Crosswalk councils with no place page | 0 |
| English place pages with no crosswalk council | 0 |
| Welsh place pages (no line) | 22 |

The plan's "296 of 350" counted every page under `/places/` (place profiles, 21 county pages, the county index, region pages and the places index). The route this brief changes builds 318.

## 6. Tests and checks

Unit test as template section 8, with this repo's numbers: 318 areas, 296 joined, 22 W06 without, no refusals; Barnsley and Sheffield return links; Burnley's line string equals section 3 exactly.

Dist check (`scripts/check/tax-site-links.mjs`), reading `dist/places/*/index.html` for the 318 route pages only (skip `counties/` and `regions/`): each of the 296 carries exactly one link to its UK Council Tax URL and one to its UK Councils URL; the 22 Welsh pages carry neither origin's `/councils/` links; the totals print and are asserted. Exit non zero on any failure, in the style of the other `scripts/check/` scripts.

Sources: one sentence on `src/pages/sources.astro`, as template section 11, with the date from `fetched`.

## 7. Gate

`npm test`, `npm run check`, `BUILD_OG=1 npm run build` for the final build (iteration builds may skip it), then every `scripts/check/` step the workflows run, including the new one, then `npm run test:mobile` and `npm run test:desktop` (no horizontal scroll at 375 px on a place page with the block). Recount with `find dist -name index.html | wc -l` and report it.

## 8. Commits and PR

Four commits, in order: scripts and saved data; helper and unit test; the block on place pages and the sources sentence; the dist check and the two workflow steps. PR titled "Council tax and council profile links on place pages (L2)", with the counts, the fetch time, the crosswalk commit and a 375 px capture of Burnley's block linked at a commit sha (not committed under `output/`). End the body with "Built with Codex from a brief prepared in Claude Code." British English; no em dash, en dash or spaced hyphen, commit messages included; the site stays anonymous; name no individual; stage named paths only; do not merge or deploy.

**Stop conditions:** template section 12, and any of: the route builds other than 318 pages; the join differs from section 5; a Welsh page would get a line.
