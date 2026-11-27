import type { APIRoute } from "astro";
import { buildReleasesFeed } from "../lib/releases";

export const prerender = true;

/** /feed.xml: the release diary as RSS 2.0. The entries and the builder are in src/lib/releases.ts. */
export const GET: APIRoute = () =>
  new Response(buildReleasesFeed(), {
    headers: { "Content-Type": "application/rss+xml; charset=utf-8" }
  });
