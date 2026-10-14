import type {APIRoute} from 'astro';
import {publicCounties,countyRecords,countySources} from '../../lib/counties';
import {ETHNIC_PALETTE} from '../../lib/ethnic-palette';
export const prerender=true;
export const GET:APIRoute=()=>{
  const rows:unknown[][]=[['county_code','county_name','year','measure','published_county','district_sum','difference','source_url','source_row','archive_sha256','extract_sha256','archive_member','district_codes']];
  for(const c of publicCounties) for(const year of [2011,2021] as const) for(const group of ['total',...ETHNIC_PALETTE.map(g=>g.key)] as const){
    const row=countyRecords[c.code].census[year], source=countySources.find(s=>s.year===year)!;rows.push([c.code,c.name,year,group,row.published[group],row.districtSum[group],row.difference[group],source.sourceUrl,row.sourceRow,source.sha256,source.extractSha256,source.member,countyRecords[c.code].districts.join('|')]);
  }
  return new Response(rows.map(r=>r.map(v=>'"'+String(v).replaceAll('"','""')+'"').join(',')).join('\n')+'\n',{headers:{'Content-Type':'text/csv; charset=utf-8'}});
};
