import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";
import { disableMotion, stabilizePage } from "./layout-helpers";

// The population change pages (register row R628;
// docs/product/population-change-spec-2026-11-11.md). Runs in both the mobile and
// desktop projects through test:mobile and test:desktop. No figure is typed here:
// each check reads what the page itself states and compares two views of it.

const BURNLEY = "/places/burnley/population-change/";
const HUB = "/population-change/";
const overflow = (page: import("@playwright/test").Page) =>
  page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);

test.describe("population change", () => {
  test("shows both charts, the sentences and every table with no script", async ({ browser, baseURL }) => {
    const context = await browser.newContext({ javaScriptEnabled: false, baseURL });
    const page = await context.newPage();
    await page.goto(BURNLEY);
    const charts = page.locator(".pop-change svg.pc-svg");
    await expect(charts).toHaveCount(2);
    await expect(charts.nth(0).locator("rect.pc-part")).not.toHaveCount(0);
    const answer = (await page.locator("[data-change-answer]").innerText()).trim();
    // The first sentence's end population is the figure the ledger prints last.
    const end = /to ([\d,]+)\./.exec(answer)![1];
    await expect(charts.nth(0).locator("text.pc-value").last()).toHaveText(end);
    for (const summary of await page.locator(".pc-details summary").all()) await summary.click();
    const tables = page.locator(".pc-table");
    await expect(tables).toHaveCount(3);
    const years = await tables.nth(1).locator("tbody tr").count();
    expect(years).toBeGreaterThan(10);
    await expect(tables.nth(2).locator("tbody tr")).toHaveCount(years);
    await expect(tables.nth(1).locator("tbody tr").last().locator("td").last()).toHaveText(end);
    await context.close();
  });

  for (const path of [BURNLEY, "/places/cardiff/population-change/", "/places/isles-of-scilly/population-change/", HUB]) {
    for (const scheme of ["light", "dark"] as const) {
      test(`has no axe violations and no sideways scroll on ${path} (${scheme})`, async ({ page }) => {
        await stabilizePage(page);
        await page.emulateMedia({ colorScheme: scheme });
        await page.goto(path, { waitUntil: "networkidle" });
        await disableMotion(page);
        for (const summary of await page.locator(".pc-details summary").all()) await summary.click();
        const result = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"]).analyze();
        expect(result.violations.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(" ")).join("; ")}`)).toEqual([]);
        expect(await overflow(page)).toBeLessThanOrEqual(2);
      });
    }
  }

  test("the hub finds a council and lists every one", async ({ page }) => {
    await stabilizePage(page);
    await page.goto(HUB, { waitUntil: "networkidle" });
    const links = page.locator(".change-list a");
    expect(await links.count()).toBe(await page.locator("#change-councils option").count());
    await page.getByLabel("Find a council").fill("Burnley");
    await page.getByRole("button", { name: "Open its page" }).click();
    await expect(page).toHaveURL(/\/places\/burnley\/population-change\/$/);
  });

  test("the download holds every year the page tables", async ({ page, request }) => {
    await page.goto(BURNLEY);
    const years = await page.locator(".pc-table").nth(1).locator("tbody tr").count();
    const csv = await (await request.get("/data/population-change/burnley.csv")).text();
    const rows = csv.trim().split("\n");
    expect(rows[0]).toBe("area_code,area_name,from_mid_year,to_mid_year,population_start,births,deaths,internal_in,internal_out,international_in,international_out,other,population_end,source_id");
    expect(rows.length - 1).toBe(years);
  });
});
