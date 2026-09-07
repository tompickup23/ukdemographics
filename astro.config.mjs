import { defineConfig } from "astro/config";

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
  },
});
