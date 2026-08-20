import rawVisaRoutes from "../data/live/visa-routes.json";

export interface VisaRouteMix {
  Work: number;
  Study: number;
  Family: number;
  Other: number;
}

export interface VisaRouteEntry {
  country: string;
  visaCountryNameUsed: string;
  ninoFlowRollingYear_UK: number;
  visaGrants2025_total_workShareRoutes: number;
  visaGrants2025_total_visitor: number;
  visaRouteMixCounts: VisaRouteMix;
  visaRouteMixPct_workShareBasis: VisaRouteMix;
}

interface VisaRoutesFile {
  source: string;
  lastUpdated: string;
  caveat: string;
  year: number;
  nationalRouteTotals2025: Record<string, number>;
  humanitarianTotals2025: Record<string, number>;
  bridge: VisaRouteEntry[];
}

const data = rawVisaRoutes as VisaRoutesFile;

const byCountry: Record<string, VisaRouteEntry> = Object.fromEntries(
  data.bridge.map((b) => [b.country, b]),
);

export function getVisaRouteMix(country: string): VisaRouteEntry | null {
  return byCountry[country] ?? null;
}

export function getVisaRoutesSource(): string {
  return data.source;
}

export function getVisaRoutesCaveat(): string {
  return data.caveat;
}

export function getVisaRoutesYear(): number {
  return data.year;
}
