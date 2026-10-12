/**
 * Constituency rollups weight each constituent authority by the share of the
 * constituency's postcodes that fall in it, and by nothing else. Until 12 October
 * 2026 the weight was that share times the whole authority's population, which
 * pulled every split constituency towards its larger authority. These checks
 * recompute the rollup from the files rather than pinning a figure.
 */
import { describe, expect, it } from "vitest";
import rawPcon from "../src/data/live/pcon-dataset.json";
import { getPconDemographics } from "../src/lib/pcon-demographics";
import { getPublicPlaceAreas } from "../src/lib/site";

const pcons = Object.values((rawPcon as any).pcons) as any[];
const areaByCode = new Map(getPublicPlaceAreas().map((a: any) => [a.areaCode, a]));

describe("constituency rollup weights", () => {
  it("is the postcode-share average of the constituent authorities' 2021 White British shares", () => {
    let checked = 0;
    for (const p of pcons) {
      if (p.constituentLas.length < 2) continue;
      const parts = p.constituentLas
        .map((l: any) => ({ share: l.postcodeShare, wb: (areaByCode.get(l.ladCode) as any)?.wbiPct2021 }))
        .filter((x: any) => x.wb != null);
      if (parts.length !== p.constituentLas.length) continue;
      const w = parts.reduce((s: number, x: any) => s + x.share, 0);
      const expected = parts.reduce((s: number, x: any) => s + x.share * x.wb, 0) / w;
      const got = getPconDemographics(p)?.wbi2021;
      expect(got, p.name).toBeCloseTo(expected, 6);
      checked++;
    }
    expect(checked).toBeGreaterThan(100);
  });

});
