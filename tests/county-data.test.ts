import fs from 'node:fs';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { parseCsv } from '../scripts/lib/csv-parser.mjs';
import { classifyCensusEthnicLabel, GROUP_KEYS } from '../scripts/lib/census-ethnic-groups.mjs';

const read = (file: string) => JSON.parse(fs.readFileSync(file, 'utf8'));
const census = read('src/data/live/county-census.json');
const estimates = read('src/data/live/population-estimates.json');
const site = read('src/data/live/ethnic-projections.json').areas;
const lookup = read('src/data/lookups/district-to-utla.json').districts;
const manifest = read('data/raw/manifests/county_census.json');
const countyCodes = [...new Set(Object.values(lookup).map((d: any) => d.countyCode))].sort();

describe('county source records and publication gate', () => {
  it('covers the county lookup exactly, without adding public county routes', () => {
    expect(Object.keys(census.counties).sort()).toEqual(countyCodes);
    expect(Object.keys(estimates.counties).sort()).toEqual(countyCodes);
    expect(fs.existsSync('src/pages/places/counties')).toBe(false);
  });

  it('reconciles every MYE4 year with the published county workbook rows', () => {
    for (const code of countyCodes) {
      const county = estimates.counties[code as string];
      expect(county.locators.population).toMatch(/^v1:xlsx:sheet=MYE4;row=\d+$/);
      expect(Object.keys(county.series)).toHaveLength(15);
      const districts = Object.keys(lookup).filter(d => lookup[d].countyCode === code);
      for (const [year, count] of Object.entries(county.series)) {
        expect(districts.reduce((sum, d) => sum + estimates.areas[d].series[year], 0), `${code} ${year}`).toBe(count);
      }
    }
  });

  it('re-reads the committed raw rows and checks every derived census cell', () => {
    for (const source of manifest.sources) {
      const bytes = fs.readFileSync(`data/raw/county-census/${source.extract}`);
      expect(createHash('sha256').update(bytes).digest('hex')).toBe(source.extractSha256);
      for (const raw of parseCsv(bytes.toString())) {
        const code = raw.GeographyCode || raw['geography code'];
        const row = census.counties[code].census[source.year];
        const values: Record<string, number> = Object.fromEntries(GROUP_KEYS.map((g: string) => [g, 0]));
        if (source.year === 2011) {
          const positions: Record<string, number[]> = {white_british: [2], white_other: [3, 4, 5], mixed: [6, 7, 8, 9], asian: [10, 11, 12, 13, 14], black: [15, 16, 17], other: [18, 19]};
          values.total = Number(raw.KS201EW0001);
          for (const group of GROUP_KEYS) values[group] = positions[group].reduce((sum, n) => sum + Number(raw[`KS201EW${String(n).padStart(4, '0')}`]), 0);
        } else {
          for (const [column, cell] of Object.entries(raw)) {
            if (!column.startsWith('Ethnic group: ')) continue;
            const classified = classifyCensusEthnicLabel(column.slice('Ethnic group: '.length));
            if (classified.kind === 'total') values.total = Number(cell);
            else if (classified.kind === 'group') values[classified.group] += Number(cell);
          }
        }
        expect(row.published, code).toEqual(values);
        expect(row.sourceRow).toBe(Number(raw.sourceRow));
        const districts = Object.keys(lookup).filter(d => lookup[d].countyCode === code);
        for (const field of ['total', ...GROUP_KEYS]) {
          const sum = districts.reduce((s, d) => {
            const side = site[d][source.year === 2011 ? 'baseline' : 'current'];
            expect(side.year).toBe(source.year);
            return s + (field === 'total' ? side.total_population : side.groups_absolute[field]);
          }, 0);
          expect(row.districtSum[field], `${code} ${field}`).toBe(sum);
          expect(row.difference[field]).toBe(sum - values[field]);
        }
        expect(row.exact).toBe(Object.values(row.difference).every(d => d === 0));
        if (source.year === 2011) expect(row.exact, code).toBe(true);
      }
    }
  });

  it('keeps the unresolved Census 2021 differences behind a failed publication gate', () => {
    const ready = Object.values(census.counties).every((county: any) => Object.values(county.census).every((row: any) => row.exact));
    expect(census.publicationReady).toBe(ready);
    expect(ready).toBe(false);
    const gate = spawnSync(process.execPath, ['scripts/check/county-reconciliation.mjs'], { encoding: 'utf8' });
    expect(gate.status).toBe(1);
    expect(gate.stderr).toContain('County publication blocked');
  });
});
