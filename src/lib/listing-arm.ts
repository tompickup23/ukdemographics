/**
 * Search listing test, October 2026.
 *
 * Place pages ranked on page one for "<place> demographics" and "<place>
 * population" and drew a 0.3% click rate, against 6.7% for the postcode tool
 * and 2.4% for a constituency page with a plain description. Every place
 * listing led with the White British share and the population, which a search
 * results page already shows. The test rewrites the listing in two ways and
 * keeps today's copy as the control. Design and baseline: docs/seo/README.md.
 *
 * Assignment is a pure function of the page slug, so anyone can reproduce it
 * without this codebase:
 *
 *   1. Take the slug, the path segment after /places/ (e.g. "birmingham").
 *   2. Hash it with 32-bit FNV-1a: start at 0x811c9dc5; for each character,
 *      XOR its char code into the hash, then multiply by 0x01000193 modulo 2^32.
 *      Slugs are lower-case ASCII, so char codes and bytes are the same.
 *   3. Take the hash modulo 3: 0 is the control, 1 is arm A, 2 is arm B.
 *
 * "birmingham" hashes to 0xd4ab7d67 (3,568,008,551), which is 2 modulo 3, so
 * Birmingham is in arm B. tests/listing-arm.test.ts pins that example and the
 * committed assignment list, docs/seo/listing-arms-2026-10.csv.
 *
 * No salt. A salt picked after looking at the baseline would be a choice made
 * on the outcome, and the bare slug is the easiest rule to state.
 */

export type ListingArm = "control" | "A" | "B";

export const LISTING_ARMS: readonly ListingArm[] = ["control", "A", "B"];

export const LISTING_ARM_LABELS: Record<ListingArm, string> = {
  control: "Control: listing as before the test",
  A: "Arm A: breadth, no number",
  B: "Arm B: breadth with the data year",
};

export function fnv1a32(text: string): number {
  let hash = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    hash ^= text.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash >>> 0;
}

export function listingArmForSlug(slug: string): ListingArm {
  return LISTING_ARMS[fnv1a32(slug) % LISTING_ARMS.length];
}
