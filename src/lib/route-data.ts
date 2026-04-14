import { readFileSync } from "node:fs";

export interface RouteCard {
  id: string;
  label: string;
  value: number;
  period: string;
  detail: string;
  sourceUrl: string;
  valueSuffix?: string;
}

export interface RouteSeriesPoint {
  periodLabel: string;
  periodEnd: string | null;
  value: number;
}

export interface RouteFamily {
  id: string;
  label: string;
  group: string;
  schemeStatus: string;
  localBreakdown: string;
  sourceUrl: string;
  note: string;
  latestValue: number;
  latestPeriod: string;
  firstPeriod: string | null;
  series: RouteSeriesPoint[];
}

export interface TopMetricAreaRow {
  areaCode: string;
  areaName: string;
  regionName: string;
  value: number;
}

export interface TopMetricGroup {
  metricId: string;
  label: string;
  rows: TopMetricAreaRow[];
}

export interface RouteOutcomeCohort {
  claimYear: string;
  totalClaims: number;
  initialDecisions: number;
  initialGrantCount: number;
  initialRefusalCount: number;
  initialWithdrawalCount: number;
  initialAdministrativeCount: number;
  latestGrantCount: number;
  latestRefusalCount: number;
  latestWithdrawalCount: number;
  latestAdministrativeCount: number;
  initialGrantRatePct: number | null;
  latestGrantRatePct: number | null;
  latestOutcomeKnownPct: number | null;
}

export interface RouteQuarterBreakdownRow {
  label: string;
  value: number;
  metricId: string;
}

export interface RoutePostDecisionSeries {
  lodged?: RouteSeriesPoint[];
  determined?: RouteSeriesPoint[];
  total?: RouteSeriesPoint[];
  voluntary?: RouteSeriesPoint[];
  enforced?: RouteSeriesPoint[];
  refusedEntryDeparted?: RouteSeriesPoint[];
}

export interface RouteDashboard {
  generatedAt: string;
  localSnapshotDate: string;
  routeFamilies: RouteFamily[];
  nationalCards: RouteCard[];
  illegalEntryMethodsLatestYear: Array<{ method: string; value: number }>;
  smallBoatDecisionGroupsLatestYear: {
    year: string;
    rows: Array<{ outcomeGroup: string; value: number }>;
  };
  nationalSystemDynamics: {
    stockFlowCards: RouteCard[];
    flowSeries: {
      claims: RouteSeriesPoint[];
      initialDecisions: RouteSeriesPoint[];
      initialGrants: RouteSeriesPoint[];
      initialRefusals: RouteSeriesPoint[];
      initialWithdrawals: RouteSeriesPoint[];
    };
    stockSeries: {
      awaitingInitialDecision: RouteSeriesPoint[];
      supportedAsylum: RouteSeriesPoint[];
      hotelAccommodation: RouteSeriesPoint[];
    };
    latestQuarter: {
      quarterLabel: string | null;
      stockPeriodLabel: string | null;
      claims: number;
      initialDecisions: number;
      initialGrants: number;
      initialRefusals: number;
      initialWithdrawals: number;
      initialAdministrativeOutcomes: number;
      awaitingInitialDecision: number;
      supportedAsylum: number;
      hotelAccommodation: number;
      hotelShareOfSupportPct: number | null;
      decisionMinusClaims: number;
    };
    latestQuarterDecisionBreakdown: RouteQuarterBreakdownRow[];
    latestSupportBreakdown: RouteQuarterBreakdownRow[];
    outcomeCohorts: RouteOutcomeCohort[];
    recentOutcomeCohorts: RouteOutcomeCohort[];
    postDecisionPath: {
      appeals: {
        latestQuarterLabel: string | null;
        dataCompleteThroughLabel: string | null;
        dataLagNote: string;
        series: RoutePostDecisionSeries;
        latestDeterminationBreakdown: RouteQuarterBreakdownRow[];
      };
      returns: {
        latestQuarterLabel: string | null;
        scopeLabel: string;
        scopeNote: string;
        series: RoutePostDecisionSeries;
        latestBreakdown: RouteQuarterBreakdownRow[];
      };
      readingNotes: string[];
    };
    outcomeRateSeries: {
      initialGrantRate: RouteSeriesPoint[];
      latestGrantRate: RouteSeriesPoint[];
    };
    readingNotes: string[];
  };
  topAreasByMetric: TopMetricGroup[];
  limitations: string[];
  sources: Array<{
    source_id: string;
    source_url: string;
    attachment_url: string;
    methodology_url: string;
    release_date: string;
  }>;
}

export interface LocalRouteAreaSummary {
  areaCode: string;
  areaName: string;
  regionName: string;
  countryName: string;
  population: number;
  homesForUkraineArrivals: number;
  homesForUkraineRate: number | null;
  afghanProgrammePopulation: number;
  afghanProgrammeRate: number | null;
  afghanProgrammeLaHousing: number;
  afghanProgrammePrsHousing: number;
  supportedAsylum: number;
  supportedAsylumRate: number | null;
  contingencyAccommodation: number;
  contingencyAccommodationRate: number | null;
  initialAccommodation: number;
  dispersalAccommodation: number;
  subsistenceOnly: number;
  allThreePathwaysTotal: number;
  shareOfPopulationPct: number | null;
  snapshotDate: string;
  resettlementCumulativeTotal: number;
  afghanResettlementCumulative: number;
  ukResettlementFamilyCumulative: number;
  communitySponsorshipCumulative: number;
  resettlementLatestYearTotal: number;
  latestResettlementQuarterLabel: string;
  latestResettlementQuarterValue: number;
}

export interface LocalRouteLatest {
  generatedAt: string;
  snapshotDate: string;
  defaultCompareCodes: string[];
  areas: LocalRouteAreaSummary[];
  topAreasByMetric: TopMetricGroup[];
  routeMetricFamilies: Array<{
    id: string;
    label: string;
    unit: string;
    description: string;
  }>;
}

function readProjectJson<T>(projectRelativePath: string): T {
  const fileUrl = new URL(`../../${projectRelativePath}`, import.meta.url);
  return JSON.parse(readFileSync(fileUrl, "utf8")) as T;
}

export function loadRouteDashboard(): RouteDashboard {
  return readProjectJson<RouteDashboard>("src/data/live/route-dashboard.json");
}

export function loadLocalRouteLatest(): LocalRouteLatest {
  return readProjectJson<LocalRouteLatest>("src/data/live/local-route-latest.json");
}
