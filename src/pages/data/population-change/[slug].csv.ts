import type { APIRoute, GetStaticPaths } from "astro";
import { CHANGE_CSV_COLUMNS, changeCodes, changeCsvRows, changeFor, changeOnsName } from "../../../lib/population-change";
import { csvResponse, toCsv } from "../../../lib/place-downloads";
import { slugifyAreaName } from "../../../lib/site";

export const prerender = true;

/** One CSV per council: each year's start, births, deaths, moves in and out and end, as ONS table MYEB3 publishes them. */
export const getStaticPaths: GetStaticPaths = () =>
  changeCodes().map((code) => ({ params: { slug: slugifyAreaName(changeOnsName(code)!) }, props: { code } }));

export const GET: APIRoute = ({ props }) =>
  csvResponse(toCsv([...CHANGE_CSV_COLUMNS], changeCsvRows(changeFor((props as { code: string }).code)!)));
