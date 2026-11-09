import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { join, relative } from 'node:path';

const read = file => JSON.parse(readFileSync(file, 'utf8'));
const crosswalk = read('data/links/tax-site-crosswalk.json');
const tax = read('data/links/ukcounciltax-councils.json');
const council = read('data/links/ukcouncils-councils.json');
const { areas } = read('src/data/live/ethnic-projections.json');
const { aliases } = read('src/data/lookups/area-code-aliases.json');
const { plainNames } = read('src/data/lookups/place-identities.json');
const byCode = new Map(crosswalk.councils.map(c => [aliases[c.gss] ?? c.gss, c]));
const slugify = name => name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
const decode = text => text.replace(/&amp;/g, '&').replace(/&#39;|&#x27;|&apos;/g, "'")
  .replace(/&quot;/g, '"').replace(/&lt;/g, '<').replace(/&gt;/g, '>');
const text = html => decode(html.replace(/<[^>]*>/g, '')).replace(/\s+/g, ' ').trim();
const links = html => [...html.matchAll(/<a\b[^>]*\bhref="([^"]+)"[^>]*>([\s\S]*?)<\/a>/g)]
  .map(m => ({ url: decode(m[1]), label: text(m[2]) }));
const isCouncilLink = link => /^https:\/\/(?:ukcounciltax|ukcouncils)\.co\.uk\/councils\//.test(link.url);
const routePaths = new Set(Object.values(areas).map(a => `places/${slugify(a.areaName)}/index.html`));
assert.equal(Object.keys(areas).length, 318, 'Expected 318 route records');
assert.equal(routePaths.size, 318, 'Expected 318 distinct route paths');
assert.equal(crosswalk.councils.length, 296, 'Expected 296 crosswalk councils');
const failures = [];
let withLine = 0;
let withoutLine = 0;
let welshWithout = 0;
let englishWithout = 0;
for (const [code, area] of Object.entries(areas)) {
  const file = `places/${slugify(area.areaName)}/index.html`;
  const html = readFileSync(join('dist', file), 'utf8');
  const fail = message => failures.push(`${file}: ${message}`);
  const blocks = [...html.matchAll(/<div\b[^>]*\bdata-tax-site-links(?:="[^"]*")?[^>]*>([\s\S]*?)<\/div>\s*<\/div>/g)];
  const allCouncilLinks = links(html).filter(isCouncilLink);
  const match = byCode.get(code);
  if (!match) {
    withoutLine++;
    if (code.startsWith('W06')) welshWithout++;
    else englishWithout++;
    if (blocks.length || allCouncilLinks.length) fail('An excluded page carries a council link or block');
    continue;
  }
  if (code.startsWith('W06')) fail('A Welsh page matched the crosswalk');
  const taxUrl = `https://ukcounciltax.co.uk/councils/${match.slug}/`;
  const councilUrl = `https://ukcouncils.co.uk/councils/${match.slug}/`;
  if (!tax.urls.includes(taxUrl) || !council.urls.includes(councilUrl)) fail('Missing saved publication evidence');
  if (blocks.length !== 1) { fail(`Expected one council block, found ${blocks.length}`); continue; }
  withLine++;
  const block = blocks[0][0];
  const name = plainNames[code]?.plainName ?? area.areaName;
  const expected = [
    { url: taxUrl, label: `${name} on UK Council Tax` },
    { url: councilUrl, label: "the council's profile on UK Councils" },
  ];
  if (JSON.stringify(links(block)) !== JSON.stringify(expected)) fail('Block links differ from the verified pair');
  if (JSON.stringify(allCouncilLinks) !== JSON.stringify(expected)) fail('Council links outside the block or duplicate links');
  const description = /<span\b[^>]*class="as-cross-desc"[^>]*>([\s\S]*?)<\/span>/.exec(block)?.[1] ?? '';
  const expectedLine = `Council tax bands and the ${crosswalk.year} Band D for ${name} on UK Council Tax; the council's profile on UK Councils.`;
  if (text(description) !== expectedLine) fail('Line wording differs from the brief');
  if (!block.includes('Council tax and the council')) fail('Missing block label');
  if (/<button\b|target=/.test(block)) fail('Unexpected button or link target');
  if (/\u2013|\u2014|&(?:mdash|ndash|#0*8211|#0*8212|#x0*2013|#x0*2014);|\s-\s/i.test(text(description))) fail('Forbidden dash in line');
  const blockIndex = blocks[0].index;
  const placesIndex = html.indexOf('Place record on UK Places');
  const citeIndex = html.indexOf('data-cite-page');
  if ((placesIndex >= 0 && blockIndex <= placesIndex) || citeIndex < blockIndex) fail('Block is outside its required position');
}

function htmlFiles(directory) {
  return readdirSync(directory, { withFileTypes: true }).flatMap(entry => {
    const file = join(directory, entry.name);
    return entry.isDirectory() ? htmlFiles(file) : entry.name.endsWith('.html') ? [file] : [];
  });
}
const builtRoutePaths = [];
for (const file of htmlFiles('dist')) {
  const rel = relative('dist', file);
  const html = readFileSync(file, 'utf8');
  // Redirects and county or region pages are outside the place profile route.
  if (/^places\/[^/]+\/index\.html$/.test(rel) && html.includes('<!-- place-map')) builtRoutePaths.push(rel);
  if (!routePaths.has(rel) && html.includes('data-tax-site-links')) failures.push(`${rel}: block outside the place profile route`);
}
assert.deepEqual(builtRoutePaths.sort(), [...routePaths].sort(), 'Built place route differs from its records');
const counts = { routePages: builtRoutePaths.length, withLine, withoutLine, welshWithout, englishWithout };
console.log(`Tax site links: ${JSON.stringify(counts)}`);
assert.deepEqual(counts, { routePages: 318, withLine: 296, withoutLine: 22, welshWithout: 22, englishWithout: 0 });
assert.deepEqual(failures, [], 'Tax site link checks failed');
