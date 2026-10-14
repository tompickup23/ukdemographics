import fs from 'node:fs';
import { gzipSync } from 'node:zlib';
import { describe, it, expect } from 'vitest';
import { timelineAreas, POPULATION, populationFrames, ethnicityFrames, compositions, hexPaths, geographicPaths, GROUPS, CENSUS_YEARS } from '../src/lib/map/timeline';
import { censusGroupShares } from '../src/lib/map/indicators';
import { PLACE_COUNT } from '../src/lib/coverage';
const model = JSON.parse(fs.readFileSync('src/data/live/ethnic-projections.json', 'utf8'));

describe('national map data', () => {
  it('covers every council once with equal-area hexes and geographic paths', () => {
    const hexes = hexPaths();
    expect(hexes).toHaveLength(PLACE_COUNT);
    expect(new Set(hexes.map(h => h.transform)).size).toBe(PLACE_COUNT);
    expect(geographicPaths()).toHaveLength(PLACE_COUNT);
    expect(geographicPaths().every(Boolean)).toBe(true);
    const names = timelineAreas.map(a => a.areaName);
    expect(names).toEqual([...names].sort((a,b) => a.localeCompare(b)));
  });
  it('uses only held population years and registry values without interpolation', () => {
    const frames = populationFrames();
    expect(frames.map(f => f.year)).toEqual(POPULATION.years);
    for (const f of frames) timelineAreas.forEach((a,i) => {
      const value = POPULATION.value(a.areaCode, f.year);
      expect(f.rows[i][0]).toBe(value == null ? 'n/a' : POPULATION.format(value));
      expect(f.source).toBe(POPULATION.source(f.year));
    });
  });
  it('uses census counts for all six groups and the exact difference between shares', () => {
    const frames = ethnicityFrames(), bars = compositions();
    expect(CENSUS_YEARS).toEqual([2011, 2021]);
    expect(timelineAreas.reduce((n,a) => n + model.areas[a.areaCode].baseline.total_population, 0)).toBe(56075912);
    for (const g of GROUPS) {
      expect(frames[g.key].years.map(f => f.year)).toEqual([2011, 2021]);
      timelineAreas.forEach((a,i) => {
        const shares = CENSUS_YEARS.map(y => censusGroupShares(a.areaCode,y)![g.key]);
        for (let y = 0; y < 2; y++) expect(frames[g.key].years[y].rows[i][0]).toBe(`${shares[y].toFixed(1)}%`);
        const d = shares[1] - shares[0];
        expect(frames[g.key].change.rows[i][0]).toBe(`${d > 0 ? '+' : ''}${d.toFixed(1)} percentage points`);
        expect(bars[i].map(row => row[GROUPS.indexOf(g)])).toEqual(shares);
      });
    }
  });
  it('caps on-demand files and the script', () => {
    for (const data of [populationFrames(), { frames: ethnicityFrames(), bars: compositions() }, geographicPaths()]) {
      expect(gzipSync(JSON.stringify(data)).length).toBeLessThan(60 * 1024);
    }
    expect(gzipSync(fs.readFileSync('public/scripts/national-map.js')).length).toBeLessThan(7 * 1024);
  });
});


it('retains the existing CSP verbatim on the compact map layout', () => {
  const csp = (file: string) => fs.readFileSync(file,'utf8').match(/http-equiv="Content-Security-Policy" content="([^"]+)"/)![1];
  expect(csp('src/layouts/MapLayout.astro')).toBe(csp('src/layouts/BaseLayout.astro'));
});
