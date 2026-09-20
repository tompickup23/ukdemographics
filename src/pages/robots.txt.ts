import type { APIRoute } from "astro";
import { SITE_URL } from "../lib/site";

export const prerender = true;

export const GET: APIRoute = () =>
  new Response(`# Search and answer crawlers are explicitly permitted. The broad default\n# intentionally preserves the site's existing open-discovery policy.\nUser-agent: OAI-SearchBot\nAllow: /\n\nUser-agent: PerplexityBot\nAllow: /\n\nUser-agent: *\nAllow: /\n\nSitemap: ${SITE_URL}/sitemap.xml\n`, {
    headers: {
      "Content-Type": "text/plain; charset=utf-8"
    }
  });
