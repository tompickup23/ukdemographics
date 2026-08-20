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
const mpsByName = new Map<string, MpRow>();
for (const m of mpData) mpsByName.set(m.constituencyName, m);

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
  return mpsByName.get(name) ?? null;
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
