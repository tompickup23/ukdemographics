import rawData from "../data/live/econ-activity-by-passport.json";

export interface PassportGroupStats {
  totalPopulation16plus: number;
  inEmployment_total: number;
  unemployed_total: number;
  economicallyActive_total: number;
  economicallyInactive: number;
  employmentRate_excludingFTstudents_pct: number | null;
  employmentRate_inclFTstudents_pct: number | null;
  inactivityRate_pct: number | null;
  inactiveBreakdown: {
    Retired: number;
    Student: number;
    LookingAfterFamily: number;
    LongTermSick: number;
    Other: number;
  };
}

export interface AreaEconPassport {
  areaName: string;
  byPassportGroup: Record<string, PassportGroupStats>;
}

interface EconPassportFile {
  source: string;
  caveat: string;
  passportGroupsOrder: string[];
  areas: Record<string, AreaEconPassport>;
}

const data = rawData as EconPassportFile;

export function getEconPassport(areaCode: string): AreaEconPassport | null {
  return data.areas[areaCode] ?? null;
}

export function getEconPassportSource(): string {
  return data.source;
}

export function getEconPassportCaveat(): string {
  return data.caveat;
}

export function getEconPassportGroupsOrder(): string[] {
  return data.passportGroupsOrder;
}
