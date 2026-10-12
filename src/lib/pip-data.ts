/**
 * Personal Independence Payment (PIP) figures for place pages.
 *
 * DWP publishes PIP claimants by Westminster constituency (2024 boundaries), not
 * by local authority. Until October 2026 the place page divided one "best match"
 * constituency's claimants by the whole local authority's Census population:
 * Lancaster and Wyre each got Lancaster and Wyre's count, Rossendale got
 * Rossendale and Darwen's. None of the 13 authorities that show the section is
 * made of whole constituencies, so without DWP's own local authority count (not
 * yet fetched) an authority's figure could only come from splitting constituency
 * counts by postcode share, which is an estimate.
 * The page now gives no local rate. It lists each overlapping constituency's own
 * count, with the share of that constituency's postcodes inside the authority.
 *
 * The England and Wales rate is computed here from the files: claimants in the
 * English (E14) and Welsh (W07) constituencies, over the ONS mid-2025 estimate
 * for England and Wales in population-estimates.json. It replaces a total that
 * included Scotland, "Abroad" and "Unknown", divided by a typed 60,000,000.
 */
import rawPip from "../data/live/pip-pcon.json";
import rawPopulation from "../data/live/population-estimates.json";
import { getPconsForLa } from "./pcon-data";

interface PipRow {
  code: string;
  name: string;
  claimants: number;
}

interface PipFile {
  source: string;
  lastUpdated: string;
  latestMonth: string;
  totalClaimants: number;
  byPconCode: Record<string, PipRow>;
}

interface PopulationFile {
  latestYear: number;
  source: { title: string; referenceDate: string };
  countries: Record<string, { name: string; population: number }>;
}

const pip = rawPip as unknown as PipFile;
const population = rawPopulation as unknown as PopulationFile;

/** ONS code for England and Wales together. */
export const ENGLAND_AND_WALES = "K04000001";

/** Constituency codes for England (E14) and Wales (W07). */
const ENGLAND_OR_WALES_PCON = /^(E14|W07)\d{6}$/;

export function isEnglandOrWalesPcon(code: string): boolean {
  return ENGLAND_OR_WALES_PCON.test(code);
}

/** "Jan-26", as the PIP transform stores it, to "January 2026". */
export function pipMonthLabel(raw: string = pip.latestMonth): string | null {
  const m = String(raw ?? "").match(/^([A-Za-z]{3})-(\d{2})$/);
  if (!m) return null;
  const d = new Date(`${m[1]} 1, 20${m[2]} UTC`);
  return Number.isNaN(d.getTime())
    ? null
    : d.toLocaleDateString("en-GB", { month: "long", year: "numeric", timeZone: "UTC" });
}

export interface PipNationalRate {
  claimants: number;
  constituencies: number;
  population: number;
  populationYear: number;
  per100: number;
}

export function pipEnglandAndWalesRate(): PipNationalRate | null {
  const rows = Object.values(pip.byPconCode).filter((r) => isEnglandOrWalesPcon(r.code));
  const claimants = rows.reduce((sum, r) => sum + r.claimants, 0);
  const pop = population.countries?.[ENGLAND_AND_WALES]?.population;
  if (!rows.length || !(pop > 0)) return null;
  return {
    claimants,
    constituencies: rows.length,
    population: pop,
    populationYear: population.latestYear,
    per100: (claimants / pop) * 100,
  };
}

export interface PipConstituency {
  code: string;
  name: string;
  slug: string;
  claimants: number;
  /** Share of the constituency's postcodes that lie in the authority (0 to 1). */
  shareInArea: number;
}

/** Every constituency overlapping the authority that has a PIP count, largest share first. */
export function pipConstituenciesForArea(ladCode: string): PipConstituency[] {
  const out: PipConstituency[] = [];
  for (const p of getPconsForLa(ladCode)) {
    const row = pip.byPconCode[p.code];
    const la = p.constituentLas.find((l) => l.ladCode === ladCode);
    if (!row || !la) continue;
    out.push({ code: p.code, name: p.name, slug: p.slug, claimants: row.claimants, shareInArea: la.postcodeShare });
  }
  return out.sort((a, b) => b.shareInArea - a.shareInArea);
}

/** "all of its postcodes" or "86% of its postcodes". */
export function describePostcodeShare(share: number): string {
  const pct = Math.round(share * 100);
  if (share >= 1) return "all of its postcodes";
  if (pct === 0) return "under 1% of its postcodes";
  if (pct === 100) return "over 99% of its postcodes";
  return `${pct}% of its postcodes`;
}
