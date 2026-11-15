import fs from 'node:fs';
import { describe, expect, it } from 'vitest';
import { binValues, formatEdge } from '../src/lib/distribution';
import fiscal from '../src/data/live/fiscal-resilience.json';
import housing from '../src/data/live/housing-demand.json';
import schools from '../src/data/live/school-pressure.json';

describe('binValues', () => {
  it('counts every finite value once, and an inner edge value in the bin above it', () => {
    const { bins, n, skipped } = binValues([0, 4.9, 5, 9.99, 10, 12, null, undefined, Number.NaN], 5);
    expect(n).toBe(6);
    expect(skipped).toBe(3);
    expect(bins.map((b) => [b.from, b.to, b.count])).toEqual([[0, 5, 2], [5, 10, 2], [10, 15, 2]]);
  });

  it('keeps the top edge in the last bin when max is an edge', () => {
    const { bins } = binValues([0, 100], 25, { min: 0, max: 100 });
    expect(bins.map((b) => b.count)).toEqual([1, 0, 0, 1]);
    expect(bins.at(-1)!.to).toBe(100);
  });

  it('widens the range for min and max but never drops a value outside them', () => {
    const { bins, n } = binValues([-5.6, 2.8], 1, { min: 0 });
    expect(n).toBe(2);
    expect(bins[0].from).toBe(-6);
    expect(bins.at(-1)!.to).toBe(3);
    expect(bins.reduce((s, b) => s + b.count, 0)).toBe(2);
  });

  it('does not drift on decimal steps', () => {
    const { bins } = binValues([0.3, 0.6, 0.9], 0.3);
    expect(bins.map((b) => [b.from, b.to, b.count])).toEqual([[0.3, 0.6, 1], [0.6, 0.9, 2]]);
    expect(bins.reduce((s, b) => s + b.count, 0)).toBe(3);
  });

  it('writes a true minus sign and no hyphen or dash', () => {
    expect(formatEdge(-2.5, 2.5)).toBe('−2.5');
    expect(formatEdge(0, 1)).toBe('0');
    expect(formatEdge(10, 2.5)).toBe('10');
    expect(formatEdge(7.5, 2.5)).toBe('7.5');
  });
});

describe('dashboard charts count the same areas their tables list', () => {
  it('pressure: every council is counted', () => {
    const scores = Object.values((fiscal as any).areas).map((a: any) => a.serviceDemandPressureScore);
    const { n, bins } = binValues(scores, 5, { min: 0, max: 100 });
    expect(n).toBe(Object.keys((fiscal as any).areas).length);
    expect(bins.reduce((s, b) => s + b.count, 0)).toBe(n);
    // The cutoffs on the page fall on bin edges, so no bar straddles two bands.
    for (const cut of [25, 45, 70]) expect(bins.some((b) => b.from === cut)).toBe(true);
  });

  it('housing and schools: only areas with data, and no value is lost', () => {
    const h = Object.values((housing as any).areas).filter((a: any) => a.dataAvailable).map((a: any) => a.socialRentChangePp);
    const s = Object.values((schools as any).areas).filter((a: any) => a.dataAvailable).map((a: any) => a.ealDemandGrowthPp);
    for (const [values, step] of [[h, 1], [s, 2.5]] as const) {
      const b = binValues(values, step, { min: 0 });
      expect(b.n + b.skipped).toBe(values.length);
      expect(b.bins.reduce((t, x) => t + x.count, 0)).toBe(b.n);
    }
  });

  it('the dashboards draw their charts with the shared component, not a ranking', () => {
    for (const page of ['pressure', 'housing', 'schools']) {
      const src = fs.readFileSync(`src/pages/${page}.astro`, 'utf8');
      expect(src).toContain('<DistributionChart');
    }
    expect(fs.readFileSync('src/pages/regional.astro', 'utf8')).toContain('coveredSeries(codes)');
  });
});
