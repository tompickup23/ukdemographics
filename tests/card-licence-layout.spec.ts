import { test, expect } from '@playwright/test';
import { CARD_LICENCE_URL, CARD_USAGE_TERMS } from '../src/lib/map/card-licence';

// These unmerged pages cannot be fetched by Google's public URL test.
// Inspect the actual built JSON-LD on three places instead.
for (const place of ['burnley', 'cardiff', 'rossendale']) {
  test(`${place} built ImageObjects carry the card licence`, async ({ page }) => {
    await page.goto(`/places/${place}/`);
    const images = await page.locator('script[type="application/ld+json"]').evaluateAll(nodes => {
      const found: Record<string, unknown>[] = [];
      function walk(value: unknown) {
        if (!value || typeof value !== 'object') return;
        if ((value as Record<string, unknown>)['@type'] === 'ImageObject') found.push(value as Record<string, unknown>);
        Object.values(value).forEach(walk);
      }
      nodes.forEach(n => walk(JSON.parse(n.textContent!)));
      return found;
    });
    expect(images).toHaveLength(2);
    for (const image of images) {
      expect(image.contentUrl).toMatch(new RegExp(`^https://ukdemographics.co.uk/media/places/${place}/population-\\d{4}-`));
      expect(image.license).toBe(CARD_LICENCE_URL);
      expect(image.acquireLicensePage).toBe(CARD_LICENCE_URL);
      expect(image.creditText).toBe('ukdemographics.co.uk');
      expect(image.creator).toEqual({ '@id': 'https://ukdemographics.co.uk/#organization' });
      expect(image.width).toBeGreaterThan(0);
      expect(image.height).toBeGreaterThan(0);
      expect(image.caption).toBeTruthy();
    }
    await page.goto('/terms/#cards');
    await expect(page.locator('#cards')).toHaveText(CARD_USAGE_TERMS);
  });
}
test('generic site images do not claim the map card licence', async ({ page }) => {
  await page.goto('/terms/');
  const json = await page.locator('script[type="application/ld+json"]').allTextContents();
  expect(json.join('')).not.toContain('acquireLicensePage');
});
