import type { APIRoute } from "astro";
import { csvResponse, SOURCES, toCsv } from "../../lib/place-downloads";

export const prerender = true;

const COLUMNS = ["id", "publisher", "title", "table", "edition", "url", "file", "sha256", "note"];

export const GET: APIRoute = () => csvResponse(toCsv(COLUMNS, SOURCES as unknown as Array<Record<string, string>>));
