/**
 * Resolve the newest Home Office release file for a given filename stem.
 *
 * See scripts/lib/newest_release.py for the full reasoning; this is the JavaScript
 * half of the same fix. Home Office detailed datasets carry the release period in
 * the filename, and naming one literally in a script means it keeps working while
 * reading an older period than the one published.
 */
import { readdirSync, statSync } from "node:fs";
import path from "node:path";

const MONTHS = { jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6,
                 jul: 7, aug: 8, sep: 9, oct: 10, nov: 11, dec: 12 };

function period(name) {
  const m = name.toLowerCase().match(/-(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)-(\d{4})/);
  return m ? [Number(m[2]), MONTHS[m[1]]] : null;
}

// Latest four-digit year in a filename, for annual series with no month in the name.
// Orders files on disk only; the edition a transform reports is read from the file.
function year(name) {
  const years = [...name.matchAll(/(?<![0-9A-Za-z])((?:19|20)\d{2})(?![0-9A-Za-z])/g)].map((m) => Number(m[1]));
  return years.length ? [Math.max(...years), 0] : null;
}

// `by: "month"` (the default) orders on a `-mon-yyyy` period, as the Home Office names
// its files; `by: "year"` orders on the latest year in the name, for annual series.
export function newestRelease(directory, stem, exts = [".xlsx", ".ods"], { by = "month" } = {}) {
  if (by !== "month" && by !== "year") throw new Error(`by must be "month" or "year", not ${by}`);
  const keyer = by === "month" ? period : year;
  let best = null, bestKey = null;
  let entries = [];
  try {
    entries = readdirSync(directory);
  } catch {
    entries = [];
  }
  for (const name of entries) {
    if (!name.startsWith(stem)) continue;
    if (!exts.includes(path.extname(name).toLowerCase())) continue;
    const parsed = keyer(name);
    if (!parsed) continue;
    // Equal periods (a publisher replacing a file in place, kept beside the old one
    // under a hash suffix) resolve to the later download.
    const key = [...parsed, statSync(path.join(directory, name)).mtimeMs];
    if (!bestKey || key[0] > bestKey[0] || (key[0] === bestKey[0] && (key[1] > bestKey[1] || (key[1] === bestKey[1] && key[2] > bestKey[2])))) {
      best = path.join(directory, name);
      bestKey = key;
    }
  }
  if (!best) {
    throw new Error(
      `no release file for stem '${stem}' in ${directory}. ` +
      `Download the current file rather than pinning a period in the script.`
    );
  }
  return best;
}

export function periodLabel(filePath) {
  const key = period(path.basename(filePath));
  if (!key) return "unknown period";
  const names = ["", "January", "February", "March", "April", "May", "June", "July",
                 "August", "September", "October", "November", "December"];
  return `Year ending ${names[key[1]]} ${key[0]}`;
}

export function periodPhrase(filePath) {
  // 'year ending June 2026', for mid-sentence use. Lowercasing the whole label
  // would give 'year ending june 2026'.
  return periodLabel(filePath).replace("Year ending", "year ending");
}

/**
 * Annual and academic-year series: the JavaScript half of newest_edition() in
 * scripts/lib/newest_release.py. `pattern` is a RegExp matched against the whole file
 * name, with a named group `edition` holding the year to sort on and optionally a group
 * `month` holding a month name. Two files with one edition throw; nothing matching
 * throws, naming the directory and pattern.
 */
const MONTH_NAMES = ["january", "february", "march", "april", "may", "june", "july",
  "august", "september", "october", "november", "december"];

function editionKey(match) {
  let key = Number(match.groups.edition) * 100;
  const month = match.groups.month;
  if (month) {
    const word = month.toLowerCase();
    const index = MONTH_NAMES.indexOf(word) + 1 || MONTHS[word.slice(0, 3)];
    if (!index) throw new Error(`unrecognised month '${month}' in ${match.input}`);
    key += index;
  }
  return key;
}

export function editions(directory, pattern) {
  const whole = new RegExp(`^(?:${pattern.source})$`, pattern.flags.replace("g", "") || "i");
  let entries = [];
  try {
    entries = readdirSync(directory);
  } catch {
    entries = [];
  }
  const found = [];
  for (const name of entries) {
    const m = name.match(whole);
    if (!m) continue;
    if (!m.groups || m.groups.edition === undefined) {
      throw new Error(`pattern ${pattern} has no named group 'edition'`);
    }
    found.push({ key: editionKey(m), file: path.join(directory, name) });
  }
  found.sort((a, b) => a.key - b.key);
  for (let i = 1; i < found.length; i++) {
    if (found[i].key === found[i - 1].key) {
      throw new Error(`two files share one edition in ${directory}: ${found[i - 1].file} and ${found[i].file}`);
    }
  }
  return found.map((f) => f.file);
}

export function newestEdition(directory, pattern) {
  const found = editions(directory, pattern);
  if (!found.length) {
    throw new Error(
      `no file matching ${pattern} in ${directory}. ` +
      `Run the fetch script rather than pinning an edition in the script.`
    );
  }
  return found[found.length - 1];
}
