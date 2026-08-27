/**
 * Resolve the newest Home Office release file for a given filename stem.
 *
 * See scripts/lib/newest_release.py for the full reasoning; this is the JavaScript
 * half of the same fix. Home Office detailed datasets carry the release period in
 * the filename, and naming one literally in a script means it keeps working while
 * reading an older period than the one published.
 */
import { readdirSync } from "node:fs";
import path from "node:path";

const MONTHS = { jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6,
                 jul: 7, aug: 8, sep: 9, oct: 10, nov: 11, dec: 12 };

function period(name) {
  const m = name.toLowerCase().match(/-(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)-(\d{4})/);
  return m ? [Number(m[2]), MONTHS[m[1]]] : null;
}

export function newestRelease(directory, stem, exts = [".xlsx", ".ods"]) {
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
    const key = period(name);
    if (!key) continue;
    if (!bestKey || key[0] > bestKey[0] || (key[0] === bestKey[0] && key[1] > bestKey[1])) {
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
