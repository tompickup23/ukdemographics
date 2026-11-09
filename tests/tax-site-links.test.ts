import { describe, expect, it } from 'vitest';
import { getPublicPlaceAreas } from '../src/lib/site';
import { canonicalAreaCode } from '../src/lib/area-codes';
import { plainPlaceName } from '../src/lib/place-names';
import {
  councilSitemap, createTaxSiteLinks, normaliseCouncilName, taxCrosswalk,
  taxSiteLineParts, taxSiteLinks, taxSitemap,
} from '../src/lib/tax-site-links';

const areas = getPublicPlaceAreas();

describe('verified tax site links', () => {
  it('holds exactly 296 council URLs from each named sitemap without duplicates', () => {
    for (const [sitemap, origin] of [
      [taxSitemap, 'https://ukcounciltax.co.uk'],
      [councilSitemap, 'https://ukcouncils.co.uk'],
    ] as const) {
      expect(sitemap.source).toBe(`${origin}/sitemap.xml`);
      expect(Number.isFinite(Date.parse(sitemap.fetched))).toBe(true);
      expect(sitemap.urls.filter(url => new URL(url).pathname !== '/councils/')).toHaveLength(296);
      expect(new Set(sitemap.urls).size).toBe(sitemap.urls.length);
      for (const url of sitemap.urls) {
        expect(new URL(url).origin).toBe(origin);
        expect(new URL(url).pathname).toMatch(/^\/councils\/(?:[a-z0-9-]+\/)?$/);
      }
      for (const council of taxCrosswalk.councils) {
        expect(sitemap.urls).toContain(`${origin}/councils/${council.slug}/`);
      }
    }
  });

  it('records 296 distinct councils, the source commit and the verified year', () => {
    expect(taxCrosswalk.source).toBe('tompickup23/ukcouncils data/registry/councils.json');
    expect(taxCrosswalk.councils).toHaveLength(296);
    expect(new Set(taxCrosswalk.councils.map(c => c.gss)).size).toBe(296);
    expect(new Set(taxCrosswalk.councils.map(c => c.slug)).size).toBe(296);
    expect(taxCrosswalk.commit).toMatch(/^[a-f0-9]{40}$/);
    expect(taxCrosswalk.year).toMatch(/^\d{4}\/\d{2}$/);
    expect(taxCrosswalk.yearSources).toEqual(['burnley', 'birmingham', 'cornwall']
      .map(slug => `https://ukcounciltax.co.uk/councils/${slug}/`));
  });

  it('joins 296 of 318 route areas, leaving only 22 Welsh areas and no refusals', () => {
    const joined = areas.filter(a => taxSiteLinks(a.areaCode, a.areaName));
    const without = areas.filter(a => !taxSiteLinks(a.areaCode, a.areaName));
    expect(areas).toHaveLength(318);
    expect(joined).toHaveLength(296);
    expect(without).toHaveLength(22);
    expect(without.filter(a => a.areaCode.startsWith('W06'))).toHaveLength(22);
    expect(without.filter(a => !a.areaCode.startsWith('W06'))).toEqual([]);
    const crosswalkCodes = new Set(taxCrosswalk.councils.map(c => canonicalAreaCode(c.gss)));
    const refused = without.filter(a => crosswalkCodes.has(a.areaCode)).map(a => a.areaName);
    expect(refused).toEqual([]);
    expect(taxCrosswalk.councils.filter(c => !areas.some(a => a.areaCode === c.gss))).toHaveLength(2);
    expect(taxCrosswalk.councils.filter(c => !areas.some(a => a.areaCode === canonicalAreaCode(c.gss)))).toEqual([]);
    expect(areas.filter(a => taxCrosswalk.councils.some(c => c.gss === a.areaCode))).toHaveLength(294);
    expect(Object.fromEntries(['E06', 'E07', 'E08', 'E09', 'W06'].map(prefix =>
      [prefix, areas.filter(a => a.areaCode.startsWith(prefix)).length])))
      .toEqual({ E06: 63, E07: 164, E08: 36, E09: 33, W06: 22 });
  });

  it.each([
    ['E08000016', 'E08000038', 'Barnsley', 'barnsley'],
    ['E08000019', 'E08000039', 'Sheffield', 'sheffield'],
  ])('resolves both forms of %s', (oldCode, newCode, name, slug) => {
    expect(taxSiteLinks(oldCode, name)).toEqual(taxSiteLinks(newCode, name));
    expect(taxSiteLinks(oldCode, name)?.taxUrl).toBe(`https://ukcounciltax.co.uk/councils/${slug}/`);
  });

  it('uses the official name check and the crosswalk slug for Folkestone and Hythe', () => {
    expect(taxSiteLinks('E07000112', 'Folkestone and Hythe')?.taxUrl)
      .toBe('https://ukcounciltax.co.uk/councils/shepway/');
  });

  it.each([
    ['London Borough of Camden', 'Camden Borough Council'],
    ['City of Bristol', 'Bristol, City of'],
    ['Herefordshire, County of', 'Herefordshire Council'],
    ['Folkestone and Hythe', 'Folkestone & Hythe Council'],
  ])('normalises council name forms for %s', (left, right) => {
    expect(normaliseCouncilName(left)).toBe(normaliseCouncilName(right));
  });

  it('suppresses absent codes, mismatched names and a URL missing from either sitemap', () => {
    expect(taxSiteLinks('E00000000', 'Burnley')).toBeNull();
    expect(taxSiteLinks('E07000117', 'Birmingham')).toBeNull();
    for (const missing of ['tax', 'council']) {
      const tax = { ...taxSitemap, urls: taxSitemap.urls.filter(url => missing !== 'tax' || !url.endsWith('/burnley/')) };
      const council = { ...councilSitemap, urls: councilSitemap.urls.filter(url => missing !== 'council' || !url.endsWith('/burnley/')) };
      expect(createTaxSiteLinks(taxCrosswalk, tax, council)('E07000117', 'Burnley')).toBeNull();
    }
  });

  it('prints the exact Burnley line using the display name and saved year', () => {
    const area = areas.find(a => a.areaCode === 'E07000117')!;
    const links = taxSiteLinks(area.areaCode, area.areaName)!;
    const copy = taxSiteLineParts(plainPlaceName(area.areaCode, area.areaName), links.year);
    const line = `${copy.prefix}${copy.taxLabel}; ${copy.councilLabel}.`;
    expect(line).toBe("Council tax bands and the 2026/27 Band D for Burnley on UK Council Tax; the council's profile on UK Councils.");
    expect(line).not.toMatch(/\u2013|\u2014|&(?:mdash|ndash|#0*8211|#0*8212|#x0*2013|#x0*2014);|\s-\s/i);
  });
});
