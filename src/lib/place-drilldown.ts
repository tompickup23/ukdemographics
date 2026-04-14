import { getPercentileRank } from "./route-analytics";
import type { LocalRouteAreaSummary } from "./route-data";

export interface PlaceDrilldownRow {
  areaCode: string;
  areaName: string;
  regionName: string;
  value: number;
  valueLabel: string;
  secondaryLabel: string;
  widthPct: number;
  isCurrent: boolean;
  href: string;
}

export interface PlaceDrilldownView {
  scope: "regional" | "national";
  summary: string;
  rows: PlaceDrilldownRow[];
}

export interface PlaceDrilldownMetric {
  id: string;
  label: string;
  description: string;
  currentValueLabel: string;
  nationalRank: number;
  regionalRank: number;
  percentile: number;
  views: PlaceDrilldownView[];
}

interface MetricDefinition {
  id: string;
  label: string;
  description: string;
  getValue: (area: LocalRouteAreaSummary) => number;
  formatValue: (value: number) => string;
}

function selectVisibleRows(
  rows: LocalRouteAreaSummary[],
  currentArea: LocalRouteAreaSummary,
  limit: number
): LocalRouteAreaSummary[] {
  const leadingRows = rows.slice(0, limit);

  if (leadingRows.some((row) => row.areaCode === currentArea.areaCode)) {
    return leadingRows;
  }

  return [...leadingRows.slice(0, Math.max(0, limit - 1)), currentArea].sort(
    (left, right) => rows.findIndex((candidate) => candidate.areaCode === left.areaCode) - rows.findIndex((candidate) => candidate.areaCode === right.areaCode)
  );
}

function toPeople(value: number): string {
  return `${value.toLocaleString()} people`;
}

function toRate(value: number): string {
  return `${value.toFixed(2).replace(/\.00$/, "")} per 10,000`;
}

function buildRows(
  areas: LocalRouteAreaSummary[],
  currentArea: LocalRouteAreaSummary,
  metric: MetricDefinition,
  scope: PlaceDrilldownView["scope"],
  limit: number
): PlaceDrilldownView {
  const rankedAreas = [...areas].sort((left, right) => metric.getValue(right) - metric.getValue(left) || left.areaName.localeCompare(right.areaName));
  const visibleAreas = selectVisibleRows(rankedAreas, currentArea, limit);
  const maxValue = Math.max(...visibleAreas.map((candidate) => metric.getValue(candidate)), 1);
  const currentRank = rankedAreas.findIndex((candidate) => candidate.areaCode === currentArea.areaCode) + 1;
  const leadArea = rankedAreas[0];
  const totalAreas = rankedAreas.length;

  const summary =
    scope === "regional"
      ? currentRank === 1
        ? `${currentArea.areaName} currently leads ${currentArea.regionName} on ${metric.label.toLowerCase()}.`
        : `${currentArea.areaName} ranks ${currentRank} of ${totalAreas} in ${currentArea.regionName}; ${leadArea.areaName} currently leads this regional measure.`
      : currentRank <= 10
        ? `${currentArea.areaName} is in the national top ten on ${metric.label.toLowerCase()}, ranking ${currentRank} of ${totalAreas}.`
        : `${currentArea.areaName} ranks ${currentRank} of ${totalAreas} nationally on ${metric.label.toLowerCase()}.`;

  return {
    scope,
    summary,
    rows: visibleAreas.map((candidate) => {
      const value = metric.getValue(candidate);

      return {
        areaCode: candidate.areaCode,
        areaName: candidate.areaName,
        regionName: candidate.regionName,
        value,
        valueLabel: metric.formatValue(value),
        secondaryLabel: candidate.areaCode === currentArea.areaCode ? "Current page" : candidate.regionName,
        widthPct: Math.max(4, Number(((value / maxValue) * 100).toFixed(1))),
        isCurrent: candidate.areaCode === currentArea.areaCode,
        href: `/places/${candidate.areaCode}/?place_metric=${metric.id}&place_scope=${scope}`
      };
    })
  };
}

export function getPlaceDrilldownMetrics(
  areas: LocalRouteAreaSummary[],
  currentArea: LocalRouteAreaSummary,
  limit = 6
): PlaceDrilldownMetric[] {
  const regionalAreas = areas.filter((candidate) => candidate.regionName === currentArea.regionName);
  const metricDefinitions: MetricDefinition[] = [
    {
      id: "supported_asylum",
      label: "Supported asylum",
      description: "Quarter-end asylum-support stock for this local authority, not the number of distinct people who passed through support.",
      getValue: (area) => area.supportedAsylum,
      formatValue: toPeople
    },
    {
      id: "supported_rate",
      label: "Supported asylum rate",
      description: "Rate per 10,000 residents, which shows local intensity more cleanly than raw volume alone.",
      getValue: (area) => area.supportedAsylumRate ?? 0,
      formatValue: toRate
    },
    {
      id: "contingency_accommodation",
      label: "Contingency accommodation",
      description: "Hotel and contingency placements recorded in the latest quarter-end local-authority snapshot.",
      getValue: (area) => area.contingencyAccommodation,
      formatValue: toPeople
    },
    {
      id: "all_three_pathways",
      label: "Three-pathway total",
      description: "Combined supported asylum, Homes for Ukraine arrivals, and Afghan programme population.",
      getValue: (area) => area.allThreePathwaysTotal,
      formatValue: toPeople
    }
  ];

  return metricDefinitions.map((metric) => {
    const currentValue = metric.getValue(currentArea);
    const nationalAreas = [...areas];
    const nationalRank =
      [...nationalAreas]
        .sort((left, right) => metric.getValue(right) - metric.getValue(left) || left.areaName.localeCompare(right.areaName))
        .findIndex((candidate) => candidate.areaCode === currentArea.areaCode) + 1;
    const regionalRank =
      [...regionalAreas]
        .sort((left, right) => metric.getValue(right) - metric.getValue(left) || left.areaName.localeCompare(right.areaName))
        .findIndex((candidate) => candidate.areaCode === currentArea.areaCode) + 1;

    return {
      id: metric.id,
      label: metric.label,
      description: metric.description,
      currentValueLabel: metric.formatValue(currentValue),
      nationalRank,
      regionalRank,
      percentile: getPercentileRank(
        areas.map((candidate) => metric.getValue(candidate)),
        currentValue
      ),
      views: [
        buildRows(regionalAreas, currentArea, metric, "regional", limit),
        buildRows(nationalAreas, currentArea, metric, "national", limit)
      ]
    };
  });
}
