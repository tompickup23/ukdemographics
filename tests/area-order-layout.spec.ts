import { expect, test } from '@playwright/test';

test('places offers only alphabetical ordering and keeps it when filtering', async ({ page }) => {
  await page.goto('/places/');
  const controls = page.locator('[data-sort]');
  await expect(controls).toHaveCount(2);
  expect(await controls.evaluateAll(nodes => nodes.map(n => n.getAttribute('data-sort')))).toEqual(['name', 'region']);
  const names = () => page.locator('.pl-row:not([hidden]) .pl-name').allTextContents();
  const alphabetical = async () => {
    const list = await names();
    expect(list).toEqual([...list].sort((a, b) => a.localeCompare(b)));
  };
  await alphabetical();
  if (await controls.first().isVisible()) {
    await page.getByRole('button', { name: 'Region A to Z' }).click();
    const keys = await page.locator('.pl-row').evaluateAll(nodes => nodes.map(n => `${n.getAttribute('data-region')}|${n.getAttribute('data-name')}`));
    expect(keys).toEqual([...keys].sort((a,b) => a.localeCompare(b)));
    await page.getByRole('button', { name: 'Area A to Z' }).click();
    await alphabetical();
  }
  await page.getByRole('button', { name: 'North West', exact: true }).click();
  await alphabetical();
  await page.getByRole('searchbox', { name: 'Filter areas by name' }).fill('burn');
  await expect(page.locator('.pl-row:not([hidden]) .pl-name')).toHaveText(['Blackburn with Darwen', 'Burnley', 'Hyndburn']);
  await alphabetical();
});

test('area directories render A to Z without JavaScript', async ({ browser, baseURL }) => {
  const context = await browser.newContext({ javaScriptEnabled: false, baseURL });
  const page = await context.newPage();
  for (const [route, selector] of [
    ['/places/', '.pl-name'], ['/national/', '.area-row .name'],
    ['/schools/', '.area-row .name'], ['/housing/', '.area-row .name'],
    ['/pressure/', '.area-row .name'], ['/regional/', '.region-name'],
  ]) {
    await page.goto(route);
    const names = await page.locator(selector).allTextContents();
    expect(names.length).toBeGreaterThan(1);
    expect(names, route).toEqual([...names].sort((a,b) => a.localeCompare(b)));
  }
  await context.close();
});
