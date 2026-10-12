import rawNino from "../data/live/nino-dashboard.json";
import { percentileRank, type PercentileRank } from "./percentile";

export interface NinoNationalityShare {
  nationality: string;
  count: number;
  sharePct: number;
}

export interface AreaNinoProfile {
  areaName: string;
  totalRollingYear: number;
  yearOnYearChangePct: number | null;
  byNationality: NinoNationalityShare[];
  periodEnd: string | null;
}

interface NinoDashboard {
  source: string;
  methodology: string;
  lastUpdated: string;
  caveat: string;
  areas: Record<string, AreaNinoProfile>;
}

const data = rawNino as NinoDashboard;

export function getNinoProfile(areaCode: string): AreaNinoProfile | null {
  return data.areas?.[areaCode] ?? null;
}

export function getNinoSource(): string {
  return data.source;
}

export function getNinoCaveat(): string {
  return data.caveat;
}

/** Rank among areas with a total; describeRank() in percentile.ts words it. */
export function getNinoTotalPercentile(areaCode: string): PercentileRank | null {
  const area = data.areas?.[areaCode];
  if (!area) return null;
  return percentileRank(Object.values(data.areas).map((a) => a.totalRollingYear), area.totalRollingYear);
}
