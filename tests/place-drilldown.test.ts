import { describe, expect, it } from "vitest";
import { getPublicPlaceAreas } from "../src/lib/site";
import { loadLocalRouteLatest } from "../src/lib/route-data";
import { getPlaceDrilldownMetrics } from "../src/lib/place-drilldown";

describe("place drill-down helpers", () => {
  it("builds metric views that always keep the current place visible", () => {
    const localRouteLatest = loadLocalRouteLatest();
    const publicPlaces = getPublicPlaceAreas();
    const currentArea = publicPlaces[publicPlaces.length - 1];
    const metrics = getPlaceDrilldownMetrics(localRouteLatest.areas, currentArea, 4);

    expect(metrics).toHaveLength(4);

    for (const metric of metrics) {
      expect(metric.views).toHaveLength(2);
      expect(metric.nationalRank).toBeGreaterThan(0);
      expect(metric.regionalRank).toBeGreaterThan(0);

      for (const view of metric.views) {
        expect(view.rows.some((row) => row.areaCode === currentArea.areaCode)).toBe(true);
        expect(view.rows.length).toBeLessThanOrEqual(4);
      }
    }
  });
});

