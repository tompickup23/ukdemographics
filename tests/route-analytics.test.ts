import { describe, expect, it } from "vitest";
import type { LocalRouteAreaSummary, RouteSeriesPoint } from "../src/lib/route-data";
import {
  formatOrdinal,
  getDistributionStats,
  getPercentileRank,
  getRegionPressureSummaries,
  getSeriesDelta
} from "../src/lib/route-analytics";

function makeArea(overrides: Partial<LocalRouteAreaSummary>): LocalRouteAreaSummary {
  return {
    areaCode: "A1",
    areaName: "Alpha",
    regionName: "North West",
    countryName: "England",
    population: 100000,
    homesForUkraineArrivals: 10,
    homesForUkraineRate: 1,
    afghanProgrammePopulation: 5,
    afghanProgrammeRate: 0.5,
    afghanProgrammeLaHousing: 2,
    afghanProgrammePrsHousing: 1,
    supportedAsylum: 100,
    supportedAsylumRate: 10,
    contingencyAccommodation: 20,
    contingencyAccommodationRate: 2,
    initialAccommodation: 5,
    dispersalAccommodation: 75,
    subsistenceOnly: 20,
    allThreePathwaysTotal: 115,
    shareOfPopulationPct: 0.12,
    snapshotDate: "2025-12-31",
    resettlementCumulativeTotal: 15,
    afghanResettlementCumulative: 5,
    ukResettlementFamilyCumulative: 9,
    communitySponsorshipCumulative: 1,
    resettlementLatestYearTotal: 3,
    latestResettlementQuarterLabel: "Q4 2025",
    latestResettlementQuarterValue: 1,
    ...overrides
  };
}

describe("route analytics helpers", () => {
  it("aggregates regional pressure summaries and sorts them by supported asylum", () => {
    const areas = [
      makeArea({
        areaCode: "A1",
        areaName: "Alpha",
        regionName: "North West",
        supportedAsylum: 120,
        contingencyAccommodation: 30,
        allThreePathwaysTotal: 150,
        population: 100000
      }),
      makeArea({
        areaCode: "A2",
        areaName: "Beta",
        regionName: "North West",
        supportedAsylum: 80,
        contingencyAccommodation: 10,
        allThreePathwaysTotal: 100,
        population: 50000
      }),
      makeArea({
        areaCode: "A3",
        areaName: "Gamma",
        regionName: "London",
        supportedAsylum: 150,
        contingencyAccommodation: 40,
        allThreePathwaysTotal: 175,
        population: 200000
      })
    ];

    const summaries = getRegionPressureSummaries(areas);

    expect(summaries).toHaveLength(2);
    expect(summaries[0].regionName).toBe("North West");
    expect(summaries[0].supportedAsylum).toBe(200);
    expect(summaries[0].contingencyAccommodation).toBe(40);
    expect(summaries[0].areaCount).toBe(2);
    expect(summaries[0].supportedAsylumRate).toBeCloseTo(13.33, 2);
    expect(summaries[0].shareOfPopulationPct).toBeCloseTo(0.17, 2);
    expect(summaries[1].regionName).toBe("London");
  });

  it("calculates distribution statistics for benchmark strips", () => {
    const stats = getDistributionStats([10, 20, 30, 40, 50]);

    expect(stats.min).toBe(10);
    expect(stats.median).toBe(30);
    expect(stats.upperQuartile).toBe(40);
    expect(stats.p90).toBeCloseTo(46, 5);
    expect(stats.max).toBe(50);
  });

  it("returns percentile ranks based on values at or below the target", () => {
    expect(getPercentileRank([10, 20, 30, 40], 25)).toBe(50);
    expect(getPercentileRank([10, 20, 30, 40], 40)).toBe(100);
  });

  it("formats ordinals correctly for percentile copy", () => {
    expect(formatOrdinal(1)).toBe("1st");
    expect(formatOrdinal(2)).toBe("2nd");
    expect(formatOrdinal(3)).toBe("3rd");
    expect(formatOrdinal(4)).toBe("4th");
    expect(formatOrdinal(11)).toBe("11th");
    expect(formatOrdinal(12)).toBe("12th");
    expect(formatOrdinal(13)).toBe("13th");
    expect(formatOrdinal(21)).toBe("21st");
    expect(formatOrdinal(32)).toBe("32nd");
    expect(formatOrdinal(83)).toBe("83rd");
    expect(formatOrdinal(100)).toBe("100th");
  });

  it("calculates the last observed delta in a route series", () => {
    const points: RouteSeriesPoint[] = [
      { periodLabel: "2023", periodEnd: "2023-12-31", value: 1200 },
      { periodLabel: "2024", periodEnd: "2024-12-31", value: 1400 },
      { periodLabel: "2025", periodEnd: "2025-12-31", value: 1325 }
    ];

    expect(getSeriesDelta(points)).toBe(-75);
  });
});
