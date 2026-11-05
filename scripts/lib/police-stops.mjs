/**
 * Plan a data.police.uk stop-and-search window from the /crimes-street-dates response.
 *
 * Pure, so the shape the publisher returns can be checked against fixtures in
 * tests/police-stops.test.ts without a request. The fetch
 * (scripts/fetch/fetch-stop-and-search.mjs) makes the requests this plan names.
 */

export const API = "https://data.police.uk/api";
export const DATES_URL = `${API}/crimes-street-dates`;
export const MONTHS_IN_WINDOW = 3;

const MONTH = /^\d{4}-(0[1-9]|1[0-2])$/;
// A force id becomes part of a file name, so it must be a bare slug.
const FORCE = /^[a-z0-9][a-z0-9-]*$/;

/**
 * The newest three months that list stop-and-search forces, every force listed for
 * them, and one file per force-month.
 *
 * Throws, naming the problem, if the response is not the list of
 * { date, "stop-and-search": [force, ...] } records data.police.uk documents, if a
 * month or force id is malformed, or if no month lists stop-and-search data.
 */
export function planWindow(dates) {
  if (!Array.isArray(dates)) {
    throw new Error(`${DATES_URL} did not return a list; the API's shape has changed`);
  }
  for (const d of dates) {
    if (!d || typeof d.date !== "string" || !MONTH.test(d.date)) {
      throw new Error(`${DATES_URL} returned a record without a YYYY-MM date: ${JSON.stringify(d).slice(0, 120)}`);
    }
    if (d["stop-and-search"] !== undefined && !Array.isArray(d["stop-and-search"])) {
      throw new Error(`${DATES_URL} returned a non-list "stop-and-search" for ${d.date}`);
    }
  }
  const months = [...dates]
    .filter((d) => (d["stop-and-search"] ?? []).length > 0)
    .sort((a, b) => b.date.localeCompare(a.date))
    .slice(0, MONTHS_IN_WINDOW)
    .map((d) => ({ date: d.date, forces: [...new Set(d["stop-and-search"])].sort() }));
  if (!months.length) {
    throw new Error(`${DATES_URL} listed no month with stop-and-search data`);
  }
  for (const m of months) {
    const bad = m.forces.find((f) => typeof f !== "string" || !FORCE.test(f));
    if (bad !== undefined) {
      throw new Error(`${DATES_URL} listed a force id that is not a bare slug for ${m.date}: ${JSON.stringify(bad)}`);
    }
  }
  const files = months.flatMap((m) =>
    m.forces.map((force) => ({
      force,
      date: m.date,
      url: `${API}/stops-force?force=${encodeURIComponent(force)}&date=${m.date}`,
      fileName: `${force}-${m.date}.json`
    }))
  );
  return {
    months,
    forcesListed: [...new Set(months.flatMap((m) => m.forces))].sort(),
    files
  };
}
