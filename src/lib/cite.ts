/**
 * "How to cite this page" for place pages (roadmap R363). The citation is in
 * Harvard shape: the site as author, the year of the profile's revision, the
 * page's own title, the data editions behind the downloadable figures, the URL
 * and an access date the reader fills in. No individual is named.
 *
 * The editions are those of the per-place CSV (src/lib/place-downloads.ts), so
 * the citation and the download describe the same figures.
 */
import { SOURCES, placeCodes, placeCsvPath } from "./place-downloads";

export const CITE_AUTHOR = "UK Demographics";
export const ACCESSED_PLACEHOLDER = "[date]";

/** One entry per distinct edition: the five MYE tables share one workbook. */
export function citationEditions(): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const s of SOURCES) {
    const label = s.id.startsWith("ons-mye") ? s.title : `${s.title}, ${s.table}`;
    const text = s.edition ? `${label} (${s.edition})` : label;
    if (seen.has(text)) continue;
    seen.add(text);
    out.push(text);
  }
  return out;
}

export interface Citation {
  text: string;
  csvPath: string | null;
}

export function placeCitation(opts: { areaCode: string; areaName: string; title: string; url: string; year: string }): Citation {
  const editions = citationEditions().join("; ");
  const text = `${CITE_AUTHOR} (${opts.year}) ${opts.title}. Data: ${editions}. Available at: ${opts.url} (Accessed: ${ACCESSED_PLACEHOLDER}).`;
  return { text, csvPath: placeCodes().includes(opts.areaCode) ? placeCsvPath(opts.areaName) : null };
}
