import { expect, test } from '@playwright/test';
import { mkdirSync } from 'node:fs';
import { disableMotion, stabilizePage } from './layout-helpers';

test('Burnley council links fit at 375 px and retain a review capture', async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 812 });
  await stabilizePage(page);
  await page.goto('/places/burnley/', { waitUntil: 'networkidle' });
  await disableMotion(page);
  const block = page.locator('[data-tax-site-links]');
  await block.scrollIntoViewIfNeeded();
  await expect(block).toBeVisible();
  await expect(block.locator('.as-cross-desc')).toHaveText("Council tax bands and the 2026/27 Band D for Burnley on UK Council Tax; the council's profile on UK Councils.");
  await expect(block.locator('a')).toHaveCount(2);
  expect(await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)).toBeLessThanOrEqual(2);
  const bounds = await block.boundingBox();
  expect(bounds).not.toBeNull();
  expect(bounds!.x).toBeGreaterThanOrEqual(0);
  expect(bounds!.x + bounds!.width).toBeLessThanOrEqual(375);
  mkdirSync('.cache/review', { recursive: true });
  await page.screenshot({ path: '.cache/review/burnley-tax-links-375.png', scale: 'css' });
});
