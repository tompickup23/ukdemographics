import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";
import { disableMotion, stabilizePage } from "./layout-helpers";

// Axe on every page type, on the light and the dark page. Until
// 11 November 2026 axe ran on the age pyramid and map blocks only, and party names
// printed in party colours (1.14:1 for one of them) went unseen on 631 pages.
const TAGS = ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"];

const paths = [
  "/",
  "/places/",
  "/places/burnley/",
  "/places/counties/",
  "/places/counties/lancashire/",
  "/places/regions/north-west/",
  "/places/burnley/population-pyramid/",
  "/population-pyramids/",
  "/places/burnley/population-change/",
  "/population-change/",
  "/maps/",
  "/national/",
  "/regional/",
  "/compare/",
  "/your-area/",
  "/pressure/",
  "/schools/",
  "/housing/",
  "/migration/",
  "/findings/",
  "/methodology/",
  "/data/",
  "/releases/",
  "/glossary/",
  "/sources/",
  "/about/",
  "/privacy/",
  "/terms/",
  "/accessibility/",
  "/constituencies/",
  // One seat for each party that won one, so every party colour is drawn as a bar.
  "/constituencies/burnley/",
  "/constituencies/aberdeen-north/",
  "/constituencies/aldridge-brownhills/",
  "/constituencies/ashfield/",
  "/constituencies/bath/",
  "/constituencies/brighton-pavilion/",
  "/constituencies/caerfyrddin/",
  "/constituencies/birmingham-hall-green-and-moseley/",
] as const;

// Tracing records the page around every action, and axe reads the whole page: with the
// project's retain-on-failure trace on, each check here took about 17 seconds locally,
// against about 3 with it off.
test.use({ trace: "off" });

// What runs where, to keep this to a few minutes of a run that took 11 before it:
// - phone: every path, light page then dark page, from one load;
// - desktop: the dark page only, without the extra party seats. Colours come from the
//   same tokens at both widths, so the desktop run is there for what only a wide page
//   draws (the sort bar on /places/, for one), on the theme with the tighter ratios.
//   Party colours are held for every party by tests/fill-ink.test.ts.
const EXTRA_SEATS = new Set<string>(paths.filter((p) => p.startsWith("/constituencies/") && p !== "/constituencies/" && p !== "/constituencies/burnley/"));

for (const path of paths) {
  test(`${path} has no axe violations`, async ({ page }, testInfo) => {
    const desktop = testInfo.project.name.startsWith("desktop");
    test.skip(desktop && EXTRA_SEATS.has(path), "party seats are checked on the phone project");
    const schemes = desktop ? (["dark"] as const) : (["light", "dark"] as const);

    await page.emulateMedia({ colorScheme: schemes[0] });
    await stabilizePage(page);
    await page.goto(path, { waitUntil: "networkidle" });
    await disableMotion(page);

    const found: string[] = [];
    for (const scheme of schemes) {
      await page.emulateMedia({ colorScheme: scheme });
      expect(await page.evaluate((s) => matchMedia(`(prefers-color-scheme: ${s})`).matches, scheme)).toBe(true);
      const result = await new AxeBuilder({ page }).withTags(TAGS).analyze();
      for (const v of result.violations) {
        found.push(`${scheme}: ${v.id} (${v.impact}) x${v.nodes.length}: ${v.nodes.slice(0, 3).map((n) => n.target.join(" ")).join(" | ")}`);
      }
    }
    expect(found).toEqual([]);
  });
}
