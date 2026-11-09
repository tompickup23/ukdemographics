import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { canonicalAreaCode } from './area-codes';

export interface TaxSitemap {
  fetched: string;
  source: string;
  urls: string[];
}
export interface TaxCrosswalk {
  source: string;
  commit: string;
  copied: string;
  year: string;
  yearSources: string[];
  councils: Array<{ gss: string; slug: string; name: string; officialName: string }>;
}
export interface TaxSiteLinks {
  taxUrl: string;
  councilUrl: string;
  year: string;
}
function load<T>(file: string): T {
  return JSON.parse(readFileSync(join(process.cwd(), 'data/links', file), 'utf8'));
}
export const taxSitemap = load<TaxSitemap>('ukcounciltax-councils.json');
export const councilSitemap = load<TaxSitemap>('ukcouncils-councils.json');
export const taxCrosswalk = load<TaxCrosswalk>('tax-site-crosswalk.json');

export function normaliseCouncilName(name: string): string {
  return name.toLowerCase().replace(/&/g, 'and')
    .replace(/^(?:london borough of |city of )/, '')
    .replace(/, (?:city|county) of$/, '')
    .replace(/ (?:city council|borough council|district council|council)$/, '')
    .replace(/[^a-z]/g, '');
}

/** Keep the saved inputs injectable so missing publication evidence can be tested. */
export function createTaxSiteLinks(
  crosswalk: TaxCrosswalk,
  tax: TaxSitemap,
  council: TaxSitemap,
): (code: string, name: string) => TaxSiteLinks | null {
  const councils = new Map(crosswalk.councils.map(c => [canonicalAreaCode(c.gss), c]));
  const taxUrls = new Set(tax.urls);
  const councilUrls = new Set(council.urls);
  return (code, name) => {
    const match = councils.get(canonicalAreaCode(code));
    if (!match || !/^\d{4}\/\d{2}$/.test(crosswalk.year)) return null;
    const normalised = normaliseCouncilName(name);
    if (![match.name, match.officialName].some(value => normaliseCouncilName(value) === normalised)) return null;
    const taxUrl = `https://ukcounciltax.co.uk/councils/${match.slug}/`;
    const councilUrl = `https://ukcouncils.co.uk/councils/${match.slug}/`;
    return taxUrls.has(taxUrl) && councilUrls.has(councilUrl)
      ? { taxUrl, councilUrl, year: crosswalk.year }
      : null;
  };
}
export const taxSiteLinks = createTaxSiteLinks(taxCrosswalk, taxSitemap, councilSitemap);

export function taxSiteLineParts(displayName: string, year: string) {
  return {
    prefix: `Council tax bands and the ${year} Band D for `,
    taxLabel: `${displayName} on UK Council Tax`,
    councilLabel: "the council's profile on UK Councils",
  };
}
