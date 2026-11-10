import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";
import { disableMotion, stabilizePage } from "./layout-helpers";

// The age pyramid pages (docs/product/age-pyramid-spec-2026-11-09.md). Runs in both the
// mobile and desktop projects through test:mobile and test:desktop. No figure is typed
// here: each check reads what the page itself states and compares two views of it.

const BURNLEY = "/places/burnley/population-pyramid/";
const HUB = "/population-pyramids/";
const overflow = (page: import("@playwright/test").Page) =>
  page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);

test.describe("age pyramid", () => {
  test("the year slider, the measure and the outline redraw the chart and the figures", async ({ page }) => {
    await stabilizePage(page);
    await page.goto(BURNLEY, { waitUntil: "networkidle" });
    await disableMotion(page);
    const root = page.locator("[data-age-pyramid]");
    await expect(root).toHaveClass(/ap-js/);
    const svg = root.locator("svg.ap-svg");
    const year = root.locator("#ap-year");
    const latest = await year.getAttribute("max");
    const first = await year.getAttribute("min");
    await expect(year).toHaveAttribute("aria-valuetext", `Mid-${latest}, ONS estimate`);
    await expect(svg.locator("title")).toHaveText(new RegExp(`mid-${latest} against mid-${first}$`));

    const population = root.locator('[data-ap="r-pop"]');
    const latestPopulation = await population.textContent();
    const youngest = svg.locator('[data-ap-bar="M"][data-age="0"]');
    const latestWidth = await youngest.getAttribute("width");
    const ticks = () => svg.locator(".ap-tick").allTextContents();
    const peopleTicks = await ticks();

    // First year, from the keyboard: the figures, the bars, the table and the spoken value all move.
    await year.focus();
    await page.keyboard.press("Home");
    await expect(year).toHaveAttribute("aria-valuetext", `Mid-${first}, ONS estimate`);
    await expect(root.locator('[data-ap="r-heading"]')).toHaveText(`Mid-${first} in figures`);
    await expect(population).not.toHaveText(latestPopulation!);
    expect(await youngest.getAttribute("width")).not.toBe(latestWidth);
    await expect(root.locator('[data-ap="t-year"]')).toHaveText(`mid-${first}`);
    // Bars and outline now show the same year, so the outline is dropped, and the scale has not moved.
    await expect(svg.locator('[data-ap="outline-M"]')).toHaveAttribute("d", "");
    expect(await ticks()).toEqual(peopleTicks);
    // The figures in the picture and beside it agree.
    await expect(svg.locator('[data-ap="sub-now"]')).toHaveText(`Bars: mid-${first}, ${await population.textContent()} residents`);

    // Share of population: a percentage axis, and England and Wales becomes available.
    await expect(root.locator('[data-ap="ew-wrap"]')).toBeHidden();
    await root.getByLabel("Share of population").check();
    expect((await ticks()).every((t) => t.endsWith("%"))).toBe(true);
    await root.locator('[data-ap="ew"]').check();
    await expect(svg.locator('[data-ap="ew-M"]')).not.toHaveAttribute("d", "");
    await expect(svg.locator('[data-ap="sub-ew"]')).toHaveText(new RegExp(`^Dashed: England and Wales, mid-${first}`));

    // Reading one age gives both sexes for the chosen year.
    await root.locator("#ap-age").focus();
    await page.keyboard.press("End");
    await expect(root.locator('[data-ap="age-out"]')).toHaveText(new RegExp(`^Aged 90 and over at mid-${first}: [\\d,]+ males, [\\d,]+ females`));

    expect(await overflow(page)).toBeLessThanOrEqual(2);
  });

  test("play steps to the latest year and stops", async ({ page }) => {
    await stabilizePage(page);
    await page.goto(BURNLEY, { waitUntil: "networkidle" });
    await disableMotion(page);
    const root = page.locator("[data-age-pyramid]");
    const year = root.locator("#ap-year");
    const latest = Number(await year.getAttribute("max"));
    await year.fill(String(latest - 2));
    await expect(year).toHaveAttribute("aria-valuetext", `Mid-${latest - 2}, ONS estimate`);
    const play = root.getByRole("button", { name: "Play" });
    await play.click();
    await expect(root.getByRole("button", { name: "Pause" })).toHaveAttribute("aria-pressed", "true");
    await expect(year).toHaveAttribute("aria-valuetext", `Mid-${latest}, ONS estimate`, { timeout: 8000 });
    await expect(root.getByRole("button", { name: "Play" })).toHaveAttribute("aria-pressed", "false");
  });

  test("shows the latest year, the outline, the figures and the table with no script", async ({ browser, baseURL }) => {
    const context = await browser.newContext({ javaScriptEnabled: false, baseURL });
    const page = await context.newPage();
    await page.goto(BURNLEY);
    const root = page.locator("[data-age-pyramid]");
    await expect(root.locator(".ap-controls")).toBeHidden();
    await expect(root.locator(".ap-reader")).toBeHidden();
    await expect(root.locator("svg.ap-svg [data-ap-bar]")).toHaveCount(182);
    await expect(root.locator('svg.ap-svg [data-ap="outline-M"]')).not.toHaveAttribute("d", "");
    await expect(root.locator('[data-ap="r-pop"]')).toHaveText(/^[\d,]+$/);
    await root.locator(".ap-details summary").click();
    await expect(root.locator(".ap-table tbody tr")).toHaveCount(91);
    await expect(page.locator("[data-pyramid-answer]")).toContainText(await root.locator('[data-ap="r-pop"]').innerText());
    await context.close();
  });

  for (const path of [BURNLEY, "/places/cardiff/population-pyramid/", HUB]) {
    test(`has no axe violations and no sideways scroll on ${path}`, async ({ page }) => {
      await stabilizePage(page);
      await page.goto(path, { waitUntil: "networkidle" });
      await disableMotion(page);
      await expect(page.locator("[data-age-pyramid]").first()).toHaveClass(/ap-js/);
      const result = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"]).analyze();
      expect(result.violations.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(" ")).join("; ")}`)).toEqual([]);
      expect(await overflow(page)).toBeLessThanOrEqual(2);
    });
  }

  test("the hub finds a council and lists every one", async ({ page }) => {
    await stabilizePage(page);
    await page.goto(HUB, { waitUntil: "networkidle" });
    const links = page.locator(".pyramid-list a");
    expect(await links.count()).toBe(await page.locator("#pyramid-councils option").count());
    await page.getByLabel("Find a council").fill("Burnley");
    await page.getByRole("button", { name: "Open its pyramid" }).click();
    await expect(page).toHaveURL(/\/places\/burnley\/population-pyramid\/$/);
  });

  test("the download holds every year, sex and age the page draws", async ({ page, request }) => {
    await page.goto(BURNLEY);
    const years = await page.locator("#ap-compare option").count() - 1;
    const csv = await (await request.get("/data/pyramids/burnley.csv")).text();
    const rows = csv.trim().split("\n");
    expect(rows[0]).toBe("area_code,area_name,year,sex,age,population,source_id");
    expect(rows.length - 1).toBe(years * 2 * 91);
  });
});
