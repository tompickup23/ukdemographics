import rawPcon from "../data/live/pcon-dataset.json";
import rawMps from "../data/live/mp-directory.json";
import rawPip from "../data/live/pip-pcon.json";

export interface PconLa {
  ladCode: string;
  postcodeShare: number;
}

export interface PconGe2024 {
  shares: Record<string, number>;
  totalVotes: number | null;
  winner: string | null;
  winnerSharePct: number;
  runnerUp: string | null;
  runnerUpSharePct: number;
  majorityPp: number | null;
}

export interface PconEntry {
  code: string;
  name: string;
  slug: string;
  country: string;
  ge2024: PconGe2024;
  constituentLas: PconLa[];
}

interface PconFile {
  source: string;
  generatedAt: string;
  constituencyCount: number;
  unmatchedSlugs: string[];
  pcons: Record<string, PconEntry>;
}

interface MpRow {
  memberId: number;
  mpName: string;
  party: string;
  constituencyName: string;
  photoUrl: string | null;
  majority: number | null;
  electedDate: string | null;
}

const pconData = rawPcon as unknown as PconFile;
const mpData = (rawMps as unknown as { members: MpRow[] }).members;
const pipByCode = (rawPip as unknown as {
  byPconCode: Record<string, { code: string; name: string; claimants: number }>;
}).byPconCode;

// MP lookup by name. Constituency names match exactly (both come from
// Parliament data ultimately).
// The constituency dataset drops Welsh diacritics ("Montgomeryshire and
// Glyndwr") that Parliament keeps ("Glyndŵr"), so an exact-name lookup left
// that seat with no MP. Match on a folded form; the fetch script does the same.
export function foldConstituencyName(name: string): string {
  return name.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase()
    .replace(/&/g, "and").replace(/[^a-z0-9]+/g, " ").trim();
}

const mpsByName = new Map<string, MpRow>();
for (const m of mpData) mpsByName.set(foldConstituencyName(m.constituencyName), m);

export function getAllPcons(): PconEntry[] {
  return Object.values(pconData.pcons);
}

export function getPconByCode(code: string): PconEntry | null {
  return pconData.pcons[code] ?? null;
}

export function getPconBySlug(slug: string): PconEntry | null {
  for (const p of Object.values(pconData.pcons)) {
    if (p.slug === slug) return p;
  }
  return null;
}

// Inverse lookup: which constituencies overlap a given LA, sorted by the
// share of that LA's postcodes the constituency covers (descending).
export function getPconsForLa(ladCode: string): PconEntry[] {
  const matches: { pcon: PconEntry; share: number }[] = [];
  for (const p of Object.values(pconData.pcons)) {
    const la = p.constituentLas.find((l) => l.ladCode === ladCode);
    if (la) matches.push({ pcon: p, share: la.postcodeShare });
  }
  return matches.sort((a, b) => b.share - a.share).map((m) => m.pcon);
}

export function getMpForPcon(name: string): MpRow | null {
  return mpsByName.get(foldConstituencyName(name)) ?? null;
}

export interface MpVacancy {
  constituencyName: string;
  previousMember: string | null;
  previousMemberEnded: string | null;
  previousMemberEndReason: string | null;
}

const vacanciesByName = new Map<string, MpVacancy>(
  ((rawMps as unknown as { vacancies?: MpVacancy[] }).vacancies ?? [])
    .map((v) => [foldConstituencyName(v.constituencyName), v])
);

/** A seat Parliament lists with no current MP, with when and why the last one left. */
export function getVacancyForPcon(name: string): MpVacancy | null {
  return vacanciesByName.get(foldConstituencyName(name)) ?? null;
}

/**
 * The general election date, read from the directory as the start date most
 * sitting MPs share. An MP whose membership starts later came in at a
 * by-election, so the general election result on their page predates them.
 */
export function getGeneralElectionDate(): string | null {
  const counts = new Map<string, number>();
  for (const m of mpData) {
    const d = m.electedDate?.slice(0, 10);
    if (d) counts.set(d, (counts.get(d) ?? 0) + 1);
  }
  return [...counts].sort((a, b) => b[1] - a[1])[0]?.[0] ?? null;
}

export function getMpDirectoryDate(): string | null {
  return (rawMps as unknown as { lastUpdated?: string }).lastUpdated ?? null;
}

export function getPipClaimantsForPcon(code: string): number | null {
  return pipByCode[code]?.claimants ?? null;
}

export function getPconDatasetMeta() {
  return {
    source: pconData.source,
    generatedAt: pconData.generatedAt,
    count: pconData.constituencyCount,
  };
}
