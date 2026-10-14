import { readFileSync, readdirSync } from 'node:fs';
import { gzipSync } from 'node:zlib';
import { join } from 'node:path';
const html = readFileSync('dist/maps/index.html','utf8');
const scripts = [...html.matchAll(/<script[^>]*src="([^"]+)"/g)].map(m=>m[1]).filter(s=>s.startsWith('/'));
const styles = [...html.matchAll(/<link[^>]*href="([^"]+\.css)"/g)].map(m=>m[1]).filter(s=>s.startsWith('/'));
const files = ['maps/index.html',...new Set([...scripts,...styles].map(s=>s.slice(1)))];
const size = files.reduce((n,f)=>n+gzipSync(readFileSync(join('dist',f))).length,0);
console.log(`National map first load HTML, scripts and CSS: ${size} gzipped bytes`);
if (size > 30*1024) throw new Error('National map exceeds 30 KB');
for(const f of readdirSync('dist/maps/data')) {
  const bytes=gzipSync(readFileSync(join('dist/maps/data',f))).length;
  console.log(`${f}: ${bytes} gzipped bytes`);
  if(bytes>60*1024) throw new Error(`${f} exceeds 60 KB`);
}
