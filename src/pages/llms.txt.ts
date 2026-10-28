import type { APIRoute } from "astro";
import { getCollection } from "astro:content";
import { SITE_URL } from "../lib/site";
import { formatPconCount, formatPlaceCount } from "../lib/coverage";

export const prerender = true;

/**
 * A plain-text map of the site for language-model crawlers (llmstxt.org format).
 * Whether any answer engine reads it is unproven; it costs one small file.
 */
export const GET: APIRoute = async () => {
  const findings = (await getCollection("findings"))
    .sort((a, b) => a.id.localeCompare(b.id))
    .map((f) => `- [${f.data.headline}](${SITE_URL}/findings/${f.id.replace(/\.md$/, "")}/)`);
  const body = `# UK Demographics

> Population data for local authorities in England and Wales and for UK parliamentary constituencies: ONS mid-year estimates, Census 2011 and 2021 counts, and the site's own ethnic composition projections, each figure with its published source.

Observed figures (ONS, DfE, DWP, Home Office, DHSC) and projections are labelled separately on every page. Projections come from the site's Hamilton-Perry model; the methodology page states its method, inputs and limits.

## Main sections

- [Places](${SITE_URL}/places/): ${formatPlaceCount()}, one page each
- [Counties](${SITE_URL}/places/counties/): county pages built from published county Census rows
- [Constituencies](${SITE_URL}/constituencies/): ${formatPconCount()}
- [Maps](${SITE_URL}/maps/): population change and Census composition maps
- [National](${SITE_URL}/national/): England and Wales series
- [Findings](${SITE_URL}/findings/): short articles with their figures and sources

## Data and method

- [Download the data](${SITE_URL}/data/): CSV of ONS mid-year estimates and Census ethnic group counts by place, with a sources file
- [Methodology](${SITE_URL}/methodology/): projection model, inputs and limitations
- [Sources](${SITE_URL}/sources/): primary datasets
- [Releases](${SITE_URL}/releases/): change log of data releases
- [Glossary](${SITE_URL}/glossary/)

## Findings

${findings.join("\n")}

## Optional

- [Terms and licensing](${SITE_URL}/terms/): source data is Crown copyright under the Open Government Licence v3.0
- [Sitemap](${SITE_URL}/sitemap.xml)
`;
  return new Response(body, { headers: { "Content-Type": "text/plain; charset=utf-8" } });
};
