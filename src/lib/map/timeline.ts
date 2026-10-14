import fs from 'node:fs';
import { geoMercator } from 'd3-geo';
import { getPublicPlaceAreas, slugifyAreaName } from '../site';
import { canonicalAreaCode } from '../area-codes';
import { ETHNIC_PALETTE, type EthnicGroupKey } from '../ethnic-palette';
import { censusGroupShares, getIndicator, colourFor, SEQUENTIAL, DIVERGING, type Indicator } from './indicators';
import { loadCouncils } from './geo';
import { svgPath } from './layout';

export const timelineAreas = getPublicPlaceAreas().sort((a,b) => a.areaName.localeCompare(b.areaName));
export const POPULATION = getIndicator('population_change', { projections: false });
export const GROUPS = ETHNIC_PALETTE;
export const CENSUS_YEARS = [2011, 2021] as const;
export const STEP_MS = 1200;
export function groupIndicator(group: EthnicGroupKey, change = false): Indicator {
  const base = getIndicator('white_british_share', { projections: false });
  const label = GROUPS.find(g => g.key === group)!.label;
  const share = (code: string, year: number) => CENSUS_YEARS.includes(year as 2011 | 2021)
    ? censusGroupShares(code, year as 2011 | 2021)?.[group] ?? null : null;
  return { ...base, id: `${group}_${change ? 'change' : 'share'}`, title: `${label} ${change ? 'change, 2011 to 2021' : 'share of residents'}`,
    years: change ? [2021] : [...CENSUS_YEARS],
    value: (code, year) => {
      const now = share(code, year), before = share(code, 2011);
      return now == null || (change && before == null) ? null : change ? now - before! : now;
    },
    format: v => change ? `${v > 0 ? '+' : ''}${v.toFixed(1)} percentage points` : `${v.toFixed(1)}%`,
    scale: change
      ? { breaks: [-10, -5, -1, 1, 5, 10], colours: DIVERGING, labels: ['−10', '−5', '−1', '+1', '+5', '+10 percentage points'], type: 'diverging' }
      : { breaks: [5, 10, 20, 40, 60, 80], colours: SEQUENTIAL, labels: ['5', '10', '20', '40', '60', '80%'], type: 'sequential' },
    reference: () => null,
  };
}
export function frame(ind: Indicator, year: number) {
  return {
    year, title: ind.title, source: ind.source(year), kind: ind.kind(year), scale: ind.scale,
    rows: timelineAreas.map(a => {
      const value = ind.value(a.areaCode, year);
      return [value == null ? 'n/a' : ind.format(value), value == null ? '#6e747a' : colourFor(ind, value)] as [string, string];
    }),
  };
}
export function populationFrames() { return POPULATION.years.map(year => frame(POPULATION, year)); }
export function ethnicityFrames() {
  return Object.fromEntries(GROUPS.map(g => [g.key, {
    years: CENSUS_YEARS.map(y => frame(groupIndicator(g.key), y)),
    change: frame(groupIndicator(g.key, true), 2021),
  }]));
}
export function compositions() {
  return timelineAreas.map(a => CENSUS_YEARS.map(y => GROUPS.map(g => censusGroupShares(a.areaCode, y)?.[g.key] ?? null)));
}
export function hexPaths(): { code: string; path: string; transform: string }[] {
  const raw = JSON.parse(fs.readFileSync('data/geography/lad25-odi.hexjson', 'utf8'));
  if (raw.layout !== 'odd-r') throw new Error('Unsupported hex layout');
  const hexes = new Map(Object.entries(raw.hexes).map(([code, h]) => [canonicalAreaCode(code), h as { q: number; r: number }]));
  const centres = timelineAreas.map(a => {
    const h = hexes.get(a.areaCode);
    if (!h) throw new Error(`No hex for ${a.areaCode}`);
    return { code: a.areaCode, x: Math.sqrt(3) * (h.q + (Math.abs(h.r % 2) / 2)), y: -1.5 * h.r };
  });
  if (new Set(centres.map(h => `${h.x},${h.y}`)).size !== centres.length) throw new Error('Overlapping hexes');
  const minX = Math.min(...centres.map(h => h.x)) - 1, maxX = Math.max(...centres.map(h => h.x)) + 1;
  const minY = Math.min(...centres.map(h => h.y)) - 1, maxY = Math.max(...centres.map(h => h.y)) + 1;
  const scale = Math.min(580 / (maxX - minX), 620 / (maxY - minY));
  const hex = Array.from({ length: 6 }, (_, i) => {
    const angle = (60 * i - 30) * Math.PI / 180;
    return `${i ? 'L' : 'M'}${(Math.cos(angle) * .96 * scale).toFixed(1)},${(Math.sin(angle) * .96 * scale).toFixed(1)}`;
  }).join('') + 'Z';
  return centres.map(h => ({ code: h.code, path: hex, transform: `translate(${(10 + (h.x - minX) * scale).toFixed(1)} ${(10 + (h.y - minY) * scale).toFixed(1)})` }));
}
export function geographicPaths() {
  const councils = loadCouncils();
  const features = timelineAreas.map(a => councils.get(a.areaCode)!);
  const projection = geoMercator().fitExtent([[10, 10], [590, 630]], { type: 'FeatureCollection', features } as any);
  return features.map(f => svgPath(f, projection, .65));
}
export const placeHref = (i: number) => `/places/${slugifyAreaName(timelineAreas[i].areaName)}/`;
