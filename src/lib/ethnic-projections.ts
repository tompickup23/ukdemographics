import rawProjections from "../data/live/ethnic-projections.json";
import { plausibleThrough } from "./projection-plausibility";

export interface EthnicGroup {
  white_british: number;
  white_other: number;
  asian: number;
  black: number;
  mixed: number;
  other: number;
}

export interface EthnicSnapshot {
  year: number;
  total_population: number;
  groups: EthnicGroup;
  groups_absolute?: Record<string, number>;
}

export interface EthnicThreshold {
  label: string;
  year: number;
  confidence: "high" | "medium" | "low";
}

export interface ReligionData {
  [key: string]: number;
}

export interface NativityData {
  ukBornPct: number;
  foreignBornPct: number;
}

export interface StochasticBand {
  wbi: { p2_5: number; p10: number; median: number; p90: number; p97_5: number };
}

export interface ShiftShareData {
  totalChangePp: number;
  nationalEffectPp: number;
  structuralEffectPp: number;
  localEffectPp: number;
  dominantDriver: string;
}

export interface EthGroupMetric {
  [ethnicity: string]: Record<string, number>;
}

export interface AreaEthnicProjection {
  areaName: string;
  baseline: EthnicSnapshot;
  current: EthnicSnapshot;
  annualChangePp: EthnicGroup;
  projections: Record<string, EthnicGroup>;
  thresholds: EthnicThreshold[];
  headlineStat: { value: string; trend: string } | null;
  // v6 additions
  religion?: Record<string, ReligionData>;
  nativity?: Record<string, NativityData>;
  stochastic?: Record<string, StochasticBand>;
  confidenceBand2051?: { median: number; ci80: [number, number]; ci95: [number, number] };
  shiftShare?: ShiftShareData;
  diversityIndex?: { entropy: number; diversityLevel: string; dissimilarity: number };
  englishProficiency?: { mainLanguageEnglishPct: number; cannotSpeakEnglishPct: number };
  migrationProfile?: { foreignBornPct: number; maturityLevel: string; implication: string };
  economicActivity?: EthGroupMetric;
  housingTenure?: EthGroupMetric;
  qualifications?: EthGroupMetric;
  health?: EthGroupMetric;
  smoothedProjections?: Record<string, EthnicGroup>;
  schoolEthnicity?: {
    year: string;
    totalPupils: number;
    groups: Record<string, number>;
    wbiGap: number;
    insight: string;
  };
  impactProjections?: {
    schoolDiversity: { currentMinorityPupilsPct: number; projectedMinorityPupils2041Pct: number; ealDemandGrowthPp: number; implication: string };
    housingDemand: { foreignBornGrowthPp: number; implication: string };
    interpreterDemand: { currentNonEnglishPct: number; implication: string };
  };
}

interface EthnicProjectionsData {
  source: string;
  methodology: string;
  lastUpdated: string;
  areas: Record<string, AreaEthnicProjection>;
}

const data = rawProjections as unknown as EthnicProjectionsData;

export function getEthnicProjection(areaCode: string): AreaEthnicProjection | null {
  return data.areas[areaCode] ?? null;
}

export function getEthnicProjectionSource(): string {
  return data.source;
}

export function getEthnicProjectionMethodology(): string {
  return data.methodology;
}

export function getReligionData(areaCode: string) {
  return data.areas[areaCode]?.religion ?? null;
}

export function getNativityData(areaCode: string) {
  return data.areas[areaCode]?.nativity ?? null;
}

export function getStochasticData(areaCode: string) {
  return data.areas[areaCode]?.stochastic ?? null;
}

export function getShiftShareData(areaCode: string) {
  return data.areas[areaCode]?.shiftShare ?? null;
}

export function getDiversityIndex(areaCode: string) {
  return data.areas[areaCode]?.diversityIndex ?? null;
}

export function getEnglishProficiency(areaCode: string) {
  return data.areas[areaCode]?.englishProficiency ?? null;
}

export function getMigrationProfile(areaCode: string) {
  return data.areas[areaCode]?.migrationProfile ?? null;
}

export function getSocioeconomicData(areaCode: string) {
  const area = data.areas[areaCode];
  if (!area) return null;
  return {
    economicActivity: area.economicActivity ?? null,
    housingTenure: area.housingTenure ?? null,
    qualifications: area.qualifications ?? null,
    health: area.health ?? null
  };
}

/**
 * Returns areas that cross below a 50% White British share on or before the cutoff
 * year, sorted by the year they cross. Every threshold is returned regardless of its
 * confidence field; an earlier version of this comment claimed a medium-and-above
 * filter that the code has never applied.
 *
 * This is a flow. For the count of areas that are below 50% in a given year, which
 * is a different question and the one the headline cards ask, see
 * getAreasBelowWhiteBritishMajority below.
 */
export function getSignificantDemographicShifts(cutoffYear = 2070): Array<{
  areaCode: string;
  areaName: string;
  thresholdYear: number;
  currentWbPct: number;
  baselineWbPct: number;
  annualDeclinePp: number;
  confidence: string;
}> {
  return Object.entries(data.areas)
    .map(([areaCode, area]) => {
      const wbThreshold = area.thresholds.find((t) => t.label === "White British <50%");
      if (!wbThreshold || wbThreshold.year > cutoffYear) return null;
      return {
        areaCode,
        areaName: area.areaName,
        thresholdYear: wbThreshold.year,
        currentWbPct: area.current.groups.white_british,
        baselineWbPct: area.baseline.groups.white_british,
        annualDeclinePp: Math.abs(area.annualChangePp.white_british),
        confidence: wbThreshold.confidence
      };
    })
    .filter((x): x is NonNullable<typeof x> => x !== null)
    .sort((a, b) => a.thresholdYear - b.thresholdYear);
}

/**
 * Format projection data for a simple bar chart display.
 */
export function getEthnicCompositionTimeline(areaCode: string): Array<{
  year: string;
  groups: EthnicGroup;
  isProjection: boolean;
}> | null {
  const area = data.areas[areaCode];
  if (!area) return null;

  const timeline = [
    { year: String(area.baseline.year), groups: area.baseline.groups, isProjection: false },
    { year: String(area.current.year), groups: area.current.groups, isProjection: false }
  ];

  for (const [year, groups] of Object.entries(area.projections)) {
    timeline.push({ year, groups, isProjection: true });
  }

  return timeline.sort((a, b) => Number(a.year) - Number(b.year));
}

/**
 * Areas whose projected White British share is under 50% in a given year, counted
 * only where that year is publishable for the area.
 *
 * Two rules are doing work here and the site needs both.
 *
 * The first is stock, not flow. getSignificantDemographicShifts above answers a
 * different question: which areas *cross* the line, and when. It reads the
 * thresholds array, and an area already under 50% at the 2021 Census has no
 * crossing to record, so it carries no threshold. The homepage and the national
 * page were counting crossings under a label promising a stock, which published
 * 60 and left out Birmingham, Leicester, Luton, Slough, Manchester and 22 others.
 *
 * The second is the plausibility rule the place pages already apply. Where a
 * residual Census group runs away past a quarter of the population at several
 * times its 2021 share, the year is unconstrained composition rather than
 * demography, and the place page withholds it: Barnet's page stops at 2041 and
 * says so. A headline count that includes Enfield's 2051 while Enfield's own page
 * declines to show it is publishing under two rules at once. Six area-years are
 * withheld at 2051 and fourteen at 2061.
 *
 * Together these give 86 areas at 2051 and 99 at 2061, which is what this site's
 * own finding has said since August and what the sister site publishes.
 *
 * `covered` is the number of areas the count could have drawn on, and it is not
 * 318: 312 areas are publishable at 2051 and 255 at 2061. A count without its
 * denominator invites the comparison that is wrong.
 */
export function getAreasBelowWhiteBritishMajority(year: number): {
  count: number;
  covered: number;
  areaCodes: string[];
} {
  const areaCodes: string[] = [];
  let covered = 0;
  for (const [code, area] of Object.entries(data.areas)) {
    const share = area.projections?.[String(year)]?.white_british;
    if (share == null) continue;
    const through = plausibleThrough(area as any);
    if (through == null || through < year) continue;
    covered++;
    if (share < 50) areaCodes.push(code);
  }
  return { count: areaCodes.length, covered, areaCodes };
}
