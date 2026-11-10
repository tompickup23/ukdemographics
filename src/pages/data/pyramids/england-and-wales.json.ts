import type { APIRoute } from "astro";
import { ENGLAND_AND_WALES, PYRAMID_SOURCE, pyramidFor } from "../../../lib/age-pyramid";

export const prerender = true;

/** England and Wales by year, sex and single year of age: fetched only when a reader asks for the comparison outline. */
export const GET: APIRoute = () => {
  const p = pyramidFor(ENGLAND_AND_WALES)!;
  return new Response(
    JSON.stringify({ name: p.name, source: `${PYRAMID_SOURCE.publisher}, ${PYRAMID_SOURCE.fileName}, table ${PYRAMID_SOURCE.table}`, years: p.years, M: p.M, F: p.F }),
    { headers: { "Content-Type": "application/json; charset=utf-8" } }
  );
};
