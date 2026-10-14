import fs from 'node:fs';
import path from 'node:path';
const failures=[];
function visit(dir){for(const entry of fs.readdirSync(dir,{withFileTypes:true})){
 const file=path.join(dir,entry.name);
 if(entry.isDirectory())visit(file);
 else if(/\.(html|js|css|json|svg|xml|txt|png|webp)$/.test(file)){
  const content=fs.readFileSync(file).toString('utf8').replace(/\s+/g,' ');
  if(/Tom Pickup|Lancashire county councillor and Reform UK member/i.test(content))failures.push(file);
 }
}}
visit('dist');
if(failures.length)throw new Error(`Personal publisher attribution in ${failures.join(', ')}`);
console.log('Published anonymity check: no personal publisher attribution in pages, metadata or images.');
