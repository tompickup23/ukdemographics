import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { fnv1a32, listingArmForSlug, LISTING_ARMS } from "../src/lib/listing-arm";

// The assignment list as the October 2026 test ran it. The test is retired
// (docs/seo/README.md, "Result"), so the list is a historical record: it is
// checked against the hash rule row by row, and never regenerated from the
// current set of places.
const ARMS_CSV = path.resolve("docs/seo/listing-arms-2026-10.csv");

function armRows(): string[][] {
  const [, ...rows] = fs.readFileSync(ARMS_CSV, "utf8").trim().split("\n");
  return rows.map((line) => {
    const slug = line.split(",")[0];
    const tail = line.split(",").slice(-3);
    return [slug, ...tail];
  });
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

  it("every row of the committed assignment list follows the hash rule", () => {
    const rows = armRows();
    expect(rows.length).toBe(318);
    for (const [slug, hex, mod3, arm] of rows) {
      const hash = fnv1a32(slug);
      expect(hex, slug).toBe(`0x${hash.toString(16).padStart(8, "0")}`);
      expect(Number(mod3), slug).toBe(hash % 3);
      expect(arm, slug).toBe(listingArmForSlug(slug));
    }
  });

  it("put a workable share of places in every arm", () => {
    const rows = armRows();
    for (const arm of LISTING_ARMS) {
      const share = rows.filter((r) => r[3] === arm).length / rows.length;
      expect(share).toBeGreaterThan(0.25);
      expect(share).toBeLessThan(0.42);
    }
  });
});
