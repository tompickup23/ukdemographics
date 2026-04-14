# Site plan

## Positioning

asylumstats.co.uk should feel like an accountability machine with evidence attached, not a generic migration dashboard.

Core promise:

`Compare routes and schemes, expose the hotel estate, and follow the money from government instruction to local place wherever the evidence allows.`

## Product state now

The public prototype already has live versions of:

- route comparison
- hotel entity coverage
- spending and funding ledger rows
- supplier profiles
- scope-aware sources and methodology
- fixed two-panel place-entry surfaces on home, `/places/`, and region pages
- staged Britain -> region -> subregion -> place navigation on the live map system

The next build should extend these live marts, not replace them with a fresh mock redesign.

## Primary audiences

- journalists
- local government officers
- migration and refugee organisations
- researchers
- scrutiny-minded public users

## Information architecture

### Home

Purpose:

- explain the accountability angle fast
- show that routes, hotels, and money are separate but connected
- route users into compare, hotels, or spending immediately

Core live blocks:

- hero with compare CTA
- two-panel Britain map stage with zoom history and a right-hand briefing deck
- route cards from the official route mart
- pressure ranking from local authority route data
- named current hotel cards with entity coverage
- release diary cards

Next additions:

- money-ledger teaser rows
- biggest unresolved hotel/operator leads
- what changed since the last refresh
- calmer navigation and visual treatment shared with the other analysis surfaces

### Compare

Purpose:

- remain the default interaction for place-to-place analysis

Current direction:

- switch between asylum support, contingency accommodation, Afghan programmes, Homes for Ukraine, and related route metrics
- keep count/rate comparison prominent
- adopt the same panel discipline and calmer navigation model now used on the place-entry surfaces

Next additions:

- generated area summaries from live marts
- hotel visibility and money-ledger overlays for selected places

### Place pages

Purpose:

- become the main investigative unit for a council, region, or nation

Target blocks:

- latest route pressure
- trend chart
- named hotel evidence
- visible vs hidden estate indicator
- supplier and money rows tied to the place
- auto-generated standout analysis

Current note:

- the entry surfaces are now live and drilldown-driven; the next job is richer generated place analysis and stronger county-aware geographic framing

### Routes

Purpose:

- keep route and scheme separation explicit

Current live blocks:

- national route cards
- route-family series
- top local authorities by asylum-support and contingency metrics

Next additions:

- release-delta callouts
- route-family explainer tiles on compare pages

### Hotels

Purpose:

- expose both the visible estate and the hidden estate

Current live blocks:

- official hotel KPI row
- named current sites with entity coverage
- unnamed-only area rows
- prime-provider exposure
- full starter hotel ledger

Next additions:

- hotel site detail pages
- owner-group recurrence view
- place secrecy-gap ranker
- open/close timeline per site

### Spending

Purpose:

- make the money chain readable without pretending it is cleaner than it is

Current live blocks:

- public money-ledger summary
- full ledger table
- supplier and public-body profiles
- investigative leads
- AI DOGE integrity techniques

Next additions:

- explicit tabs for `contracts`, `funding`, `tariffs`, and `scrutiny`
- supplier detail pages
- contract detail pages
- local response contract rows
- route-linked council procurement joins

### Sources

Purpose:

- show the source scope decision before the user sees a chart

Current direction:

- source ledger with route-specific, local-route-relevant, and context-only labels
- more money-guidance sources are now in scope

### Methodology

Purpose:

- explain route separation, hotel evidence standards, and entity-resolution rules in plain English

## Best-in-class chart set

Prioritize:

- route trend lines
- ranked bars for latest pressure
- compact KPI cards
- staged geographic drilldown where it improves place finding and story framing
- supplier and site cards with evidence chips
- tables where evidence links matter more than decorative graphics

Avoid:

- map-heavy pages that hide the story
- dashboard walls with no explanatory copy
- unlabeled mixed metrics

## Analysis layer

The rules-based analysis should now work off three marts:

- `uk_routes`
- `hotel_entities`
- `money_ledger`

Examples:

- `Hillingdon leads contingency accommodation but the public hotel estate remains only partially visible.`
- `Current named hotels in the East of England map back to Serco's regional scope, but operator resolution is still incomplete.`
- `The public money ledger contains official refugee and humanitarian funding instructions, but local response contract rows remain thin.`
- `Hotels still cost millions per day even after the 2023 peak in site count.`

## Product features that should beat competitors

- chart-level source and scope labeling everywhere
- one-click route/scheme switching
- visible hotel secrecy-gap treatment rather than hidden caveats
- supplier profiles combining primes, owner groups, and hotel operators
- public money ledger showing what is known, what is rate-based, and what is still unresolved
- AI DOGE-style integrity methods translated into publishable site features instead of back-office notes

## Build priority for Claude

Do next:

1. Extend the fixed two-panel navigation and calmer data-nav treatment into compare, hotels, and spending.
2. Add stronger county- and cluster-aware geographic treatment beyond the current inset cards.
3. Upgrade place and region panels with richer comparative visuals and auto-written analysis.
4. Expand the hotel and money ledgers with more entity links and local response contracts.
5. Keep the current editorial tone and evidence-first structure intact.
