/**
 * Population and age for Westminster constituencies in England and Wales, from the
 * ONS small area release (register row R629).
 *
 * The figures are ONS's, by single year of age and sex, exactly as published. The file
 * is built by scripts/build/build-pcon-population.mjs from one query in the Nomis query tool, made in a browser,
 * and holds no seat until that has run: `status` is "awaiting" and every lookup here
 * returns null, so the constituency page draws nothing new. Scottish seats are not in
 * this release and never have a figure.
 *
 * Total, median age and the site's three age bands are worked out here from the
 * single years of age. Nothing is estimated.
 */
import rawPopulation from "../data/live/pcon-population.json";
import { medianAge } from "./age-pyramid";
import { formatDay } from "./section-dates";

interface SeatRows { name: string; M: number[]; F: number[] }
interface PopulationFile {
  status: "awaiting" | "published";
  source: {
    publisher: string; title: string; published: string; releaseUrl: string; datasetName: string; datasetReference: string;
    datasetUrl: string; route: string; geography: string; fileName: string; fileSha256: string; retrievedAt: string;
  } | null;
  referenceDate: string | null;
  englandAndWales: { name: string; population: number; M: number[]; F: number[] } | null;
  seats: Record<string, SeatRows>;
}
const data = rawPopulation as unknown as PopulationFile;

export const PCON_POPULATION_STATUS = data.status;
export const PCON_POPULATION_SOURCE = data.source;
export const PCON_POPULATION_REFERENCE_DATE = data.referenceDate;

/** "mid-2025" from "2025-06-30". Null while no figures are held. */
export function midYearLabel(referenceDate: string | null): string | null {
  if (referenceDate === null) return null;
  const m = /^(\d{4})-06-30$/.exec(referenceDate);
  if (!m) throw new Error(`${referenceDate} is not a 30 June reference date`);
  return `mid-${m[1]}`;
}
export const PCON_POPULATION_LABEL = midYearLabel(data.referenceDate);
export const PCON_POPULATION_DAY = data.referenceDate ? formatDay(data.referenceDate) : null;

export interface PopulationSummary {
  population: number;
  males: number;
  females: number;
  /** Interpolated within the year of age the midpoint falls in, as on the pyramid pages. */
  medianAge: number;
  /** The site's three age bands: 0 to 17, 18 to 64, 65 and over. */
  bands: { "0-17": number; "18-64": number; "65+": number };
}

const sum = (row: number[]) => row.reduce((a, b) => a + b, 0);

export function summariseRows(M: number[], F: number[]): PopulationSummary {
  const persons = M.map((v, age) => v + F[age]);
  const range = (from: number, to: number) => sum(persons.slice(from, to + 1));
  return {
    population: sum(persons),
    males: sum(M),
    females: sum(F),
    medianAge: medianAge(persons),
    bands: { "0-17": range(0, 17), "18-64": range(18, 64), "65+": range(65, persons.length - 1) }
  };
}

export function pconPopulationCodes(): string[] {
  return Object.keys(data.seats);
}

/** Null for a seat the release does not cover, and for every seat while no figures are held. */
export function getPconPopulation(code: string): PopulationSummary | null {
  const seat = data.seats[code];
  return seat ? summariseRows(seat.M, seat.F) : null;
}

/** The sum of every seat in the table, for the comparison beside each seat's figures. */
export const ENGLAND_AND_WALES_POPULATION: PopulationSummary | null = data.englandAndWales
  ? summariseRows(data.englandAndWales.M, data.englandAndWales.F)
  : null;

export const sharePct = (part: number, whole: number) => `${((part / whole) * 100).toFixed(1)}%`;

/** The day the release came out, as the page prints it. */
export const PCON_POPULATION_PUBLISHED_DAY = data.source ? formatDay(data.source.published) : null;
