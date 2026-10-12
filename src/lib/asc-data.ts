import rawAsc from "../data/live/asc-dashboard.json";

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

/** Share of councils with lower spend per adult, as a whole percentage; null when there is no figure. */
export function getAscSpendPercentile(areaCode: string): number | null {
  const own = data.areas[areaCode]?.grossSpendPerCapita;
  if (own == null) return null;
  const spends = Object.values(data.areas)
    .map((a) => a.grossSpendPerCapita)
    .filter((s): s is number => s != null);
  const below = spends.filter((s) => s < own).length;
  return Math.round((below / spends.length) * 100);
}
