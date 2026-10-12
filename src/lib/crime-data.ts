import rawCrime from "../data/live/crime-dashboard.json";
import { percentileRank, type PercentileRank } from "./percentile";

export interface CrimeBreakdown {
  type: string;
  rate: number;
}

export interface AreaCrimeProfile {
  areaName: string;
  snapshotDate: string;
  totalCrimeRate: number;
  violentCrimeRate: number;
  theftRate: number;
  asbRate: number;
  drugRate: number;
  hateCrimeCount: number;
  yearOnYearChange: number;
  breakdown: CrimeBreakdown[];
  period: string;
}

interface CrimeDashboard {
  source: string;
  methodology: string;
  lastUpdated: string;
  caveat: string;
  areas: Record<string, AreaCrimeProfile>;
}

const data = rawCrime as unknown as CrimeDashboard;

export function getCrimeProfile(areaCode: string): AreaCrimeProfile | null {
  return data.areas[areaCode] ?? null;
}

export function getCrimeSource(): string {
  return data.source;
}

export function getCrimeCaveat(): string {
  return data.caveat;
}

/** Rank among areas with a published rate; describeRank() in percentile.ts words it. */
export function getCrimeRatePercentile(areaCode: string): PercentileRank | null {
  const area = data.areas[areaCode];
  if (!area) return null;
  return percentileRank(Object.values(data.areas).map((a) => a.totalCrimeRate), area.totalCrimeRate);
}
