import { it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

// The footer names the publisher (decision of 15 November 2026). Nothing else does:
// page copy, metadata, JSON-LD and share cards stay unattributed. Each file is read
// with any <footer> element taken out, and only the two layouts may name him there.
const NAME = /Tom Pickup|Lancashire county councillor and Reform UK member/i;
const FOOTER_FILES = ['src/layouts/BaseLayout.astro', 'src/layouts/MapLayout.astro'];
const stripFooters = (s: string) => s.replace(/<footer[\s\S]*?<\/footer>/gi, '');

it('names the publisher in the footer only', () => {
  const failures: string[] = [];
  function visit(dir: string) {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const file = path.join(dir, entry.name);
      if (entry.isDirectory()) visit(file);
      else if (/\.(astro|ts|js|json|html|md|mdx|xml|txt|svg)$/.test(file)) {
        const text = fs.readFileSync(file, 'utf8').replace(/\s+/g, ' ');
        const scanned = FOOTER_FILES.includes(file) ? stripFooters(text) : text;
        if (NAME.test(scanned)) failures.push(file);
      }
    }
  }
  visit('src'); visit('public');
  expect(failures).toEqual([]);
});

it('carries the footer attribution in both layouts', () => {
  for (const file of FOOTER_FILES) {
    const footer = fs.readFileSync(file, 'utf8').match(/<footer[\s\S]*?<\/footer>/i)?.[0] ?? '';
    expect(footer, file).toMatch(/research project(<\/a>)? by <a href="https:\/\/tompickup\.co\.uk\/" rel="author">Tom Pickup<\/a>/);
  }
});
