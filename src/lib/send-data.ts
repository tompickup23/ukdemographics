import rawSend from "../data/live/send-dashboard.json";

export interface PrimaryNeed {
  need: string;
  pct: number;
}

export interface AreaSendProfile {
  areaName: string;
  /** Pupils with an EHC plan on the January school census, all schools. */
  ehcpPupils: number;
  /** DfE's own percentage: pupils with an EHC plan as a share of pupils on roll. */
  ehcpPctOfPupils: number | null;
  pupilsOnRoll: number | null;
  /** Autism as the primary need, as a share of pupils with an EHC plan. */
  asdPrevalencePct: number | null;
  fiveYearGrowthPct: number | null;
  ehcpPupilsFiveYearsEarlier: number | null;
  primaryNeeds: PrimaryNeed[];
  primaryNeedBase: number | null;
  period: string;
}

interface SendDashboard {
  source: string;
  sourceUrl: string;
  methodology: string;
  lastUpdated: string;
  edition: string;
  growthBasePeriod: string;
  caveat: string;
  england: AreaSendProfile | null;
  areas: Record<string, AreaSendProfile>;
}

const data = rawSend as unknown as SendDashboard;

export function getSendProfile(areaCode: string): AreaSendProfile | null {
  return data.areas[areaCode] ?? null;
}

export function getSendSource(): string {
  return data.source;
}

export function getSendCaveat(): string {
  return data.caveat;
}

export function getSendGrowthPercentile(areaCode: string): number | null {
  const area = data.areas[areaCode];
  if (!area || area.fiveYearGrowthPct == null) return null;
  const growth = area.fiveYearGrowthPct;
  const rates = Object.values(data.areas)
    .map((a) => a.fiveYearGrowthPct)
    .filter((r): r is number => r != null);
  const below = rates.filter((r) => r < growth).length;
  return Math.round((below / rates.length) * 100);
}
