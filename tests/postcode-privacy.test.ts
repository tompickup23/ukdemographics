import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

// A page that sends a postcode to an outside lookup service must not also
// say that nothing typed leaves the browser. /your-area/ said exactly that
// until 11 November 2026 while its script called api.postcodes.io.
function pages(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return pages(path);
    return /\.(astro|ts)$/.test(name) ? [path] : [];
  });
}

const all = pages("src/pages");
const callers = all.filter((path) => readFileSync(path, "utf8").includes("api.postcodes.io"));
const NOTHING_LEAVES = /nothing you type is sent|sent anywhere|never leaves your (browser|device)|not sent anywhere/i;

describe("postcode lookup privacy wording", () => {
  it("finds the pages that call the lookup service", () => {
    expect(callers.length).toBeGreaterThan(0);
  });

  it.each(callers)("%s does not claim that nothing typed is sent", (path) => {
    expect(readFileSync(path, "utf8")).not.toMatch(NOTHING_LEAVES);
  });

  it("names the lookup service on the privacy page", () => {
    const privacy = readFileSync("src/pages/privacy.astro", "utf8");
    expect(privacy).toContain("Postcodes.io");
    expect(privacy).toContain('id="postcode-lookup"');
  });
});
