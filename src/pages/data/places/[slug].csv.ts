import type { APIRoute, GetStaticPaths } from "astro";
import { COLUMNS, csvResponse, placeCodes, placeRows, toCsv } from "../../../lib/place-downloads";
import { slugifyAreaName } from "../../../lib/site";
import rawProjections from "../../../data/live/ethnic-projections.json";

export const prerender = true;

const names = (rawProjections as unknown as { areas: Record<string, { areaName: string }> }).areas;

export const getStaticPaths: GetStaticPaths = () =>
  placeCodes().map((code) => ({ params: { slug: slugifyAreaName(names[code].areaName) }, props: { code } }));

export const GET: APIRoute = ({ props }) => csvResponse(toCsv(COLUMNS, placeRows((props as { code: string }).code)));
