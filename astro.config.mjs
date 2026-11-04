import fs from "node:fs";
import { defineConfig } from "astro/config";

// Natural place URLs that returned 404 (roadmap R360): /places/bristol/ for the
// page built at /places/bristol-city-of/, and so on. The list and its source
// are in src/data/lookups/place-identities.json; the target is the slug the
// place page is built at, from the same rule as slugifyAreaName in
// src/lib/site.ts. tests/place-names.test.ts checks every stub lands on a
// built page and shadows none.
const placeIdentities = JSON.parse(fs.readFileSync(new URL("./src/data/lookups/place-identities.json", import.meta.url), "utf8"));
const placeAreas = JSON.parse(fs.readFileSync(new URL("./src/data/live/ethnic-projections.json", import.meta.url), "utf8")).areas;
const placeSlug = (name) => name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");
const placeRedirects = Object.fromEntries(
  Object.entries(placeIdentities.redirects).map(([from, code]) => [from, `/places/${placeSlug(placeAreas[code].areaName)}/`])
);

export default defineConfig({
  site: "https://ukdemographics.co.uk",

  redirects: {
    // The body of this finding was corrected to 86 on 13 August 2026, but the
    // slug still said 109 and the slug is what gets shared, linked and indexed.
    // A reader arriving from a search result or a pasted link saw a URL making
    // a claim the page itself retracts. Renamed, with the old URL preserved
    // here: GitHub Pages serves no server-side redirects, so Astro emits a
    // meta-refresh page with a canonical tag at the old path, which is what
    // search engines treat as a permanent move on a static host.
    "/findings/109-areas-minority-wbi-2051/":
      "/findings/86-areas-minority-wbi-2051/",

    // Same again: the Blackburn slug said 2028 while the headline, the stat, the
    // summary and the threshold in the model all said 2027.
    "/findings/blackburn-minority-wb-2028/":
      "/findings/blackburn-minority-wb-2027/",

    // Shepway District Council was renamed Folkestone and Hythe on 1 April
    // 2018. E07000112 is unchanged, but ethnic-projections.json still carried
    // the pre-2018 name, so the place slug (derived from areaName) built as
    // /places/shepway/ eight years after the rename. Old URL preserved here:
    // GitHub Pages serves no server-side redirects, so Astro emits a
    // meta-refresh page with a canonical tag at the old path, which is what
    // search engines treat as a permanent move on a static host.
    "/places/shepway/":
      "/places/folkestone-and-hythe/",

    ...placeRedirects,
  },
});
