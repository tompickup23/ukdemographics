import rawHistorical from "../data/live/nino-historical.json";

export interface AreaHistorical {
  areaName: string;
  totalByYear: Array<number | null>;
  peakYear: number | null;
  peakValue: number | null;
  troughYear: number | null;
  troughValue: number | null;
  latestValue: number | null;
  earliestValue: number | null;
  cumulativeFlow_2002_2025: number;
}

export interface NinoHistoricalFile {
  source: string;
  lastUpdated: string;
  caveat: string;
  years: number[];
  national: {
    totalByYear: Array<number | null>;
    topNationalitiesByYear: Record<string, Array<{ nationality: string; count: number; sharePct: number }>>;
  };
  areas: Record<string, AreaHistorical>;
}

const data = rawHistorical as NinoHistoricalFile;

export function getNinoHistorical(areaCode: string): AreaHistorical | null {
  return data.areas[areaCode] ?? null;
}

export function getNinoHistoricalYears(): number[] {
  return data.years;
}

export function getNinoHistoricalNational(): NinoHistoricalFile["national"] {
  return data.national;
}

export function getNinoHistoricalSource(): string {
  return data.source;
}

export function getNinoHistoricalCaveat(): string {
  return data.caveat;
}
