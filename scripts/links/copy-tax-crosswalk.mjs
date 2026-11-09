import { execFileSync } from 'node:child_process';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

const checkout = process.argv[2];
if (!checkout) throw new Error('Usage: node scripts/links/copy-tax-crosswalk.mjs <ukcouncils checkout>');
const registryPath = 'data/registry/councils.json';
const git = (...args) => execFileSync('git', ['-C', checkout, ...args], { encoding: 'utf8' }).trim();
if (git('status', '--porcelain', '--', registryPath)) {
  throw new Error('The source registry has uncommitted changes.');
}
const commit = git('rev-parse', 'HEAD');
const registry = JSON.parse(readFileSync(resolve(checkout, registryPath), 'utf8'));
const councils = Object.values(registry.councils)
  .filter(council => council.country === 'England' && !/county/i.test(council.type))
  .map(({ gss, slug, name, officialName }) => ({ gss, slug, name, officialName }))
  .sort((a, b) => a.gss.localeCompare(b.gss));
if (councils.length !== 296 || new Set(councils.map(c => c.gss)).size !== 296 ||
    new Set(councils.map(c => c.slug)).size !== 296) {
  throw new Error('Crosswalk must contain exactly 296 councils with distinct GSS codes and slugs.');
}
if (councils.some(c => !/^E\d{8}$/.test(c.gss) || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(c.slug) ||
    typeof c.name !== 'string' || typeof c.officialName !== 'string')) {
  throw new Error('Crosswalk contains an invalid council record.');
}
const directory = resolve('data/links');
mkdirSync(directory, { recursive: true });
writeFileSync(resolve(directory, 'tax-site-crosswalk.json'), `${JSON.stringify({
  source: 'tompickup23/ukcouncils data/registry/councils.json',
  commit,
  copied: new Date().toISOString(),
  year: null,
  yearSources: [],
  councils,
}, null, 2)}\n`);
console.log(`Copied ${councils.length} councils at ${commit}; run links:fetch to verify the year and URLs.`);
