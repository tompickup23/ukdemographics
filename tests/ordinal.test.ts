import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

import { ordinal } from "../src/lib/ordinal";

describe("ordinal", () => {
  it("uses the right English suffix", () => {
    const cases: [number, string][] = [
      [0, "0th"], [1, "1st"], [2, "2nd"], [3, "3rd"], [4, "4th"],
      [11, "11th"], [12, "12th"], [13, "13th"], [21, "21st"], [22, "22nd"],
      [72, "72nd"], [91, "91st"], [100, "100th"], [101, "101st"], [111, "111th"]
    ];
    for (const [n, want] of cases) expect(ordinal(n)).toBe(want);
  });

  it("is used wherever a page prints a percentile", () => {
    const page = fs.readFileSync(path.resolve("src/pages/places/[slug].astro"), "utf8");
    expect(page).not.toMatch(/\}th percentile/);
  });
});
