/**
 * Find the current version of a GOV.UK statistics file.
 *
 * Every Home Office dataset this site uses sits at a URL containing both a release
 * period and a media hash, so a hardcoded link goes stale at the next release and keeps
 * working, silently, on old data.
 *
 * That is exactly what happened here. Until 28 Aug 2026 this repo had no fetch script
 * for Home Office data at all: the files in data/raw/ho_visas and ho_visas_extra were
 * downloaded by hand, so the June 2026 release left seven of them a quarter behind with
 * nothing to say so. The transforms already resolve the newest file on disk
 * (scripts/lib/newest_release.py), which meant a missed download degraded quietly to
 * last quarter's numbers rather than failing.
 *
 * So: name the stable part of the filename, name the page that lists it, and let the
 * code find the newest. Throw rather than fall back, because a silent fallback is the
 * failure this module exists to prevent.
 *
 * Ported from the asylumstats repo (scripts/lib/govuk-discover.mjs), which solved the
 * same problem first. Keep the two in step by hand.
 */

const MONTHS = {
  jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6,
  jul: 7, aug: 8, sep: 9, oct: 10, nov: 11, dec: 12
};

/**
 * Sortable key from a filename's trailing period.
 *
 * Naming is not consistent on GOV.UK: alongside `-mar-2026` there is `-jun-24` with a
 * two-digit year, and the same series switched from .ods to .xlsx for one quarter. Both
 * are handled; anything unparseable sorts last rather than being silently treated as
 * old, so a new convention shows up as "not found" instead of quietly picking a
 * three-year-old file.
 */
export function periodKey(fileName) {
  const match = fileName
    .toLowerCase()
    .match(/-(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)-(\d{2}|\d{4})(?=[.-]|$)/);
  if (!match) return null;
  const [, month, rawYear] = match;
  const year = rawYear.length === 2 ? 2000 + Number(rawYear) : Number(rawYear);
  return year * 100 + MONTHS[month];
}

/**
 * The full month names GOV.UK uses in a release slug.
 *
 * The filename says `mar-2026`; the release it came from is published at
 * `.../immigration-system-statistics-year-ending-march-2026`. Two spellings of the same
 * quarter, and the site has to hold both: one to find the file, one to cite it.
 */
const MONTH_NAMES = [
  "january", "february", "march", "april", "may", "june",
  "july", "august", "september", "october", "november", "december"
];

/**
 * Everything a caller needs to name the release a file belongs to.
 *
 * Returns null for a filename with no parseable period, matching `periodKey`, so an
 * unrecognised convention surfaces as an explicit failure rather than a wrong citation.
 *
 *   periodParts("asylum-claims-datasets-mar-2026.xlsx")
 *   -> { key: 202603, year: 2026, month: 3, slug: "march-2026",
 *        suffix: "mar_2026", label: "Year ending March 2026" }
 */
export function periodParts(fileName) {
  const key = periodKey(fileName);
  if (key === null) return null;
  const year = Math.floor(key / 100);
  const month = key % 100;
  const name = MONTH_NAMES[month - 1];
  const abbr = Object.keys(MONTHS).find((candidate) => MONTHS[candidate] === month);
  return {
    key,
    year,
    month,
    slug: `${name}-${year}`,
    suffix: `${abbr}_${year}`,
    label: `Year ending ${name[0].toUpperCase()}${name.slice(1)} ${year}`
  };
}

/**
 * Every data asset linked from a GOV.UK page.
 *
 * Defaults to spreadsheets, which is what the quarterly series publish. Annual reports
 * publish their numbers in a PDF alongside a spreadsheet of core tables, so `extensions`
 * widens the net rather than forcing a second, near-identical scraper.
 */
export async function listDataFiles(pageUrl, { extensions = ["xlsx", "ods"] } = {}) {
  const response = await fetch(pageUrl, { headers: { "user-agent": "ukdemographics-data-fetch" } });
  if (!response.ok) throw new Error(`${pageUrl} returned ${response.status}`);
  const html = await response.text();
  const pattern = new RegExp(
    `https://assets\\.publishing\\.service\\.gov\\.uk/media/[^"' ]+\\.(?:${extensions.join("|")})`,
    "gi"
  );
  const urls = [...html.matchAll(pattern)].map((match) => match[0]);
  return [...new Set(urls)].map((url) => ({
    url,
    fileName: decodeURIComponent(url.split("/").pop())
  }));
}

/**
 * Files whose name matches `pattern`, for series with no period in the filename.
 *
 * The quarterly releases stamp a period into the filename, so `newestMatching` can sort
 * them. Annual reports do not: the 2025-26 accounts arrive as
 * `36.54_HO_ARA_25-26_WEB.pdf` and a core-tables workbook whose name records the date an
 * internal draft was shared. There is nothing to sort on, so the caller names the shape
 * it expects and gets everything that matches; an empty result throws rather than
 * silently leaving whatever is already on disk.
 */
export function allMatching(files, pattern, { pageUrl } = {}) {
  // A global regex carries lastIndex between .test() calls and would skip every other
  // file. Strip the flag rather than trusting the caller to remember.
  const stateless = new RegExp(pattern.source, pattern.flags.replace("g", ""));
  const matches = files.filter((file) => stateless.test(file.fileName));
  if (!matches.length) {
    throw new Error(
      `No file matching ${pattern} on ${pageUrl ?? "the publication page"}. ` +
        `The page listed ${files.length} data files; the naming convention has probably changed.`
    );
  }
  return matches;
}

/**
 * The newest file whose name starts with `stem`.
 *
 * Returns { url, fileName, periodKey }. Throws if nothing matches, naming the page, so
 * a layout or naming change is loud.
 */
export function newestMatching(files, stem) {
  const candidates = files
    .filter((file) => file.fileName.toLowerCase().startsWith(stem.toLowerCase()))
    .map((file) => ({ ...file, periodKey: periodKey(file.fileName) }))
    .filter((file) => file.periodKey !== null)
    .sort((a, b) => b.periodKey - a.periodKey);
  return candidates[0] ?? null;
}

export async function discover(pageUrl, stem) {
  const files = await listDataFiles(pageUrl);
  const newest = newestMatching(files, stem);
  if (!newest) {
    throw new Error(
      `No file starting "${stem}" with a parseable period on ${pageUrl}. ` +
        `The page listed ${files.length} data files; the naming convention has probably changed.`
    );
  }
  return newest;
}
