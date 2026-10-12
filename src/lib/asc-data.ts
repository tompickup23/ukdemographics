import rawAsc from "../data/live/asc-dashboard.json";
import { percentileRank, type PercentileRank } from "./percentile";

/**
 * Adult social care, by council with adult social services responsibilities (upper tier).
 * Built by scripts/transform/transform_asc.py from the DHSC finance and activity reports.
 * The two reports are published separately, so each measure carries its own period.
 */
export interface AreaAscProfile {
  areaName: string;
  /** Gross current expenditure per resident aged 18 and over, GBP. */
  grossSpendPerCapita: number | null;
  /** Residents aged 65 and over in residential long term support during the year, per 10,000 aged 65 and over. */
  residentialRatePer10k65: number | null;
  qualityOfLifeScore: number | null;
  dtocDaysAnnual: number | null;
  period: string;
  grossSpendPeriod: string;
  residentialPeriod: string;
}

export interface AscMeasure {
  label: string;
  counts: string;
  period: string;
  edition: string;
  publisher: string;
  landingPage: string | null;
  revisionNotice?: { note: string; date: string } | null;
}

interface AscDashboard {
  source: string;
  methodology: string;
  populationSource: string;
  lastUpdated: string;
  caveat: string;
  measures: Record<"grossSpendPerCapita" | "residentialRatePer10k65", AscMeasure>;
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

export function getAscMeasure(key: keyof AscDashboard["measures"]): AscMeasure {
  return data.measures[key];
}

/**
 * Rank on spend per adult among councils with a spend figure; null when there is
 * no figure. describeRank() in percentile.ts words it.
 */
export function getAscSpendPercentile(areaCode: string): PercentileRank | null {
  const area = data.areas[areaCode];
  if (!area) return null;
  return percentileRank(Object.values(data.areas).map((a) => a.grossSpendPerCapita), area.grossSpendPerCapita);
}
