/**
 * One source of truth for how much of the country this site covers.
 *
 * The counts were hard-coded in seven places and four of them were wrong. The
 * nav claimed 320 authorities and the full complement of 650 Commons seats,
 * /compare/ claimed 320 as councils, the site description said 318, and the
 * homepage and constituency index computed 318 and 631 from the data and
 * disagreed with the nav on the same screen. 320 was pre-deduplication: Barnsley and
 * Sheffield each sat under two ONS codes until 29 August 2026 (see
 * src/lib/area-codes.ts), so every copy written before that date is stale by
 * exactly two. Nothing kept the copy and the data in step, so this module
 * derives both counts from the datasets the pages themselves render, and
 * tests/coverage.test.ts fails the build if a hard-coded count comes back.
 *
 * 650 is the size of the House of Commons, not a count of anything in the data,
 * so it stays a literal here. 631 of those 650 have a page because the PCON
 * dataset is built from the seats the GE 2024 join resolves.
 *
 * This module reads ethnic-projections.json rather than calling
 * getPublicPlaceAreas() from src/lib/site.ts, because site.ts imports this
 * module for DEFAULT_DESCRIPTION and the resulting cycle does not survive
 * Vite's SSR transform: an imported binding read during module evaluation
 * throws "Cannot access '__vite_ssr_import_0__' before initialization",
 * whichever module is entered first. Both counts are over the same object
 * getPublicPlaceAreas() enumerates, and tests/coverage.test.ts asserts the two
 * agree, so the equivalence is enforced rather than assumed.
 */
import rawProjections from "../data/live/ethnic-projections.json";
import { getAllPcons } from "./pcon-data";

/** Seats in the House of Commons. Not derived: this is the universe, not the coverage. */
export const PCON_UNIVERSE = 650;

/** Local authorities with a /places/ page, counted from the projections dataset. */
export const PLACE_COUNT = Object.keys(
  (rawProjections as unknown as { areas: Record<string, unknown> }).areas
).length;

/** Constituencies with a /constituencies/ page, counted from the PCON dataset. */
export const PCON_COUNT = getAllPcons().length;

/**
 * "318 local authorities". Pass a different noun where the surrounding copy
 * needs one ("councils", "areas"); the number is always the same number.
 */
export function formatPlaceCount(noun = "local authorities"): string {
  return `${PLACE_COUNT} ${noun}`;
}

/**
 * The count with its denominator, "631 of 650" plus the noun. The denominator
 * is always shown, because 631 on its own reads as a claim to cover every seat.
 */
export function formatPconCount(noun = "seats"): string {
  return `${PCON_COUNT} of ${PCON_UNIVERSE} ${noun}`;
}
