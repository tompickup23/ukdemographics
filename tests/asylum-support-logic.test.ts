import { describe, expect, it } from "vitest";
import {
  buildSupportedAsylumStockDescription,
  supportedAsylumReadingRules
} from "../src/lib/asylum-support-logic";

describe("asylum support logic helpers", () => {
  it("keeps stock-vs-flow interpretation explicit", () => {
    expect(supportedAsylumReadingRules).toHaveLength(4);
    expect(supportedAsylumReadingRules[0]?.body.toLowerCase()).toContain("end of the period");
    expect(supportedAsylumReadingRules[1]?.body.toLowerCase()).toContain("not identical");
    expect(supportedAsylumReadingRules[2]?.body.toLowerCase()).toContain("grants");
    expect(supportedAsylumReadingRules[3]?.body.toLowerCase()).toContain("different people");
  });

  it("describes supported asylum trends as stock rather than throughput", () => {
    const description = buildSupportedAsylumStockDescription("Dec 2025", true).toLowerCase();

    expect(description).toContain("quarter-end stock");
    expect(description).toContain("net change");
    expect(description).toContain("not the number of new claims");
    expect(description).toContain("illustrative bridge points");
  });
});
