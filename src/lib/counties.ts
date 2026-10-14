import rawLookup from '../data/lookups/district-to-utla.json';
import rawCensus from '../data/live/county-census.json';
import rawPopulation from '../data/live/population-estimates.json';
const lookup = rawLookup.districts as Record<string, { countyCode: string; countyName: string }>;
export const countyPath = (name: string) => `/places/counties/${name.toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/(^-|-$)/g,'')}/`;
export const publicCounties = [...new Map(Object.values(lookup).map(d => [d.countyCode, {code:d.countyCode,name:d.countyName}])).values()].sort((a,b)=>a.name.localeCompare(b.name));
export const countyForDistrict = (code: string) => lookup[code] ?? null;
export interface CountyCounts { total: number; white_british: number; white_other: number; asian: number; black: number; mixed: number; other: number }
export type CountyGroup = Exclude<keyof CountyCounts, 'total'>;
export interface CountyRow { published: CountyCounts; districtSum: CountyCounts; difference: CountyCounts; exact: boolean; sourceRow: number }
export interface County { name: string; districts: string[]; census: Record<'2011'|'2021', CountyRow> }
export const countyRecords = rawCensus.counties as Record<string, County>;
export const countySources = rawCensus.sources;
export const countyPopulation = rawPopulation.counties as Record<string, {series: Record<string,number>}>;
export function countyShares(code: string, year: 2011|2021): Record<CountyGroup,number> {
  const counts = countyRecords[code].census[year].published;
  const keys: CountyGroup[] = ['white_british','white_other','asian','black','mixed','other'];
  return Object.fromEntries(keys.map(key=>[key,counts[key]/counts.total*100])) as Record<CountyGroup,number>;
}
export function countyChange(code: string, group: CountyGroup): number { return countyShares(code,2021)[group]-countyShares(code,2011)[group]; }

export function countyPopulationSummary(code: string): string {
  const series = countyPopulation[code].series;
  const start = series['2011'], end = series['2025'], change = end - start;
  const verb = change > 0 ? 'rose' : change < 0 ? 'fell' : 'did not change';
  const amount = change === 0 ? '' : ` by ${Math.abs(change).toLocaleString('en-GB')} residents (${(Math.abs(change)/start*100).toFixed(1)}%)`;
  return `ONS estimates show that the county council area's population ${verb}${amount} between mid-2011 and mid-2025, from ${start.toLocaleString('en-GB')} to ${end.toLocaleString('en-GB')}.`;
}
