import fs from 'node:fs';
import {gzipSync} from 'node:zlib';
for(const [type,expected,budget] of [['counties',21,40*1024],['regions',10,75*1024]]){
 const measured=[];
 for(const entry of fs.readdirSync(`dist/places/${type}`,{withFileTypes:true})){
  if(!entry.isDirectory())continue;
  const html=fs.readFileSync(`dist/places/${type}/${entry.name}/index.html`,'utf8');
  const block=html.match(/<section[^>]*data-group-maps[\s\S]*?<\/section>\s*<p/);
  if(!block)throw new Error(`${entry.name}: group maps missing`);
  const bytes=gzipSync(block[0]).length;
  if(bytes>budget)throw new Error(`${entry.name}: group maps ${bytes} exceed ${budget} gzipped bytes`);
  measured.push({name:entry.name,bytes});
 }
 if(measured.length!==expected)throw new Error(`${type}: expected ${expected} maps, found ${measured.length}`);
 const max=measured.reduce((a,b)=>a.bytes>b.bytes?a:b);
 console.log(`${type}: ${measured.length} pages, maximum group map block ${max.bytes} gzipped bytes (${max.name}); budget ${budget}.`);
}
