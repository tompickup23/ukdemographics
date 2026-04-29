/**
 * HESA "Where do HE students come from?" — International student counts
 * by domicile country and HE provider.
 *
 * STATUS: NEEDS MANUAL DOWNLOAD.
 *
 * HESA's website (www.hesa.ac.uk) is behind Cloudflare bot protection
 * that returns HTTP 403 to every automated client tested (curl, fetch,
 * Playwright with default UA). HESA also does not publish on data.gov.uk
 * or NOMIS. There is no programmatic route to the underlying CSV.
 *
 * Manual procedure (~5 min, one-off per academic-year refresh):
 *   1. Visit https://www.hesa.ac.uk/data-and-analysis/students/where-from
 *      in a browser.
 *   2. Click "Table 28: HE student enrolments by HE provider and country
 *      of permanent address" — academic year 2023/24 (or latest).
 *   3. Click "Download as CSV" beneath the table.
 *   4. Save the file to:
 *      data/raw/hesa/table_28_2023-24.csv
 *
 * Once the CSV is in place, run scripts/transform/transform_hesa.py to
 * produce src/data/live/international-students.json.
 *
 * This pattern follows the same convention as BES Wave 27 (see
 * .claude/rules/lessons.md — "registration-walled" data sources).
 */
import { existsSync } from "node:fs";
import path from "node:path";

const target = path.resolve("data/raw/hesa/table_28_2023-24.csv");
if (!existsSync(target)) {
  console.error("HESA Table 28 CSV not found at:");
  console.error("  " + target);
  console.error("");
  console.error("HESA is behind Cloudflare bot protection — manual download required.");
  console.error("Steps:");
  console.error("  1. Visit https://www.hesa.ac.uk/data-and-analysis/students/where-from");
  console.error("  2. Open Table 28, latest academic year");
  console.error("  3. Click 'Download as CSV'");
  console.error("  4. Save to " + target);
  process.exit(2);
}
console.log("HESA Table 28 CSV found at " + target);
