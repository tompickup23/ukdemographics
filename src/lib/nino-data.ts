import rawNino from "../data/live/nino-dashboard.json";

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

export function getNinoTotalPercentile(areaCode: string): number | null {
  const area = data.areas?.[areaCode];
  if (!area) return null;
  const totals = Object.values(data.areas).map((a) => a.totalRollingYear);
  const below = totals.filter((t) => t < area.totalRollingYear).length;
  return Math.round((below / totals.length) * 100);
}
