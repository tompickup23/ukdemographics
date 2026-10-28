import type { APIRoute } from "astro";
import { COLUMNS, csvResponse, placeCodes, placeRows, toCsv } from "../../lib/place-downloads";

export const prerender = true;

export const GET: APIRoute = () => csvResponse(toCsv(COLUMNS, placeCodes().sort().flatMap(placeRows)));
