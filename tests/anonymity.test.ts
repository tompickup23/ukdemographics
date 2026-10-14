import { it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
it('keeps public source and metadata free of personal publisher attribution',()=>{
  const failures:string[]=[];
  function visit(dir:string){for(const entry of fs.readdirSync(dir,{withFileTypes:true})){
    const file=path.join(dir,entry.name);
    if(entry.isDirectory())visit(file);
    else if(/\.(astro|ts|js|json|html|md|mdx|xml|txt|svg)$/.test(file) && /Tom Pickup|Lancashire county councillor and Reform UK member/i.test(fs.readFileSync(file,'utf8').replace(/\s+/g,' ')))failures.push(file);
  }}
  visit('src');visit('public');
  expect(failures).toEqual([]);
});
