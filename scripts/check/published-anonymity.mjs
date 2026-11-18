import fs from 'node:fs';
import path from 'node:path';
// The footer names the publisher (15 November 2026); nothing else in the build may.
// HTML is read with its <footer> taken out; metadata, feeds and images are read whole.
const failures=[];
function visit(dir){for(const entry of fs.readdirSync(dir,{withFileTypes:true})){
 const file=path.join(dir,entry.name);
 if(entry.isDirectory())visit(file);
 else if(/\.(html|js|css|json|svg|xml|txt|png|webp)$/.test(file)){
  let content=fs.readFileSync(file).toString('utf8').replace(/\s+/g,' ');
  if(file.endsWith('.html'))content=content.replace(/<footer[\s\S]*?<\/footer>/gi,'');
  if(/Tom Pickup|Lancashire county councillor and Reform UK member/i.test(content))failures.push(file);
 }
}}
visit('dist');
if(failures.length)throw new Error(`Personal publisher attribution outside the footer in ${failures.join(', ')}`);
console.log('Published anonymity check: the publisher is named in the footer only, not in page copy, metadata or images.');
