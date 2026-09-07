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
      "/findings/92-areas-minority-wbi-2051/",

    // Renamed again on 7 September 2026, same reason. The body said 86 while its
    // own parts summed to 92: 59 areas majority today plus 33 already below 50%
    // at the 2021 Census. Both old slugs point at the corrected one.
    "/findings/86-areas-minority-wbi-2051/":
      "/findings/92-areas-minority-wbi-2051/",
  },
});
