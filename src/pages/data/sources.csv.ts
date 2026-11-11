import type { APIRoute } from "astro";
import { csvResponse, SOURCES, toCsv } from "../../lib/place-downloads";
import { PYRAMID_BASE_YEAR, PYRAMID_PUBLISHED_DAY, PYRAMID_SOURCE, PYRAMID_SOURCE_ID } from "../../lib/age-pyramid";
import { CHANGE_BASE_YEAR, CHANGE_PUBLISHED_DAY, CHANGE_SOURCE, CHANGE_SOURCE_ID } from "../../lib/population-change";

export const prerender = true;

const COLUMNS = ["id", "publisher", "title", "table", "edition", "url", "file", "sha256", "note"];

/**
 * The age pyramid files (/data/pyramids/) draw on one more workbook. Its row is added
 * here and not to SOURCES, because SOURCES also writes the place page citation.
 */
const PYRAMID_ROW = {
  id: PYRAMID_SOURCE_ID,
  publisher: PYRAMID_SOURCE.publisher,
  title: PYRAMID_SOURCE.title,
  table: PYRAMID_SOURCE.table,
  edition: PYRAMID_PUBLISHED_DAY ? `published ${PYRAMID_PUBLISHED_DAY}` : "",
  url: PYRAMID_SOURCE.sourceUrl,
  file: PYRAMID_SOURCE.fileName,
  sha256: PYRAMID_SOURCE.fileSha256,
  note: `Estimated usual resident population at 30 June by sex and single year of age, every year from mid-${PYRAMID_BASE_YEAR}. Used by the age pyramid pages and their CSV files.`
};

/** The population change files (/data/population-change/) read table MYEB3 of the same workbook. */
const CHANGE_ROW = {
  id: CHANGE_SOURCE_ID,
  publisher: CHANGE_SOURCE.publisher,
  title: CHANGE_SOURCE.title,
  table: CHANGE_SOURCE.table,
  edition: CHANGE_PUBLISHED_DAY ? `published ${CHANGE_PUBLISHED_DAY}` : "",
  url: CHANGE_SOURCE.sourceUrl,
  file: CHANGE_SOURCE.fileName,
  sha256: CHANGE_SOURCE.fileSha256,
  note: `Components of population change (births, deaths, internal and international moves in and out, other changes) for each twelve months to 30 June from mid-${CHANGE_BASE_YEAR}. Used by the population change pages and their CSV files.`
};

export const GET: APIRoute = () =>
  csvResponse(toCsv(COLUMNS, [...(SOURCES as unknown as Array<Record<string, string>>), PYRAMID_ROW, CHANGE_ROW]));
