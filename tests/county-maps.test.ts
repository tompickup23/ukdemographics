import {describe,it,expect} from 'vitest';
import {countyCodes,countyFrame,regionSlugs,regionFrame} from '../src/lib/map/geo';
import {getIndicator} from '../src/lib/map/indicators';
import {renderStill,qa} from '../src/lib/map/render';
import {getIndexableSitePaths} from '../src/lib/site';
import {getPublicSearchEntries} from '../src/lib/site-search';
import {countyPath} from '../src/lib/counties';
describe('county and region maps',()=>{
  it('rejects clipped text on wide maps',()=>{
    const r=renderStill(countyFrame(countyCodes()[0].code),getIndicator('population_change',{projections:false}),'wide',2025);
    expect(qa(r)).toEqual([]);
    r.texts[0].y=0;
    expect(qa(r).some(e=>e.includes('outside the wide canvas'))).toBe(true);
  });
  it('renders every county and year with complete wide labels and valid mobile maps',()=>{
    for(const county of countyCodes()) for(const id of ['population_change','white_british_share'] as const){
      const ind=getIndicator(id,{projections:false});
      for(const year of ind.years) for(const tk of ['wide','inline'] as const){
        const r=renderStill(countyFrame(county.code),ind,tk,year);
        expect(qa(r),`${county.name} ${id} ${tk} ${year}`).toEqual([]);
        if(tk==='wide') expect(r.layout.unlabelled,county.name).toEqual([]);
      }
    }
  },120000);
  it('renders each observed regional map with the same registry and includes every county in search and sitemap',()=>{
    for(const region of regionSlugs()) for(const id of ['population_change','white_british_share'] as const){
      const ind=getIndicator(id,{projections:false});
      for(const tk of ['wide','inline'] as const) expect(qa(renderStill(regionFrame(region.slug),ind,tk,ind.years.at(-1)!))).toEqual([]);
    }
    for(const c of countyCodes()){
      expect(getIndexableSitePaths()).toContain(countyPath(c.name));
      expect(getPublicSearchEntries().some(e=>e.href===countyPath(c.name))).toBe(true);
    }
  },120000);
});
