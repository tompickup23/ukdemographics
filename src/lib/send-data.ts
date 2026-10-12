import rawSend from "../data/live/send-dashboard.json";
import { percentileRank, type PercentileRank } from "./percentile";

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

/** Rank among areas with a growth figure; describeRank() in percentile.ts words it. */
export function getSendGrowthPercentile(areaCode: string): PercentileRank | null {
  const area = data.areas[areaCode];
  if (!area) return null;
  return percentileRank(Object.values(data.areas).map((a) => a.fiveYearGrowthPct), area.fiveYearGrowthPct);
}
