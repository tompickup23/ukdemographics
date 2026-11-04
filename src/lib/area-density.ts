/**
 * Land area, population density and median age per local authority, as ONS publishes
 * them in the mid-year estimates workbook (MYE5 and MYE6). Read from
 * src/data/live/ons-mye5-density.json, built by scripts/build/build-mye5-density.mjs.
 *
 * A council with no row returns undefined and the page shows nothing: no figure is
 * borrowed from a neighbour, a parent county or an earlier year.
 */
import rawDensity from "../data/live/ons-mye5-density.json";
import rawManifest from "../../data/raw/manifests/ons_mye5_density.json";

export interface AreaDensity {
  /** Land area in square kilometres, MYE5 as published (no conversion). */
  areaSqKm: number;
  /** Usual residents per square kilometre of land, MYE5, rounded by ONS to a whole number. */
  densityPerSqKm: number;
  /** Median age in years, MYE6. */
  medianAge: number;
  /** The reference date, for example "2025-06-30". */
  referenceDate: string;
  /** For example "mid-2025". */
  period: string;
  densityTable: "MYE5";
  medianAgeTable: "MYE6";
  /** The workbook's title, for example "Mid-Year Population Estimates, England and Wales, June 2025". */
  edition: string;
  /** Publication date as the workbook's cover sheet gives it, for example "29 July 2026". */
  published: string;
  locators: { density: string; medianAge: string };
}

interface DensityFile {
  source: { title: string; published: string; referenceDate: string };
  missing: string[];
  areas: Record<string, { areaSqKm: number; densityPerSqKm: number; medianAge: number; locators: { density: string; medianAge: string } }>;
}
const file = rawDensity as unknown as DensityFile;
const period = `mid-${file.source.referenceDate.slice(0, 4)}`;

/**
 * Site areas the MYE5 table does not cover, with the reason. Empty for the mid-2025
 * edition: the workbook covers England and Wales on April 2024 boundaries, which takes
 * in every English and Welsh code in ethnic-projections.json. A future edition that
 * drops a code must add it here, and tests/area-density.test.ts fails until it does.
 */
export const KNOWN_MISSING: ReadonlyArray<{ code: string; reason: string }> = [];

export function getAreaDensity(code: string): AreaDensity | undefined {
  const a = file.areas[code];
  if (!a) return undefined;
  return {
    areaSqKm: a.areaSqKm,
    densityPerSqKm: a.densityPerSqKm,
    medianAge: a.medianAge,
    referenceDate: file.source.referenceDate,
    period,
    densityTable: "MYE5",
    medianAgeTable: "MYE6",
    edition: file.source.title,
    published: file.source.published,
    locators: a.locators
  };
}

/** The workbook's publication date, read from the fetch manifest's edition record. */
export const MYE5_PUBLISHED: string = (rawManifest as { edition: { published: string } }).edition.published;

export interface DensityAnswerLine {
  /** The figure, for example "Density: 4,567 people per sq km". */
  text: string;
  /** The ONS publication, table and publication date the figure is read from. */
  source: string;
}

/**
 * The two lines in the place answer box, after the Census count. Each names the ONS
 * publication, the table and the publication date from the manifest. Empty when the
 * council has no row.
 */
export function densityAnswerLines(code: string): DensityAnswerLine[] {
  const d = getAreaDensity(code);
  if (!d) return [];
  const publication = `ONS ${d.period} population estimates`;
  return [
    {
      text: `Density: ${d.densityPerSqKm.toLocaleString("en-GB")} people per sq km`,
      source: `${publication}, ${d.densityTable} (area and density), published ${MYE5_PUBLISHED}`
    },
    {
      text: `Median age: ${d.medianAge.toFixed(1)}`,
      source: `${publication}, ${d.medianAgeTable} (median age), published ${MYE5_PUBLISHED}`
    }
  ];
}
