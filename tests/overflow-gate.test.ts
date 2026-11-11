import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

// A phone browser widens window.innerWidth to fit content that runs past the screen,
// so scrollWidth minus innerWidth reads 0 on a page that overflows. On 11 November 2026
// /housing/ was 442 px wide and /migration/ 591 px wide on a 390 px phone and that
// expression passed both. clientWidth stays at the screen width, so the layout specs
// measure against it.
const testsDir = join(process.cwd(), "tests");
const specs = readdirSync(testsDir).filter((name) => name.endsWith(".spec.ts"));

describe("horizontal overflow gate", () => {
  it("finds the layout specs", () => {
    expect(specs.length).toBeGreaterThan(0);
  });

  for (const name of specs) {
    it(`${name} never measures overflow against innerWidth`, () => {
      const source = readFileSync(join(testsDir, name), "utf8");
      expect(source).not.toMatch(/scrollWidth\s*-\s*(?:window\.)?innerWidth/);
    });
  }

  it("the phone smoke test measures against clientWidth and covers /housing/ and /migration/", () => {
    const source = readFileSync(join(testsDir, "mobile-layout.spec.ts"), "utf8");
    expect(source).toMatch(/scrollWidth\s*-\s*document\.documentElement\.clientWidth/);
    expect(source).toContain('path: "/housing/"');
    expect(source).toContain('path: "/migration/"');
  });
});
