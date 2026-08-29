import { expect, test } from "@playwright/test";
import { disableMotion, stabilizePage } from "./layout-helpers";

// Smoke test set covering the UK Demographics page surface.
// Each entry: a route, the heading text we expect to find, and an optional
// stable element id we expect to be rendered on the page.
const pages = [
  { name: "home", path: "/", h1Match: /what will your area look like/i },
  { name: "places", path: "/places/", h1Match: /compare every area/i },
  { name: "place-burnley", path: "/places/burnley/", h1Match: /Burnley/i },
  { name: "national", path: "/national/", h1Match: /National demographic/i },
  { name: "regional", path: "/regional/", h1Match: /Regional demographic/i },
  { name: "compare", path: "/compare/", h1Match: /put two places side by side/i },
  { name: "your-area", path: "/your-area/", h1Match: /start with the postcode/i },
  { name: "pressure", path: "/pressure/", h1Match: /Service demand pressure/i },
  { name: "schools", path: "/schools/", h1Match: /School/i },
  { name: "housing", path: "/housing/", h1Match: /Housing/i },
  { name: "findings", path: "/findings/", h1Match: /what the data has turned up/i },
  { name: "methodology", path: "/methodology/", h1Match: /Methodology/i },
  { name: "sources", path: "/sources/", h1Match: /Sources/i },
  { name: "constituencies", path: "/constituencies/", h1Match: /find your seat/i },
  { name: "constituency-burnley", path: "/constituencies/burnley/", h1Match: /Burnley/i },
] as const;

test.describe("mobile smoke", () => {
  for (const pageConfig of pages) {
    test(`${pageConfig.name} renders without horizontal overflow`, async ({ page }, testInfo) => {
      await stabilizePage(page);
      await page.goto(pageConfig.path, { waitUntil: "networkidle" });
      await disableMotion(page);

      const h1 = page.locator("h1").first();
      await expect(h1).toBeVisible();
      await expect(h1).toContainText(pageConfig.h1Match);

      // No horizontal scrollbar on mobile (allow a 2px sub-pixel tolerance).
      const overflowWidth = await page.evaluate(
        () => document.documentElement.scrollWidth - window.innerWidth
      );
      expect(overflowWidth).toBeLessThanOrEqual(2);

      const screenshot = await page.screenshot({ fullPage: false });
      await testInfo.attach(`${pageConfig.name}-mobile`, {
        body: screenshot,
        contentType: "image/png",
      });
    });
  }
});
