/**
 * "Last updated" and "next update likely" for each place-page section
 * (roadmap R503, after the National Records of Scotland pattern).
 *
 * The dates live in src/data/lookups/release-calendar.json, which is the
 * register of what each date is and where it was read: the edition date of the
 * series a section shows (from the dataset manifests and data files the site
 * keeps, or the publisher's page where no manifest records it), and the
 * publisher's own statement of the next release, with its URL, a quote and
 * the access date. Where a publisher states no next release the line says so
 * in those words. Nothing here estimates a date.
 */
import calendar from "../data/lookups/release-calendar.json";

export const NOT_STATED = "next release not stated by the publisher";

export interface NextRelease {
  /** The publisher's wording of the date: "30 November 2026", "summer 2027". */
  stated: string;
  /** Present only when the publisher gives a full day. */
  isoDate: string | null;
  status: "confirmed" | "provisional" | "month only" | "season only" | "period only";
  url: string;
  quote: string;
  accessed: string;
}

export interface SeriesDates {
  id: string;
  label: string;
  publisher: string;
  /** Edition date of the series as the site holds it. */
  lastUpdated: string;
  /** Plain words on that date, such as "version 3; first published 29 November 2022". */
  lastUpdatedNote?: string;
  /** Where the edition date was read: a manifest field, a data file field or a publisher page. */
  editionFrom: string;
  sourceUrl: string;
  next: NextRelease | null;
  /** Where the publisher was checked when no next release is stated. */
  nextChecked?: { url: string; accessed: string; note: string };
  /** A later edition the publisher has already released and this section does not yet use. */
  newerEdition?: { label: string; published: string; url: string; accessed: string };
}

const cal = calendar as unknown as {
  series: Record<string, Omit<SeriesDates, "id">>;
  sections: Record<string, string[]>;
};

export function seriesDates(id: string): SeriesDates {
  const s = cal.series[id];
  if (!s) throw new Error(`release-calendar.json has no series "${id}"`);
  return { id, ...s };
}

/** The series behind a place-page section, in the order the line lists them. */
export function sectionSeries(sectionId: string): SeriesDates[] {
  const ids = cal.sections[sectionId];
  if (!ids) throw new Error(`release-calendar.json has no section "${sectionId}"`);
  return ids.map(seriesDates);
}

export function sectionIds(): string[] {
  return Object.keys(cal.sections);
}

export function allSeries(): SeriesDates[] {
  return Object.keys(cal.series).map(seriesDates);
}

/** "2026-07-29" to "29 July 2026". */
export function formatDay(iso: string): string {
  return new Date(`${iso.slice(0, 10)}T00:00:00Z`).toLocaleDateString("en-GB", {
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  });
}

export function lastUpdatedText(s: SeriesDates): string {
  return `last updated ${formatDay(s.lastUpdated)}${s.lastUpdatedNote ? ` (${s.lastUpdatedNote})` : ""}`;
}

/** "DWP has since published the figures to March 2026 (21 May 2026), not yet used here". */
export function newerEditionText(s: SeriesDates): string | null {
  if (!s.newerEdition) return null;
  return `${s.publisher} has since published ${s.newerEdition.label} (${formatDay(s.newerEdition.published)}), not yet used here`;
}

/** "next update likely 30 November 2026", "next update likely November 2026 (provisional)", or the not-stated wording. */
export function nextUpdateText(s: SeriesDates): string {
  if (!s.next) return NOT_STATED;
  const provisional = s.next.status === "provisional" ? " (provisional)" : "";
  return `next update likely ${s.next.stated}${provisional}, as ${s.publisher === "this site" ? "this site states" : `stated by ${s.publisher}`}`;
}
