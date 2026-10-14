import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";
import { disableMotion, stabilizePage } from "./layout-helpers";

// The place page map block (maps plan Stage 2, issues I3, I4 and I12). Runs in both the
// mobile and desktop projects through test:mobile and test:desktop.

const BURNLEY = "/places/burnley/";

test.describe("place map block", () => {
  test("tabs and the year slider work from the keyboard and update the accessible names", async ({ page }) => {
    await stabilizePage(page);
    await page.goto(BURNLEY, { waitUntil: "networkidle" });
    await disableMotion(page);
    const root = page.locator("[data-place-map]");
    await expect(root).toHaveClass(/pm-js/);
    const svg = root.locator("svg.ukd-map");
    const mapTitle = svg.locator("title[data-alt]");
    await expect(mapTitle).toHaveText(/^Map: Population change since 2011, mid-2025 estimate\./);

    const popTab = page.getByRole("tab", { name: "Population since 2011" });
    const ethTab = page.getByRole("tab", { name: "Ethnic groups" });
    await expect(popTab).toHaveAttribute("aria-selected", "true");
    await popTab.focus();
    await page.keyboard.press("ArrowRight");
    await expect(ethTab).toBeFocused();
    await expect(ethTab).toHaveAttribute("aria-selected", "true");
    await expect(page.locator("#pm-panel-e")).toBeVisible();
    await expect(page.locator("#pm-panel-p")).toBeHidden();
    await expect(svg).toHaveAttribute("data-m", "e");
    await expect(mapTitle).toHaveText(/^Map: White British share of residents, Census 2021\./);

    // The year control is a native range input with a spoken value.
    const range = page.locator("#pm-range-e");
    await range.focus();
    await page.keyboard.press("Home");
    await expect(range).toHaveAttribute("aria-valuetext", "Census 2011");
    await expect(mapTitle).toHaveText(/^Map: White British share of residents, Census 2011\..*Burnley 85\.5%/);
    await expect(svg.locator('title[data-tc="E07000117"]')).toHaveText("Burnley: 85.5%");
    await expect(svg.locator('g[data-measure="e"] text').filter({ hasText: /^2011$/ })).toHaveCount(1);

    // Back to population: its own year survives the switch.
    await ethTab.focus();
    await page.keyboard.press("ArrowLeft");
    await expect(popTab).toHaveAttribute("aria-selected", "true");
    await expect(mapTitle).toHaveText(/^Map: Population change since 2011, mid-2025 estimate\./);
    const popRange = page.locator("#pm-range-p");
    await popRange.focus();
    await page.keyboard.press("Home");
    await expect(popRange).toHaveAttribute("aria-valuetext", "mid-2011 estimate");
    await expect(svg.locator('title[data-tc="E07000117"]')).toHaveText("Burnley: 0.0%");

    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    expect(overflow).toBeLessThanOrEqual(2);
  });

  test("shows the latest year and both tables with no script", async ({ browser }) => {
    const context = await browser.newContext({ javaScriptEnabled: false });
    const page = await context.newPage();
    await page.goto(BURNLEY);
    const root = page.locator("[data-place-map]");
    await expect(root.locator(".pm-tabs")).toBeHidden();
    await expect(root.locator("#pm-panel-p table").first()).toBeVisible();
    await expect(root.locator("#pm-panel-e table").first()).toBeVisible();
    await expect(root.locator('svg.ukd-map g[data-measure="p"] text').filter({ hasText: /^2025$/ })).toHaveCount(1);
    await context.close();
  });

  for (const path of [BURNLEY, "/places/regions/north-west/"]) {
    test(`has no axe violations in the map block and none new on ${path}`, async ({ page }) => {
      const tags = ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"];
      for (const colorScheme of ["light", "dark"] as const) {
        await page.emulateMedia({ colorScheme });
        await page.goto(path, { waitUntil: "networkidle" });
        await disableMotion(page);
        // Outside the block: only rules already failing on main before Stage 2.
        const rest = await new AxeBuilder({ page }).withTags(tags).exclude("[data-place-map]").analyze();
        const ids = rest.violations.map((v) => `${v.id}: ${v.nodes.length}`);
        expect(ids.filter((id) => !KNOWN_ON_MAIN.has(id.split(":")[0])), `${colorScheme} ${JSON.stringify(ids)}`).toEqual([]);
        // The block itself: no exceptions, in both colour schemes.
        if (path === BURNLEY) {
          const block = await new AxeBuilder({ page }).include("[data-place-map]").withTags(tags).analyze();
          expect(block.violations.map((v) => `${colorScheme} ${v.id}: ${v.nodes.map((n) => n.target.join(" ")).join(", ")}`)).toEqual([]);
        }
      }
    });
  }
});

// Failing on main on 14 October 2026, measured on /places/burnley/ before Stage 2: the
// ethnicity timeline's segment labels and projection badges, the model card tag and the
// visa-route bars (12 nodes in light mode, 21 in dark). Maps plan v2.1, issue I17.
const KNOWN_ON_MAIN = new Set<string>(["color-contrast"]);
