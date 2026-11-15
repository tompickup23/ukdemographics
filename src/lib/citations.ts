/**
 * Documents by other bodies that cite the site (src/data/lookups/citations.json).
 * Read by the about page's "Where the figures have been used" section, the
 * Organization node's subjectOf, and llms.txt. tests/citations.test.ts checks that
 * every cited page and anchor still exists, so a citation in a published report
 * keeps landing where its author pointed it.
 */
import raw from "../data/lookups/citations.json";

export interface CitationCopy {
  body: string;
  title: string;
  url: string;
  page: number;
  note: string;
}

export interface Citation {
  id: string;
  title: string;
  reference?: string;
  author: string;
  preparedFor: string;
  datePublished: string;
  dateLabel: string;
  url: string;
  page: number;
  location: string;
  used: string;
  ukdPath: string;
  ukdLabel: string;
  accessedByAuthor: string;
  checked: string;
  checkedNote: string;
  alsoIn: CitationCopy[];
}

export const CITATIONS: Citation[] = [...(raw.citations as Citation[])].sort((a, b) =>
  b.datePublished.localeCompare(a.datePublished)
);

/** schema.org nodes for Organization.subjectOf: each citing report, with the page it cites. */
export function citationSubjectOf(siteUrl: string): Record<string, unknown>[] {
  return CITATIONS.map((c) => ({
    "@type": "Report",
    name: c.title,
    ...(c.reference ? { identifier: c.reference } : {}),
    url: c.url,
    datePublished: c.datePublished,
    author: { "@type": "Organization", name: c.author },
    sourceOrganization: { "@type": "GovernmentOrganization", name: c.preparedFor },
    citation: `${siteUrl}${c.ukdPath}`
  }));
}

/** "15 November 2026" from an ISO date, without the timezone shifting the day. */
export function citationDay(iso: string): string {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d)).toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" });
}
