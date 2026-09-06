import fs from "node:fs";

import { describe, expect, it } from "vitest";

import { getAidogeLink } from "../src/lib/site";
import { canonicalAreaCode } from "../src/lib/area-codes";
import rawProjections from "../src/data/live/ethnic-projections.json";

const projections = rawProjections as { areas: Record<string, { areaName?: string }> };

describe("AI DOGE sister-site link", () => {
  it("resolves a place with a known ONS code and aidoge page", () => {
    // Burnley: E07000117, present in both registries with a published
    // spending total.
    const link = getAidogeLink("E07000117");
    expect(link).not.toBeNull();
    expect(link!.url).toBe("https://aidoge.co.uk/councils/burnley/");
  });

  it("resolves Barnsley and Sheffield across the 2025 boundary-change code split", () => {
    // area-code-aliases.json documents the reissue: this site's own area
    // records may be looked up under either the pre- or post-2025 code,
    // and canonicalAreaCode() normalises before the aidoge join, so both
    // forms reach the same page.
    expect(getAidogeLink("E08000038")?.url).toBe("https://aidoge.co.uk/councils/barnsley/");
    expect(getAidogeLink("E08000016")?.url).toBe("https://aidoge.co.uk/councils/barnsley/");
    expect(getAidogeLink("E08000039")?.url).toBe("https://aidoge.co.uk/councils/sheffield/");
  });

  it("returns null for a place absent from the aidoge crosswalk (Wales, Scotland, or not yet mapped)", () => {
    // Newport, W06000022, is a real UKD area code with no aidoge page
    // (England/Scotland coverage only as of Sep 2026).
    expect(getAidogeLink("W06000022")).toBeNull();
  });

  it("never joins on name, only on the ONS/GSS code", () => {
    const councilMap = JSON.parse(
      fs.readFileSync("src/data/live/aidoge-council-map.json", "utf8")
    ).councils;
    for (const code of Object.keys(councilMap)) {
      expect(code).toMatch(/^[EWS]\d{8}$/);
    }
  });

  it("covers the large majority of this site's 318 published places", () => {
    const areaCodes = Object.keys(projections.areas);
    const linked = areaCodes.filter((code) => getAidogeLink(canonicalAreaCode(code)) !== null);
    // 296 of 318 as of the Sep 2026 aidoge crosswalk snapshot; assert a
    // floor rather than the exact number so a future crosswalk refresh
    // that only adds coverage doesn't fail this test.
    expect(linked.length).toBeGreaterThanOrEqual(290);
    expect(linked.length).toBeLessThanOrEqual(areaCodes.length);
  });
});
