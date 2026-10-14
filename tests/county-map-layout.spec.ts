import {test,expect} from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import {stabilizePage} from './layout-helpers';
for(const path of ['/places/counties/lancashire/','/places/counties/essex/','/places/regions/north-west/']){
  test(`county and region maps are accessible without overflow: ${path}`,async({page})=>{
    await stabilizePage(page); await page.goto(path,{waitUntil:'networkidle'});
    await expect(page.locator('[data-group-maps]')).toBeVisible();
    expect(await page.evaluate(()=>document.documentElement.scrollWidth-window.innerWidth)).toBeLessThanOrEqual(2);
    expect((await new AxeBuilder({page}).analyze()).violations).toEqual([]);
    if(path.includes('lancashire')){
      await expect(page.getByText('1,235,351',{exact:true}).first()).toBeVisible();
      await expect(page.getByText('19 residents higher',{exact:false})).toBeVisible();
      await page.getByText('Reconciliation: every county and district-sum comparison',{exact:true}).click();
      await expect(page.getByRole('region',{name:'County census reconciliation'}).locator('tbody tr')).toHaveCount(14);
    }
    await page.screenshot({path:`test-results/${path.split('/').filter(Boolean).at(-1)}-${test.info().project.name}.png`,fullPage:true});
  });
}
test('county counts, source notes and reconciliation remain usable without JavaScript',async({browser})=>{
 const context=await browser.newContext({javaScriptEnabled:false,viewport:{width:375,height:812}});
 const page=await context.newPage();await page.goto('http://127.0.0.1:4322/places/counties/lancashire/');
 await page.getByText('Reconciliation: every county and district-sum comparison',{exact:true}).click();
 await expect(page.getByRole('region',{name:'County census reconciliation'}).locator('tbody tr')).toHaveCount(14);
 expect(await page.evaluate(()=>document.documentElement.scrollWidth-window.innerWidth)).toBeLessThanOrEqual(2);
 await expect(page.getByRole('link',{name:'Download all county reconciliation records (CSV)'})).toBeVisible();await context.close();
});
