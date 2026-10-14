/**
 * Image sitemap for the place share cards (maps plan v2.2, image SEO): each place page
 * with its population Open Graph card and population portrait. A separate file, so
 * sitemap.xml and the IndexNow parser that reads it stay as they are. The ethnicity
 * card is never listed (decision P2) and robots.txt keeps it out of Google Images.
 */
import type { APIRoute } from "astro";
import { buildAbsoluteUrl, getPublicPlaceAreas, slugifyAreaName } from "../lib/site";
import { cardPath, placeCardSpecs } from "../lib/map/cards";

export const prerender = true;

const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;");

export const GET: APIRoute = () => {
  const specs = placeCardSpecs().filter((c) => c.indicator === "population_change" && c.format === "png");
  const urls = getPublicPlaceAreas().map((a) => {
    const images = specs.map((c) => `    <image:image><image:loc>${esc(buildAbsoluteUrl(cardPath(a.areaCode, c)))}</image:loc></image:image>`).join("\n");
    return `  <url>\n    <loc>${esc(buildAbsoluteUrl(`/places/${slugifyAreaName(a.areaName)}/`))}</loc>\n${images}\n  </url>`;
  });
  const body = `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:image="http://www.google.com/schemas/sitemap-image/1.1">\n${urls.join("\n")}\n</urlset>\n`;
  return new Response(body, { headers: { "Content-Type": "application/xml; charset=utf-8" } });
};
