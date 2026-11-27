import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

import {
  COUNTY_COUNT,
  PCON_COUNT,
  PCON_UNIVERSE,
  PLACE_COUNT,
  formatPconCount,
  formatPlaceCount
} from "../src/lib/coverage";
import { getPublicPlaceAreas } from "../src/lib/site";
import { getAllPcons } from "../src/lib/pcon-data";

const SRC_ROOT = path.resolve("src");
const PUBLIC_ROOT = path.resolve("public");

/**
 * Static assets cannot import this module, so their counts are literals. They
 * are swept anyway and pinned to PLACE_COUNT below, because the default OG card
 * and the web manifest are the two surfaces a share or an install shows first,
 * and both were still on 320 after every page had been fixed.
 */
const LITERAL_COUNT_FILES = [
  path.join(PUBLIC_ROOT, "og-card.svg"),
  path.join(PUBLIC_ROOT, "site.webmanifest")
];

/**
 * Directories and files that are allowed to carry a stale count.
 *
 * src/data holds generated datasets, and src/lib/releases.ts is verbatim
 * version history (the entries shown on /releases/ and in /feed.xml): a release
 * note records what was published at the time, so editing it would break
 * traceability rather than fix an error.
 */
const EXCLUDED = [path.join(SRC_ROOT, "data"), path.join(SRC_ROOT, "lib", "releases.ts")];

/**
 * The four numbers that were published as coverage and were not. 320 is the
 * pre-deduplication local authority count (Barnsley and Sheffield each sat
 * under two ONS codes until 29 August 2026); 650 is the size of the Commons,
 * which is the universe rather than the coverage. Either one written next to a
 * coverage noun is a hard-coded claim that no longer tracks the data.
 */
const STALE_COUNT = /\b(320|650) (local authorities|councils|areas|parliamentary seats|seats)\b/;

function walk(dir: string): string[] {
  const out: string[] = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (EXCLUDED.some((excluded) => full === excluded || full.startsWith(`${excluded}${path.sep}`))) {
      continue;
    }
    if (entry.isDirectory()) out.push(...walk(full));
    else out.push(full);
  }
  return out;
}

function findStaleCounts(): string[] {
  const hits: string[] = [];
  for (const file of [...walk(SRC_ROOT), ...walk(PUBLIC_ROOT)]) {
    let contents: string;
    try {
      contents = fs.readFileSync(file, "utf8");
    } catch {
      continue; // binary or unreadable asset
    }
    contents.split("\n").forEach((line, index) => {
      if (STALE_COUNT.test(line)) {
        hits.push(`${path.relative(process.cwd(), file)}:${index + 1}: ${line.trim()}`);
      }
    });
  }
  return hits;
}

describe("coverage counts", () => {
  it("covers the 21 county council areas", () => { expect(COUNTY_COUNT).toBe(21); });
  it("derives the local authority count from the projections dataset", () => {
    expect(PLACE_COUNT).toBe(318);
    expect(PLACE_COUNT).toBe(getPublicPlaceAreas().length);
  });

  it("derives the constituency count from the PCON dataset", () => {
    // 631 until 27 November 2026: Ynys Môn was missing (build-pcon-dataset.mjs slug rule).
    expect(PCON_COUNT).toBe(632);
    expect(PCON_COUNT).toBe(getAllPcons().length);
  });

  it("has a page for every seat in Great Britain, and leaves out only Northern Ireland", () => {
    // DWP's list (pip-pcon.json) names every seat in England, Wales and Scotland.
    // A seat on that list with no page was dropped by the join, as Ynys Môn was.
    const read = (p: string) => JSON.parse(fs.readFileSync(path.resolve(p), "utf8"));
    const listed = Object.keys(read("src/data/live/pip-pcon.json").byPconCode).filter((c) => /^(E14|W07|S14)\d{6}$/.test(c));
    const dataset = read("src/data/live/pcon-dataset.json");
    expect(listed.filter((c) => !dataset.pcons[c])).toEqual([]);
    expect(listed).toHaveLength(PCON_COUNT);
    expect(dataset.unmatchedSlugs).toHaveLength(PCON_UNIVERSE - PCON_COUNT);
    expect(getAllPcons().find((p) => p.code === "W07000112")?.slug).toBe("ynys-mon");
  });

  it("keeps the Commons at 650 seats and the coverage below it", () => {
    expect(PCON_UNIVERSE).toBe(650);
    expect(PCON_COUNT).toBeLessThan(PCON_UNIVERSE);
  });

  it("formats both counts for copy", () => {
    expect(formatPlaceCount()).toBe("318 local authorities");
    expect(formatPlaceCount("councils")).toBe("318 councils");
    expect(formatPconCount()).toBe("632 of 650 seats");
    expect(formatPconCount("UK seats")).toBe("632 of 650 UK seats");
  });

  it("has no hard-coded coverage counts left in src or public", () => {
    expect(findStaleCounts()).toEqual([]);
  });

  it("keeps the static share and install surfaces on the current count", () => {
    for (const file of LITERAL_COUNT_FILES) {
      expect(fs.readFileSync(file, "utf8")).toContain(formatPlaceCount());
    }
  });

  it("would catch a hard-coded coverage count if one came back", () => {
    // A sweep that finds nothing and a sweep that can find nothing look the
    // same. Fire the regex on a known positive so the empty result above means
    // something.
    expect(STALE_COUNT.test('desc: "320 local authorities"')).toBe(true);
    expect(STALE_COUNT.test('<span>650 parliamentary seats</span>')).toBe(true);
    expect(STALE_COUNT.test("Any two of 320 councils")).toBe(true);
    expect(STALE_COUNT.test("51 of 320 areas lose part of their horizon")).toBe(true);
    // And does not fire on the history it is not policing.
    expect(STALE_COUNT.test("/places listed 320 rows for 318 authorities")).toBe(false);
    expect(STALE_COUNT.test("max-height: 320px;")).toBe(false);
  });
});
