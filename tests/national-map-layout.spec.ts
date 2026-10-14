import AxeBuilder from '@axe-core/playwright';
import { test, expect } from '@playwright/test';
import fs from 'node:fs';
import { ETHNIC_PALETTE as GROUPS } from '../src/lib/ethnic-palette';
const population = JSON.parse(fs.readFileSync('dist/maps/data/population.json','utf8'));
const ethnicity = JSON.parse(fs.readFileSync('dist/maps/data/ethnicity.json','utf8'));
const timelineAreas = Object.keys(JSON.parse(fs.readFileSync('src/data/live/ethnic-projections.json','utf8')).areas);

test('default map and all table rows work without JavaScript', async ({ browser, baseURL }) => {
  const context = await browser.newContext({ javaScriptEnabled: false, baseURL, viewport: { width: 375, height: 812 } });
  const page = await context.newPage();
  await page.goto('/maps/');
  await expect(page.locator('#map-table tbody tr')).toHaveCount(timelineAreas.length);
  await expect(page.locator('#map-heading')).toContainText('mid-2025');
  await expect(page.locator('#national-map path')).toHaveCount(timelineAreas.length);
  await expect(page.locator('#map-controls')).toBeHidden();
  await context.close();
});

test('keyboard playback uses held years, pauses and respects reduced motion', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  await page.goto('/maps/');
  expect(await page.locator('#population-years option').evaluateAll(nodes => nodes.map(n => Number(n.getAttribute('value'))))).toEqual(population.map((f: any) => f.year));
  await page.locator('#map-year').focus(); await page.keyboard.press('Home');
  await expect(page.locator('#year-label')).toHaveText('2011');
  await page.locator('#map-play').focus(); await page.keyboard.press('Space');
  await expect(page.locator('#map-play')).toHaveText('Pause');
  await expect(page.locator('#year-label')).toHaveText('2012', { timeout: 5000 });
  await page.keyboard.press('Escape');
  await expect(page.locator('#map-play')).toHaveText('Play');
  expect(await page.locator('#map-table tbody td').allTextContents()).toEqual(population.find((f: any) => f.year === 2012).rows.map((r: string[]) => r[0]));
  await page.getByRole('tab', { name: 'Population', exact: true }).focus();
  await page.keyboard.press('End');
  await expect(page.getByRole('tab', { name: 'Ethnic groups', exact: true })).toBeFocused();
  await expect(page.locator('#map-play')).toBeHidden();
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.keyboard.press('Home');
  await expect(page.locator('#map-play')).toBeHidden();
});

for (const scheme of ['light','dark'] as const) {
  test(`every measure, group and census state is accessible in ${scheme} mode`, async ({ page }, testInfo) => {
    test.setTimeout(180000);
    await page.emulateMedia({ colorScheme: scheme });
    await page.setViewportSize({ width:375, height:812 });
    await page.goto('/maps/');
    async function check() {
      await expect(page.locator('#timeline')).not.toHaveAttribute('aria-busy','true');
      expect((await new AxeBuilder({ page }).include('#timeline').analyze()).violations).toEqual([]);
      expect(await page.evaluate(() => document.documentElement.scrollWidth - innerWidth)).toBeLessThanOrEqual(2);
    }
    for (const year of [2011,2025]) {
      await page.locator('#map-year').focus(); await page.keyboard.press(year === 2011 ? 'Home' : 'End'); await check();
    }
    await page.getByRole('tab', { name:'Ethnic groups', exact:true }).click();
    for (const group of GROUPS) {
      await page.locator('#map-group').selectOption(group.key);
      for (const year of ['2011','2021','change']) {
        await page.locator(`[data-census="${year}"]`).click(); await check();
        const expected = year === 'change' ? ethnicity.frames[group.key].change : ethnicity.frames[group.key].years.find((f: any) => f.year === Number(year));
        expect(await page.locator('#map-table tbody td').allTextContents()).toEqual(expected.rows.map((r: string[])=>r[0]));
        await expect(page.locator('#composition h4')).toHaveCount(6);
        await expect(page.locator('#map-play')).toBeHidden();
      }
    }
    const before = await page.locator('#national-map path').first().getAttribute('d');
    await page.locator('#map-view').selectOption('geographic'); await check();
    expect(await page.locator('#national-map path').first().getAttribute('d')).not.toBe(before);
    const hash = new URL(page.url()).hash;
    await page.reload(); await check();
    expect(new URL(page.url()).hash).toBe(hash);
    await expect(page.locator('#map-view')).toHaveValue('geographic');
    await expect(page.locator('link[rel="canonical"]')).toHaveAttribute('href','https://ukdemographics.co.uk/maps/');
    await page.screenshot({ path: testInfo.outputPath(`map-${scheme}-mobile.png`) });
    await page.setViewportSize({ width:1440, height:1600 });
    await page.screenshot({ path: testInfo.outputPath(`map-${scheme}-desktop.png`) });
  });
}
