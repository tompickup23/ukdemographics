import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { fnv1a32, listingArmForSlug, LISTING_ARMS } from "../src/lib/listing-arm";
import { getPublicPlaceAreas, slugifyAreaName } from "../src/lib/site";

// The committed assignment list, so the arms can be joined to a Search Console
// export without running this code. Regenerate after a dataset change with
// UPDATE_LISTING_ARMS=1 npx vitest run tests/listing-arm.test.ts
const ARMS_CSV = path.resolve("docs/seo/listing-arms-2026-10.csv");

function expectedCsv(): string {
  const rows = getPublicPlaceAreas()
    .map((a) => {
      const slug = slugifyAreaName(a.areaName);
      return { slug, a, hash: fnv1a32(slug) };
    })
    .sort((x, y) => x.slug.localeCompare(y.slug))
    .map(({ slug, a, hash }) => {
      const name = a.areaName.includes(",") ? `"${a.areaName}"` : a.areaName;
      return [slug, a.areaCode, name, a.regionName, `0x${hash.toString(16).padStart(8, "0")}`, hash % 3, listingArmForSlug(slug)].join(",");
    });
  return ["slug,area_code,area_name,region,fnv1a32,mod3,arm", ...rows].join("\n") + "\n";
}

describe("listing test arm assignment", () => {
  it("implements 32-bit FNV-1a", () => {
    // Published FNV-1a test vectors.
    expect(fnv1a32("")).toBe(0x811c9dc5);
    expect(fnv1a32("a")).toBe(0xe40c292c);
    expect(fnv1a32("foobar")).toBe(0xbf9cf968);
  });

  it("matches the worked example in listing-arm.ts", () => {
    expect(fnv1a32("birmingham")).toBe(0xd4ab7d67);
    expect(listingArmForSlug("birmingham")).toBe("B");
  });

  it("matches the committed assignment list", () => {
    const expected = expectedCsv();
    if (process.env.UPDATE_LISTING_ARMS === "1") fs.writeFileSync(ARMS_CSV, expected);
    expect(fs.readFileSync(ARMS_CSV, "utf8")).toBe(expected);
  });

  it("puts a workable share of places in every arm", () => {
    const counts = new Map(LISTING_ARMS.map((a) => [a, 0]));
    const areas = getPublicPlaceAreas();
    for (const a of areas) {
      const arm = listingArmForSlug(slugifyAreaName(a.areaName));
      counts.set(arm, (counts.get(arm) ?? 0) + 1);
    }
    for (const arm of LISTING_ARMS) {
      expect(counts.get(arm)! / areas.length).toBeGreaterThan(0.25);
      expect(counts.get(arm)! / areas.length).toBeLessThan(0.42);
    }
  });
});
