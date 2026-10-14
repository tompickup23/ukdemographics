import fs from 'node:fs';
import path from 'node:path';
import ts from 'typescript';
import { describe, expect, it } from 'vitest';

const compact = (s: string) => s.replace(/\s+/g, '');
// These comparisons order dates, chart years, industries or parties, never areas.
// Exact expressions are reviewed exceptions, not file-wide exclusions.
const exceptions: Record<string, string[]> = {
  'src/pages/index.astro': ['(a, b) => new Date(b.data.date).getTime() - new Date(a.data.date).getTime()'],
  'src/pages/findings/index.astro': ['(a, b) => new Date(b.data.date).getTime() - new Date(a.data.date).getTime()'],
  'src/pages/places/[slug].astro': [
    '(a, b) => (b[1].nonUkSharePct ?? 0) - (a[1].nonUkSharePct ?? 0)',
    '(a, b) => b.score - a.score || (b.f.data.updated ?? b.f.data.date).localeCompare(a.f.data.updated ?? a.f.data.date)',
    '(a,b) => b[1]-a[1]',
  ],
  'src/pages/constituencies/index.astro': ['([, a], [, b]) => b - a'],
  'src/pages/constituencies/[slug].astro': ['([, a], [, b]) => b - a', '(a, b) => a.area!.areaName.localeCompare(b.area!.areaName)'],
  'src/components/NinoHistoricalChart.astro': ['(a, b) => a - b'],
  'src/components/ProjectionChart.astro': ['(a, b) => a - b'],
  'src/pages/places/index.astro': ['(a, b) => (key === "region" ? (a.dataset.region ?? "").localeCompare(b.dataset.region ?? "") : 0) || (a.dataset.name ?? "").localeCompare(b.dataset.name ?? "")'],
};
function comparisons(source: string): string[] {
  const result: string[] = [];
  for (const match of source.matchAll(/\.(?:sort|toSorted)\s*\(/g)) {
    const start = match.index! + match[0].length;
    const scanner = ts.createScanner(ts.ScriptTarget.Latest, true, ts.LanguageVariant.Standard, source.slice(start));
    let depth = 1;
    for (let token = scanner.scan(); token !== ts.SyntaxKind.EndOfFileToken; token = scanner.scan()) {
      if (token === ts.SyntaxKind.OpenParenToken) depth++;
      if (token === ts.SyntaxKind.CloseParenToken && --depth === 0) {
        result.push(source.slice(start, start + scanner.getTokenPos()).trim());
        break;
      }
    }
  }
  return result;
}
function allowed(file: string, comparator: string): boolean {
  const c = compact(comparator);
  if (!c) return true; // String arrays: region names, paths and ISO dates.
  if (/^\(a,b\)=>a\.(areaName|name|regionName)\.localeCompare\(b\.\1\)$/.test(c)) return true;
  return (exceptions[file] ?? []).some(e => compact(e) === c);
}
function files(dir: string): string[] {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap(e => {
    const name = path.join(dir, e.name);
    return e.isDirectory() ? files(name) : /\.(astro|ts|js)$/.test(name) ? [name] : [];
  });
}
describe('area ordering', () => {
  it('sweeps every page and component for unreviewed area comparators', () => {
    const failures = [...files('src/pages'), ...files('src/components')].flatMap(file =>
      comparisons(fs.readFileSync(file, 'utf8')).filter(c => !allowed(file, c)).map(c => `${file}: ${c}`));
    expect(failures).toEqual([]);
  });
  it('catches shares, changes, years, counts, scores and indirect comparators', () => {
    for (const field of ['share', 'change', 'year', 'count', 'pop', 'score', 'crossSort']) {
      for (const method of ['sort', 'toSorted']) {
        const [c] = comparisons(`areas.${method}((a,b) => b.${field} - a.${field})`);
        expect(allowed('src/pages/new.astro', c)).toBe(false);
      }
    }
    expect(allowed('src/pages/new.astro', comparisons('areas.sort(byValue)')[0])).toBe(false);
  });
});
