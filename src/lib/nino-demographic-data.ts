import rawDemog from "../data/live/nino-demographic-profile.json";

export interface AgeBandShare {
  band: string;
  count: number;
  sharePct: number;
}

export interface SexShare {
  sex: string;
  count: number;
  sharePct: number;
}

export interface NinoDemographicProfile {
  areaName: string;
  rollingYearTotal: number;
  byAgeBand: AgeBandShare[];
  bySex: SexShare[];
}

interface DemoFile {
  source: string;
  caveat: string;
  ageBandsOrder: string[];
  national: NinoDemographicProfile;
  areas: Record<string, NinoDemographicProfile>;
}

const data = rawDemog as unknown as DemoFile;

export function getNinoDemographic(areaCode: string): NinoDemographicProfile | null {
  return data.areas[areaCode] ?? null;
}

export function getNinoDemographicNational(): NinoDemographicProfile {
  return data.national;
}

export function getNinoDemographicSource(): string {
  return data.source;
}

export function getNinoDemographicCaveat(): string {
  return data.caveat;
}
