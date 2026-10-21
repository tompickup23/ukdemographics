# UK Places comparison-entry plan

Status: proposed follow-on work, 11 September 2026. This is a planning record only; it does not authorise implementation, publication, deployment, or a data refresh.

## Decision record

- **Canonical owner:** UK Demographics owns the comparison page, its calculation and its provenance. UK Places owns the neutral geography record and may link to the canonical comparison page.
- **Unit of analysis:** a local authority, never a settlement or an implied neighbourhood.
- **First-release scope:** one source-qualified measure at a time. There is no aggregate, overall, best/worst or league-table score.
- **Publication gate:** a measure is unavailable until the source geography, reference period, coverage, direction, ties and caveat are all established in code and visible copy.

## Purpose

UK Demographics should own the detailed comparison experience. UK Places should remain a geography index and link to that experience once it exists. The two sites must not duplicate measures or present an authority-wide score as a judgement about a place.

## Product shape

1. Add a comparison entry point to each supported local-authority profile and a discoverable comparison index.
2. Rank one named measure at a time, with the source, period, direction and current comparison denominator displayed beside the result.
3. Use `local authority` in labels. UK Places records local authorities, not settlements.
4. Offer three explicitly labelled comparison sets where source coverage permits:
   - England and Wales local authorities with a valid value for the selected measure;
   - districts sharing the same confirmed administrative parent; and
   - a transparent peer group with the same country and authority type, plus a documented population band.
5. Calculate every denominator at build time from the joined data. Do not hard-code coverage counts into copy.

## Initial metric gate

The first release must use only a direct, comparable measure with an explicit source, period and caveat. Candidates needing a source-contract review are:

- total recorded crime rate from `src/data/live/crime-dashboard.json`, clearly labelled as the latest period held by that source;
- all-authority tenure measures from `src/data/live/census-tenure-ethnic.json`;
- all-authority self-reported health measures from `src/data/live/census-health-ethnic.json`; and
- school context from `src/data/live/school-eal-district.json`, with its scope shown in the interface.

Do not rank a proxy, a projection, a composite service-pressure score, a partial upper-tier service measure, or an incomplete-coverage dataset as an authority-wide socioeconomic outcome. A metric only joins the feature after its coverage, geography, direction, ties and source caveat have been tested.

Before selecting the first metric, write a compact source contract with these fields:

| Field | Required decision |
|---|---|
| Metric ID and label | Stable machine ID and reader-facing name; no value-free superlatives. |
| Source and period | Named primary source, table/release and the exact period shown on screen. |
| Geography | Codes accepted, exclusions, and whether values represent the authority or a parent authority. |
| Numerator / denominator | The published calculation, including unit and any rate base. |
| Direction | Whether a higher value is simply more of the measure, not automatically better or worse. |
| Coverage and ties | Dynamic valid-record count, missing-value rule, and equal-value rank treatment. |
| Caveat | The shortest truthful limitation readers need before comparing values. |

## Information architecture and URL contract

- Keep `/compare/` as the canonical comparison hub; add a stable query or path convention only after the metric IDs are fixed. A proposed shape is `/compare/?metric=<metric-id>&area=<area-code>`.
- A place-page entry must preserve the selected authority and take readers to the same canonical comparison state. It must not create a duplicate locally generated comparison URL for each authority.
- The hub first explains the selected measure, source, period and coverage, then presents the selected authority in context. A table must remain available as accessible HTML alongside any chart.
- Unsupported or incomplete records show an honest unavailable state, the relevant source caveat and a link back to the place profile; they never inherit a county, region or peer-group value.

## Delivery sequence

1. **Source-contract spike:** inspect candidate datasets, select one direct metric, and record the contract above. Do not change public pages in this step.
2. **Calculation layer:** create one typed, build-time comparison helper that accepts canonical area codes, excludes invalid records and returns values, ranks, ties, denominator and provenance together.
3. **Comparison hub:** build the canonical UI with an answer-first selected-area summary, accessible table, source/date copy and methodology link.
4. **Place journey:** add one descriptive entry point from eligible place pages; preserve the area and metric in the canonical comparison URL.
5. **UK Places hand-off:** add only a neutral outgoing link after the target URL, visible copy and source contract are stable.
6. **Measurement review:** compare internal journeys, landing-page engagement and any Search Console queries only after enough post-release data has accrued.

## Interaction and provenance rules

- A rank is always accompanied by the measure and its value on UK Demographics; it is never an unqualified "overall" position.
- Shared source geography and tied values must be shown rather than manufactured into a false order.
- County comparison is unavailable where there is no confirmed administrative parent or where the authorities would not be like-for-like.
- The comparison page must link to its data and methodology and retain the source's time period.
- Render the comparison as a chart or other data visual where possible, in line with the site's visual-data rule.

## UK Places hand-off

Once a stable comparison URL and source contract exist, provide that URL to UK Places through the registry-based integration. UK Places may add a link-only action such as "Compare this authority". It must not copy the rank, add another UK Demographics figure, or present an unqualified local score.

## Acceptance checks before implementation is considered complete

- every rendered comparison has one named metric, source, period, direction and dynamic denominator;
- ranking rows are limited to the measure's verified coverage and comparable geography;
- an unsupported authority renders an honest unavailable state rather than a fallback rank;
- the source data, method and display agree in tests; and
- the existing test, check and build commands pass without publishing a deployment.

## Test plan

- Unit-test the comparison helper for canonicalised Barnsley/Sheffield codes, missing records, ties, ordering and dynamic denominators.
- Test every source-contract field against the selected input data so a release-date or geography change cannot silently alter the public claim.
- Render representative metropolitan, county, unitary and Welsh authorities, plus an unsupported authority, and inspect the actual HTML for source, period, caveat and canonical URL.
- Check keyboard navigation, table headers, mobile overflow and console errors on the hub and a linked place page.
- Confirm that UK Places receives one complementary outbound destination only; it must not reproduce UK Demographics’ metric, rank or interpretation.

## Explicit non-goals

- No cross-domain content duplication, reciprocal-link requirement, bulk local-authority landing pages or keyword variants.
- No rankings based on forecasts, inferred values, incomplete geographic coverage or bundled indices.
- No claim that a ranking measures quality, safety, desirability, deprivation or local-government performance unless the named source directly measures that concept.
- No data refresh, model change, deployment or UK Places edit is implied by this plan.
