import fs from 'node:fs';
import path from 'node:path';
const failures=[];
function visit(dir){for(const e of fs.readdirSync(dir,{withFileTypes:true})){
 if(e.name==='pagefind')continue;
 const file=path.join(dir,e.name);
 if(e.isDirectory())visit(file);
 else if(/\.(html|js|css|json|svg|xml|txt)$/.test(file) && /[\u2013\u2014]|&mdash;|&ndash;/.test(fs.readFileSync(file,'utf8')))failures.push(file);
}}
visit('dist');
if(failures.length)throw new Error(`Prohibited published dashes in ${failures.join(', ')}`);
console.log('Published dash check: zero files containing prohibited dash characters or entities.');
