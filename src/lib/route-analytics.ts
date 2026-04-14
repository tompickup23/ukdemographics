import type { LocalRouteAreaSummary, RouteSeriesPoint } from "./route-data";

export interface RegionPressureSummary {
  regionName: string;
  countryName: string;
  supportedAsylum: number;
  contingencyAccommodation: number;
  allThreePathwaysTotal: number;
  population: number;
  supportedAsylumRate: number;
  shareOfPopulationPct: number;
  areaCount: number;
}

export interface DistributionStats {
  min: number;
  median: number;
  upperQuartile: number;
  p90: number;
  max: number;
}

export function getRegionPressureSummaries(areas: LocalRouteAreaSummary[]): RegionPressureSummary[] {
  const regions = new Map<string, RegionPressureSummary>();

  for (const area of areas) {
    const existing = regions.get(area.regionName);

    if (existing) {
      existing.supportedAsylum += area.supportedAsylum;
      existing.contingencyAccommodation += area.contingencyAccommodation;
      existing.allThreePathwaysTotal += area.allThreePathwaysTotal;
      existing.population += area.population;
      existing.areaCount += 1;
      continue;
    }

    regions.set(area.regionName, {
      regionName: area.regionName,
      countryName: area.countryName,
      supportedAsylum: area.supportedAsylum,
      contingencyAccommodation: area.contingencyAccommodation,
      allThreePathwaysTotal: area.allThreePathwaysTotal,
      population: area.population,
      supportedAsylumRate: 0,
      shareOfPopulationPct: 0,
      areaCount: 1
    });
  }

  return [...regions.values()]
    .map((region) => ({
      ...region,
      supportedAsylumRate: region.population
        ? Number(((region.supportedAsylum / region.population) * 10000).toFixed(2))
        : 0,
      shareOfPopulationPct: region.population
        ? Number(((region.allThreePathwaysTotal / region.population) * 100).toFixed(2))
        : 0
    }))
    .sort((a, b) => b.supportedAsylum - a.supportedAsylum);
}

function sortAscending(values: number[]): number[] {
  return [...values].filter((value) => Number.isFinite(value)).sort((a, b) => a - b);
}

export function getQuantile(values: number[], quantile: number): number {
  const sorted = sortAscending(values);

  if (sorted.length === 0) {
    return 0;
  }

  if (sorted.length === 1) {
    return sorted[0];
  }

  const position = (sorted.length - 1) * quantile;
  const lowerIndex = Math.floor(position);
  const upperIndex = Math.ceil(position);
  const lower = sorted[lowerIndex];
  const upper = sorted[upperIndex];

  if (lowerIndex === upperIndex) {
    return lower;
  }

  return lower + (upper - lower) * (position - lowerIndex);
}

export function getDistributionStats(values: number[]): DistributionStats {
  const sorted = sortAscending(values);

  if (sorted.length === 0) {
    return {
      min: 0,
      median: 0,
      upperQuartile: 0,
      p90: 0,
      max: 0
    };
  }

  return {
    min: sorted[0],
    median: getQuantile(sorted, 0.5),
    upperQuartile: getQuantile(sorted, 0.75),
    p90: getQuantile(sorted, 0.9),
    max: sorted[sorted.length - 1]
  };
}

export function getPercentileRank(values: number[], target: number): number {
  const sorted = sortAscending(values);

  if (sorted.length === 0) {
    return 0;
  }

  const count = sorted.filter((value) => value <= target).length;
  return Math.round((count / sorted.length) * 100);
}

export function formatOrdinal(value: number): string {
  const absoluteValue = Math.abs(Math.trunc(value));
  const lastTwoDigits = absoluteValue % 100;

  if (lastTwoDigits >= 11 && lastTwoDigits <= 13) {
    return `${value}th`;
  }

  switch (absoluteValue % 10) {
    case 1:
      return `${value}st`;
    case 2:
      return `${value}nd`;
    case 3:
      return `${value}rd`;
    default:
      return `${value}th`;
  }
}

export function getSeriesDelta(points: RouteSeriesPoint[]): number {
  if (points.length < 2) {
    return 0;
  }

  return points[points.length - 1].value - points[points.length - 2].value;
}
