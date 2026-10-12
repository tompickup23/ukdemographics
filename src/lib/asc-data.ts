import rawAsc from "../data/live/asc-dashboard.json";
import { percentileRank, type PercentileRank } from "./percentile";

export interface AreaAscProfile {
  areaName: string;
  grossSpendPerCapita: number;
  residentialRatePer10k65: number;
  qualityOfLifeScore: number;
  dtocDaysAnnual: number;
  period: string;
}

interface AscDashboard {
  source: string;
  methodology: string;
  lastUpdated: string;
  caveat: string;
  areas: Record<string, AreaAscProfile>;
}

const data = rawAsc as unknown as AscDashboard;

export function getAscProfile(areaCode: string): AreaAscProfile | null {
  return data.areas[areaCode] ?? null;
}

export function getAscSource(): string {
  return data.source;
}

export function getAscCaveat(): string {
  return data.caveat;
}

/** Rank among areas with a spend figure; describeRank() in percentile.ts words it. */
export function getAscSpendPercentile(areaCode: string): PercentileRank | null {
  const area = data.areas[areaCode];
  if (!area) return null;
  return percentileRank(Object.values(data.areas).map((a) => a.grossSpendPerCapita), area.grossSpendPerCapita);
}
