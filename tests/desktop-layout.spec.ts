import { expect, test } from "@playwright/test";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { disableMotion, stabilizePage, waitForFonts } from "./layout-helpers";

const pages = [
  { name: "home", path: "/", h1Match: /how is your area changing/i },
  { name: "places", path: "/places/", h1Match: /compare every area/i },
  { name: "place-burnley", path: "/places/burnley/", h1Match: /Burnley/i },
  { name: "national", path: "/national/", h1Match: /National demographic/i },
  { name: "regional", path: "/regional/", h1Match: /Regional demographic/i },
  { name: "compare", path: "/compare/", h1Match: /put two places side by side/i },
  { name: "your-area", path: "/your-area/", h1Match: /start with the postcode/i },
  { name: "pressure", path: "/pressure/", h1Match: /Demographic change and service exposure/i },
  { name: "schools", path: "/schools/", h1Match: /School/i },
  { name: "housing", path: "/housing/", h1Match: /Housing/i },
  { name: "findings", path: "/findings/", h1Match: /what the data has turned up/i },
  { name: "methodology", path: "/methodology/", h1Match: /Methodology/i },
  { name: "sources", path: "/sources/", h1Match: /Sources/i },
  { name: "constituencies", path: "/constituencies/", h1Match: /find your seat/i },
  { name: "constituency-burnley", path: "/constituencies/burnley/", h1Match: /Burnley/i },
] as const;

test.describe("desktop smoke", () => {
  for (const pageConfig of pages) {
    test(`${pageConfig.name} renders cleanly on desktop`, async ({ page }, testInfo) => {
      await stabilizePage(page, { blockFonts: false });

      await page.goto(pageConfig.path, { waitUntil: "networkidle" });
      await waitForFonts(page);
      await disableMotion(page);

      const h1 = page.locator("h1").first();
      await expect(h1).toBeVisible();
      await expect(h1).toContainText(pageConfig.h1Match);

      const screenshot = await page.screenshot({ fullPage: false });
      await testInfo.attach(`${pageConfig.name}-desktop`, {
        body: screenshot,
        contentType: "image/png",
      });
    });
  }
});

// Population first (decision R359, 4 November 2026), checked on the built pages. Every
// figure is read from the held file, never typed here.
const mye = JSON.parse(readFileSync(resolve("src/data/live/population-estimates.json"), "utf8"));
const answerFixtures = [
  { name: "Bristol", path: "/places/bristol-city-of/", code: "E06000023" },
  { name: "Burnley", path: "/places/burnley/", code: "E07000117" },
  // A district whose adult social care and SEND figures fall back to its county.
  { name: "Cambridge", path: "/places/cambridge/", code: "E07000008" },
] as const;

test.describe("population first", () => {
  test("homepage first chart heading names population", async ({ page }) => {
    await page.goto("/", { waitUntil: "domcontentloaded" });
    await expect(page.locator(".hero-section h2").first()).toContainText(/^Population/);
    await expect(page.locator(".impact-number").first()).toHaveText(
      mye.countries.K04000001.population.toLocaleString("en-GB")
    );
  });

  test("built homepage has no health demand string and declares a SearchAction", async ({ request }) => {
    const html = await (await request.get("/")).text();
    expect(html).not.toMatch(/health\s+demand/i);
    expect(html).toContain('"@type":"SearchAction"');
    expect(html).toContain("/?q={search_term_string}");
  });

  for (const f of answerFixtures) {
    test(`${f.name} answer box gives the mid-${mye.latestYear} estimate before any ethnicity line`, async ({ page }) => {
      await page.goto(f.path, { waitUntil: "domcontentloaded" });
      const text = (await page.locator(".place-answer").first().innerText()).replace(/\s+/g, " ");
      const figure = mye.areas[f.code].series[String(mye.latestYear)].toLocaleString("en-GB");
      const at = text.indexOf(figure);
      expect(at, `${figure} in "${text.slice(0, 200)}"`).toBeGreaterThanOrEqual(0);
      expect(text).toContain(`ONS mid-${mye.latestYear} population estimate, table MYE4, published`);
      const census = text.search(/residents at the 2021 Census/);
      const ethnic = text.search(/ethnic/i);
      expect(census).toBeGreaterThan(at);
      expect(ethnic).toBeGreaterThan(census);
      // Density (MYE5) and median age (MYE6) follow the Census count, and median age appears once.
      const density = text.search(/Density: /);
      expect(density).toBeGreaterThan(census);
      expect(text.indexOf("Median age: ")).toBeGreaterThan(density);
      expect(text.match(/median age/gi)?.length ?? 0).toBe(2);
    });
  }
});
