import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

const directory = resolve('data/links');
const crosswalkPath = resolve(directory, 'tax-site-crosswalk.json');
const crosswalk = JSON.parse(readFileSync(crosswalkPath, 'utf8'));
if (crosswalk.councils.length !== 296 || new Set(crosswalk.councils.map(c => c.gss)).size !== 296 ||
    new Set(crosswalk.councils.map(c => c.slug)).size !== 296) {
  throw new Error('Expected 296 distinct crosswalk councils before fetching.');
}
async function fetchText(url) {
  const response = await fetch(url, {
    headers: { 'User-Agent': 'UKDemographicsLinks' },
    signal: AbortSignal.timeout(30_000),
  });
  if (!response.ok) throw new Error(`Fetch failed for ${url}: HTTP ${response.status}`);
  return response.text();
}
async function fetchSitemap(origin) {
  const source = `${origin}/sitemap.xml`;
  const xml = await fetchText(source);
  const locations = [...xml.matchAll(/<loc\b[^>]*>\s*([^<]+?)\s*<\/loc>/g)].map(match => match[1]);
  const urlCount = (xml.match(/<url\b[^>]*>/g) ?? []).length;
  if (!/<urlset\b/.test(xml) || !urlCount || locations.length !== urlCount) {
    throw new Error(`Invalid sitemap at ${source}: ${locations.length} locations for ${urlCount} URL entries.`);
  }
  const urls = locations.filter(value => {
    const url = new URL(value);
    return url.origin === origin && /^\/councils\/(?:[a-z0-9-]+\/)?$/.test(url.pathname) &&
      !url.search && !url.hash;
  }).sort();
  const councilUrls = urls.filter(url => new URL(url).pathname !== '/councils/');
  if (councilUrls.length !== 296 || new Set(urls).size !== urls.length) {
    throw new Error(`Expected 296 distinct council URLs at ${source}; found ${councilUrls.length}.`);
  }
  const missing = crosswalk.councils.filter(c => !urls.includes(`${origin}/councils/${c.slug}/`));
  if (missing.length) throw new Error(`Missing crosswalk councils at ${source}: ${missing.map(c => c.slug).join(', ')}`);
  return { fetched: new Date().toISOString(), source, urls };
}

// No saved sitemap is replaced until both fetches and all year checks pass.
const tax = await fetchSitemap('https://ukcounciltax.co.uk');
const council = await fetchSitemap('https://ukcouncils.co.uk');
const yearSources = ['burnley', 'birmingham', 'cornwall'].map(slug => `https://ukcounciltax.co.uk/councils/${slug}/`);
const years = [];
for (const source of yearSources) {
  const html = await fetchText(source);
  const title = /<title\b[^>]*>([^<]*)<\/title>/i.exec(html)?.[1];
  const year = title?.match(/bands and charges (\d{4}\/\d{2}) \| UK Council Tax/)?.[1];
  if (!year) throw new Error(`No bill year in the title at ${source}`);
  years.push(year);
}
if (new Set(years).size !== 1) throw new Error(`Bill years disagree: ${years.join(', ')}`);
crosswalk.year = years[0];
crosswalk.yearSources = yearSources;
for (const [file, data] of [
  ['ukcounciltax-councils.json', tax],
  ['ukcouncils-councils.json', council],
  ['tax-site-crosswalk.json', crosswalk],
]) writeFileSync(resolve(directory, file), `${JSON.stringify(data, null, 2)}\n`);
console.log(`Verified 296 council URLs in each sitemap; bill year ${crosswalk.year}.`);
console.log(`UK Council Tax fetched ${tax.fetched}; UK Councils fetched ${council.fetched}.`);
