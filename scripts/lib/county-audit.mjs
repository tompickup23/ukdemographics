import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { parseCsv } from './csv-parser.mjs';
import { classifyCensusEthnicLabel, GROUP_KEYS } from './census-ethnic-groups.mjs';
const hash = value => createHash('sha256').update(typeof value === 'string' ? value : JSON.stringify(value)).digest('hex');
const read = file => JSON.parse(readFileSync(file, 'utf8'));
export function countyAuditInputs() {
  return {
    census: read('src/data/live/county-census.json'),
    estimates: read('src/data/live/population-estimates.json'),
    site: read('src/data/live/ethnic-projections.json').areas,
    lookup: read('src/data/lookups/district-to-utla.json').districts,
    manifest: read('data/raw/manifests/county_census.json'),
    approved: read('data/raw/manifests/county_reviewed_2026-10-14.json'),
    populationManifest: read('data/raw/manifests/ons_mye.json'),
  };
}
export function countyEvidence({ census, estimates, site, lookup, manifest, populationManifest }) {
  const districts = Object.keys(lookup).sort();
  return {
    counties: hash(census.counties), sources: hash(manifest), membership: hash(lookup),
    population: hash({ source: estimates.source, manifest: populationManifest, counties: estimates.counties, districts: districts.map(code => [code, estimates.areas[code].series]) }),
    districtCensus: hash(districts.map(code => [code, ...['baseline', 'current'].map(side => ({ year: site[code][side].year, total: site[code][side].total_population, groups: site[code][side].groups_absolute }))])),
  };
}
export function validateCountyAudit(input) {
  const { census, estimates, site, lookup, manifest, approved } = input;
  const require = (ok, reason) => { if (!ok) throw new Error(`County audit: ${reason}`); };
  require(census.publicationReady === true && census.publicationPolicy === 'published-county-rows-v1', 'publication is not ready');
  require(approved.policy === 'published-county-rows-v1', 'unrecognised approval policy');
  require(JSON.stringify(countyEvidence(input)) === JSON.stringify(approved.hashes), 'reviewed evidence changed; a separately reviewed source refresh is required');
  require(JSON.stringify(census.sources) === JSON.stringify(manifest.sources), 'source manifest differs');
  const codes = [...new Set(Object.values(lookup).map(d => d.countyCode))].sort();
  require(JSON.stringify(Object.keys(census.counties).sort()) === JSON.stringify(codes), 'county coverage differs');
  for (const source of manifest.sources) {
    const bytes = readFileSync(`data/raw/county-census/${source.extract}`, 'utf8');
    require(hash(bytes) === source.extractSha256, 'extract hash differs');
    const rows = parseCsv(bytes);
    require(rows.length === codes.length, 'missing or duplicate raw rows');
    const seen = new Set();
    for (const raw of rows) {
      const code = raw.GeographyCode || raw['geography code'];
      require(codes.includes(code) && !seen.has(code), `unexpected or duplicate county ${code}`); seen.add(code);
      const county = census.counties[code], row = county.census[source.year];
      const values = Object.fromEntries(GROUP_KEYS.map(g => [g, 0]));
      if (source.year === 2011) {
        const positions = { white_british: [2], white_other: [3,4,5], mixed: [6,7,8,9], asian: [10,11,12,13,14], black: [15,16,17], other: [18,19] };
        values.total = Number(raw.KS201EW0001);
        for (const group of GROUP_KEYS) values[group] = positions[group].reduce((s,n) => s + Number(raw[`KS201EW${String(n).padStart(4,'0')}`]), 0);
      } else {
        for (const [column, cell] of Object.entries(raw)) {
          if (!column.startsWith('Ethnic group: ')) continue;
          const label = column.slice(13), classified = classifyCensusEthnicLabel(label);
          if (classified.kind === 'total') values.total = Number(cell);
          else if (classified.kind === 'group') values[classified.group] += Number(cell);
        }
        for (const [column, cell] of Object.entries(raw)) {
          if (!column.startsWith('Ethnic group: ') || column.slice(13).includes(':')) continue;
          const label = column.slice(13);
          const group = label === 'White' ? null : ['Asian','Black','Mixed','Other ethnic group'].find(p => label.startsWith(p));
          if (label === 'White') require(Number(cell) === values.white_british + values.white_other, `${code} White parent differs`);
          else if (group) require(Number(cell) === values[{Asian:'asian',Black:'black',Mixed:'mixed','Other ethnic group':'other'}[group]], `${code} parent differs`);
        }
      }
      require(GROUP_KEYS.reduce((s,g) => s+values[g],0) === values.total, `${code} groups do not equal total`);
      require(row.sourceRow === Number(raw.sourceRow), `${code} row locator differs`);
      const districts = Object.keys(lookup).filter(d => lookup[d].countyCode === code).sort();
      require(JSON.stringify(county.districts) === JSON.stringify(districts), `${code} membership differs`);
      for (const field of ['total', ...GROUP_KEYS]) {
        require(Number.isInteger(values[field]) && values[field] >= 0 && values[field] === row.published[field], `${code} ${field} raw count differs`);
        const sum = districts.reduce((s,d) => { const point = site[d][source.year === 2011 ? 'baseline' : 'current']; require(point.year === source.year, 'wrong census year');
          if (field !== 'total') { const shares = source.year === 2021 ? point.census_groups : point.groups; require(shares && Math.abs(shares[field] - point.groups_absolute[field] / point.total_population * 100) <= 0.005001, `${d} displayed share differs from source counts`); }
          return s + (field === 'total' ? point.total_population : point.groups_absolute[field]); },0);
        require(sum === row.districtSum[field] && sum-values[field] === row.difference[field], `${code} reconciliation differs`);
        if (source.year === 2011) require(sum === values[field], `${code} 2011 is not exact`);
      }
      for (const [year, count] of Object.entries(estimates.counties[code].series)) require(districts.reduce((s,d) => s+estimates.areas[d].series[year],0) === count, `${code} MYE ${year} differs`);
      require(Object.keys(estimates.counties[code].series).length === 15, `${code} incomplete MYE series`);
    }
  }
  return { counties: codes.length, censusComparisons: codes.length*14, populationComparisons: codes.length*15 };
}
