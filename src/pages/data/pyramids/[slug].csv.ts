import type { APIRoute, GetStaticPaths } from "astro";
import { PYRAMID_CSV_COLUMNS, pyramidCodes, pyramidCsvRows, pyramidFor, pyramidOnsName } from "../../../lib/age-pyramid";
import { csvResponse, toCsv } from "../../../lib/place-downloads";
import { slugifyAreaName } from "../../../lib/site";

export const prerender = true;

/** One CSV per council: year, sex, single year of age and population, as ONS table MYEB1 publishes them. */
export const getStaticPaths: GetStaticPaths = () =>
  pyramidCodes().map((code) => ({ params: { slug: slugifyAreaName(pyramidOnsName(code)!) }, props: { code } }));

export const GET: APIRoute = ({ props }) =>
  csvResponse(toCsv([...PYRAMID_CSV_COLUMNS], pyramidCsvRows(pyramidFor((props as { code: string }).code)!)));
