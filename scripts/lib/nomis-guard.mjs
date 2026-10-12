/**
 * Stops a script before it makes any request to the Nomis dataset API.
 *
 * Nomis's robots.txt disallows its dataset API (nomisweb.co.uk/api/) for all
 * agents, and the data-fetch rules for this site follow robots.txt. The Census
 * tables these scripts pulled are fixed until the next census, and their raw
 * files are already held, so the scripts are kept for the record of how each
 * file was made but no longer run. Each one calls this guard after its imports
 * and before any other statement.
 *
 * To rebuild one of these files, work from the raw file already held, or from
 * the ONS download the guard names, through a new fetch script that follows
 * scripts/fetch/fetch-ons-mye.mjs (publisher page first, robots.txt checked,
 * every attempt recorded in data/raw/manifests/).
 *
 * tests/nomis-guard.test.ts fails if a script outside GUARDED_SCRIPTS mentions
 * the dataset API, and runs each guarded script to show it exits before fetch().
 */

export const NOMIS_API_PATTERN = /nomisweb\.co\.uk\/api/;

/**
 * @param {object} opts
 * @param {string} opts.script   Script path, for the message.
 * @param {string} opts.tables   The tables the script fetched, with Nomis ids.
 * @param {string[]} opts.held   Raw or output files already held, or [] if none.
 * @param {string[]} opts.ons    ONS pages carrying the same table, or [] if none identified.
 * @param {string} [opts.note]   Anything else the next person needs.
 */
export function refuseNomisDatasetApi({ script, tables, held, ons, note }) {
  const lines = [
    `${script}: stopped before any request.`,
    "Nomis robots.txt disallows the dataset API (nomisweb.co.uk/api/), so this script no longer calls it.",
    `Tables: ${tables}.`,
    "Use the files already held:",
    ...(held.length ? held.map((p) => `  ${p}`) : ["  none held"]),
    "Or the ONS download for the same table:",
    ...(ons.length ? ons.map((u) => `  ${u}`) : ["  not yet identified"]),
  ];
  if (note) lines.push(note);
  console.error(lines.join("\n"));
  process.exit(1);
}
