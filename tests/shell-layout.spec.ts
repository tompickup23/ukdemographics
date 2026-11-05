import { expect, test, type Page } from "@playwright/test";
import { disableMotion } from "./layout-helpers";

// The site shell: the header, the layouts, font loading, the search index and the
// charts' accessible names. Audits of 2 and 3 November 2026 (register T04, T48).

const BRISTOL = "/places/bristol-city-of/";

async function headerHeight(page: Page): Promise<number> {
  return page.locator(".site-header-bar").evaluate((el) => el.getBoundingClientRect().height);
}

test.describe("site shell", () => {
  test("every svg on the Bristol page has an accessible name or is hidden", async ({ page }) => {
    await page.goto(BRISTOL, { waitUntil: "networkidle" });
    // Swept in the live document, so charts drawn by a script are included.
    const unnamed = await page.evaluate(() => {
      const named = (svg: SVGSVGElement): boolean => {
        if (svg.getAttribute("aria-hidden") === "true") return true;
        const first = svg.firstElementChild;
        if (first && first.tagName.toLowerCase() === "title" && (first.textContent ?? "").trim()) return true;
        if (svg.getAttribute("role") !== "img") return false;
        if ((svg.getAttribute("aria-label") ?? "").trim()) return true;
        const ids = (svg.getAttribute("aria-labelledby") ?? "").split(/\s+/).filter(Boolean);
        return ids.length > 0 && ids.every((id) => (document.getElementById(id)?.textContent ?? "").trim());
      };
      const all = Array.from(document.querySelectorAll("svg")).filter((svg) => !svg.parentElement?.closest("svg"));
      return {
        total: all.length,
        bad: all.filter((svg) => !named(svg)).map((svg) => svg.outerHTML.slice(0, 160))
      };
    });
    expect(unnamed.total).toBeGreaterThan(10);
    expect(unnamed.bad).toEqual([]);
  });

  for (const path of ["/", "/your-area/", BRISTOL]) {
    test(`search index is requested once on ${path}`, async ({ page }) => {
      let requests = 0;
      page.on("request", (request) => {
        if (new URL(request.url()).pathname === "/search-index.json") requests += 1;
      });
      await page.goto(path, { waitUntil: "networkidle" });
      // The site search prefetches on idle; opening it must reuse the same request.
      await page.waitForTimeout(1800);
      await page.locator("[data-site-search-open]").click();
      await expect(page.locator("[data-site-search-results] a").first()).toBeVisible();
      await page.waitForLoadState("networkidle");
      expect(requests).toBe(1);
    });
  }

  test("header height does not depend on the web fonts", async ({ browser }, testInfo) => {
    const options = testInfo.project.use;
    const withFonts = await browser.newPage({ ...options });
    await withFonts.goto(BRISTOL, { waitUntil: "networkidle" });
    await withFonts.evaluate(() => document.fonts.ready);
    const loaded = await headerHeight(withFonts);
    await withFonts.close();

    const fallback = await browser.newPage({ ...options });
    // Both formats: Fontsource lists a .woff source after the .woff2.
    await fallback.route(/\.woff2?$/, (route) => route.abort());
    await fallback.goto(BRISTOL, { waitUntil: "networkidle" });
    const unloaded = await headerHeight(fallback);
    await fallback.close();

    expect(Math.abs(loaded - unloaded)).toBeLessThanOrEqual(0.5);
  });

  test("the maps layout carries the same analytics beacon as the base layout", async ({ request }) => {
    const token = (html: string) => html.match(/data-cf-beacon="([^"]+)"/)?.[1] ?? null;
    const base = await (await request.get("/")).text();
    const maps = await (await request.get("/maps/")).text();
    expect(base).toContain("https://static.cloudflareinsights.com/beacon.min.js");
    expect(maps).toContain("https://static.cloudflareinsights.com/beacon.min.js");
    expect(token(maps)).not.toBeNull();
    expect(token(maps)).toBe(token(base));
  });

  test("the two main faces are preloaded and no latin-ext face is requested", async ({ page }) => {
    const fonts: string[] = [];
    page.on("request", (request) => {
      if (request.url().endsWith(".woff2")) fonts.push(new URL(request.url()).pathname);
    });
    await page.goto(BRISTOL, { waitUntil: "networkidle" });
    const preloads = await page.locator('link[rel="preload"][as="font"]').evaluateAll((links) =>
      links.map((link) => link.getAttribute("href") ?? "")
    );
    expect(preloads).toHaveLength(2);
    expect(preloads.some((href) => href.includes("source-sans-3-latin-400"))).toBe(true);
    expect(preloads.some((href) => href.includes("source-serif-4-latin-600"))).toBe(true);
    expect(fonts.length).toBeGreaterThan(0);
    expect(fonts.filter((href) => href.includes("latin-ext"))).toEqual([]);
  });
});

test.describe("phone header and section picker", () => {
  test.beforeEach(({}, testInfo) => {
    test.skip(testInfo.project.name !== "mobile-chromium", "phone layout only");
  });

  test("the header is two rows at 375px with the search box and the menu", async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 812 });
    await page.goto(BRISTOL, { waitUntil: "networkidle" });
    const box = async (selector: string) => {
      const b = await page.locator(selector).first().boundingBox();
      if (!b) throw new Error(`${selector} is not visible`);
      return b;
    };
    const brand = await box(".site-header .brand");
    const menu = await box("[data-mobile-menu-toggle]");
    const search = await box("[data-site-search-open]");
    // Row one: the brand and the menu button side by side.
    expect(Math.abs(menu.y + menu.height / 2 - (brand.y + brand.height / 2))).toBeLessThanOrEqual(2);
    expect(menu.x).toBeGreaterThan(brand.x + brand.width - 1);
    // Row two: the search box below them, across the width.
    expect(search.y).toBeGreaterThanOrEqual(brand.y + brand.height);
    expect(search.width).toBeGreaterThan(300);
    expect(await headerHeight(page)).toBeLessThanOrEqual(120);
    expect(await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)).toBeLessThanOrEqual(2);
  });

  test("the place page section picker sticks, opens, and closes on a jump", async ({ page }) => {
    await page.goto(BRISTOL, { waitUntil: "networkidle" });
    await disableMotion(page);
    const rail = page.locator(".place-rail");
    const toggle = rail.locator(".section-picker-toggle");
    const links = rail.locator(".place-rail-link");

    await expect(toggle).toHaveAttribute("aria-expanded", "false");
    await expect(links.first()).toBeHidden();

    // Scrolled into the sections, the bar sits directly under the site header.
    await page.locator("#ethnic-composition").scrollIntoViewIfNeeded();
    await page.mouse.wheel(0, 600);
    await page.waitForTimeout(300);
    const top = await rail.evaluate((el) => el.getBoundingClientRect().top);
    expect(Math.abs(top - (await headerHeight(page)))).toBeLessThanOrEqual(1);
    await expect(rail.locator(".section-picker-current")).not.toHaveText("");

    await toggle.click();
    await expect(toggle).toHaveAttribute("aria-expanded", "true");
    const target = links.nth(2);
    await expect(target).toBeVisible();
    const id = await target.getAttribute("data-target");
    await target.click();
    await expect(toggle).toHaveAttribute("aria-expanded", "false");
    await expect(page).toHaveURL(new RegExp(`#${id}$`));

    // The section heading lands below the header and the bar, not under them.
    const sectionTop = await page.locator(`#${id}`).evaluate((el) => el.getBoundingClientRect().top);
    const barBottom = await rail.evaluate((el) => el.getBoundingClientRect().bottom);
    expect(sectionTop).toBeGreaterThanOrEqual(barBottom - 1);
    expect(await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)).toBeLessThanOrEqual(2);
  });
});
