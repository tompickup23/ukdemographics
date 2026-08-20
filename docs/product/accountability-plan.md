# Accountability plan

This product becomes genuinely distinctive when it behaves like a public-interest data newsroom rather than a neutral dashboard.

## Editorial stance

The site should investigate:

- why hotel use remains high
- where costs are concentrated
- which areas are carrying disproportionate accommodation pressure
- how much of the estate is publicly visible versus withheld
- how contractor geography and procurement choices shape outcomes

It should not stigmatize asylum seekers. The accountability target is the system: policy failure, procurement drift, secrecy, and uneven burden.

## Big editorial pillars

### 1. Hidden hotel estate

Show:

- official hotel counts nationally
- named sites confirmed publicly
- areas where a hotel presence is confirmed but site names are withheld
- changes over time

This is useful because the secrecy itself is part of the story.

### 2. Cost of delay

Connect:

- backlog and pending decisions
- people in asylum support
- people in hotels
- hotel cost per day

Core question:

`What does slow decision-making cost in money and in prolonged temporary accommodation?`

### 3. Uneven geography

Surface:

- which authorities house the highest numbers
- which regions have the highest rates
- which places have sharp recent increases
- peer-group differences

### 4. Contract accountability

Explain:

- who the providers are
- which regions they cover
- how contract forecasts changed
- where hotel dependency stayed stubborn despite policy promises

### 5. Supplier and ownership accountability

Show:

- who operates sites
- who owns sites
- which supplier groups recur across places
- where ownership chains, secrecy gaps, or suspicious entity patterns appear

## Most interesting features

### Hotel secrecy tracker

An area-first view showing:

- number of publicly identified hotels
- number of unnamed hotel sightings
- last public confirmation date
- evidence type
- source links

### Waste monitor

Cards and explainer blocks for:

- hotel share of total accommodation cost
- daily hotel cost
- cost trend over time
- count of hotels in use versus people in hotels

### Pressure map

A focused map or tile grid answering:

- where supported people are highest
- where rates are highest
- where change has been fastest

### Promise tracker

Simple timeline:

- government promise to end hotels
- peak hotel use
- current hotel count
- current daily cost

### Area red flags

Rules-based callouts such as:

- high count and rising
- high rate and above regional median
- confirmed hotel presence but no publicly identified site list
- large change in short period
- named site but unclear ownership chain
- repeated supplier or operator appearing across multiple places

## Best page structure

- `/` home with strong accountability KPIs
- `/compare` area comparison
- `/hotels` hotel tracker and secrecy gap
- `/spending` cost, contracts, and funding estimates
- `/places/[code]` area profile
- `/releases` release diary
- `/sources` source ledger
- `/methodology` methods and caveats

## Product rules

- Always distinguish `official`, `derived`, `archive-derived`, and `public-evidence` layers.
- Show dates on every accountability fact.
- Make uncertainty explicit rather than smoothing it away.
- Prefer fast, opinionated explanation blocks over giant chart walls.

## Launch package

If time is limited, the launch should still include:

- home
- compare
- hotels
- spending
- five to ten generated place pages
- sources
- methodology

That is enough to feel like a serious product.

## Current repo status

The repo now already contains the core accountability spine:

- official route marts
- live hotel entity ledger
- live public money ledger
- supplier profiles
- integrity signals

So the next builder should focus on deepening evidence and replacing remaining mocks, not on rethinking the product from zero.
