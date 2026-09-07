import rawEnglish from "../data/live/census-english-proficiency.json";

export interface CensusEnglishArea {
  areaName: string;
  total: number;
  mainEnglish?: number;
  mainNotEnglishVeryWell?: number;
  mainNotEnglishWell?: number;
  mainNotEnglishNotWell?: number;
  mainNotEnglishCannot?: number;
  cannotSpeakWellPct?: number;
  nonEnglishPct?: number;
  // Present only on the April 2023 unitary authorities, whose figures are
  // summed from the 2021 districts named here because Census 2021 predates
  // their creation and publishes nothing under their own code.
  derivedFrom?: { code: string; name: string }[];
  sourceNote?: string;
}

interface CensusEnglishFile {
  source: string;
  sourceUrl: string;
  referenceDate: string;
  areas: Record<string, CensusEnglishArea>;
}

const data = rawEnglish as unknown as CensusEnglishFile;

export function getCensusEnglish(areaCode: string): CensusEnglishArea | null {
  return data.areas[areaCode] ?? null;
}

export function getCensusEnglishSource() {
  return { source: data.source, sourceUrl: data.sourceUrl, referenceDate: data.referenceDate };
}
