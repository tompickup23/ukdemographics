import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

/**
 * No transform may type its lastUpdated, its release date or a coverage count.
 * Those come from the file read (scripts/lib/source_dates.py), because a typed
 * value goes stale the moment the script reads a newer file: citizenship.json
 * said "year ending June 2026" beside the March edition's release date.
 *
 * The scan looks for an ISO date literal assigned to lastUpdated, release_date or
 * SNAPSHOT_DATE, as a dict key or a variable, and for "coverage N of M" written
 * into a string.
 */
const EXCLUDED: Record<string, string> = {
  // No raw input: hand-curated from cited reports, so its date is the curation date.
  "transform_nhs_funding_context.py": "hand-curated, no file to read a date from"
};

const TYPED_DATE =
  /["']?\b(lastUpdated|release_date|SNAPSHOT_DATE)\b["']?\]?\s*[:=]\s*f?["']\d{4}-\d{2}-\d{2}["']/;
const TYPED_COVERAGE = /coverage\s+\d+\s+of\s+\d+/i;

function typedDates(source: string): string[] {
  return source
    .split("\n")
    .map((line, i) => ({ line: line.trim(), n: i + 1 }))
    .filter(({ line }) => !line.startsWith("#"))
    .filter(({ line }) => TYPED_DATE.test(line) || TYPED_COVERAGE.test(line))
    .map(({ line, n }) => `${n}: ${line}`);
}

const dir = path.resolve("scripts/transform");
const transforms = fs.readdirSync(dir).filter((f) => /^transform_.*\.py$/.test(f));

describe("transforms derive their dates from the file read", () => {
  it("catches a planted typed date and a typed coverage count", () => {
    expect(typedDates('        "lastUpdated": "2026-04-28",')).toHaveLength(1);
    expect(typedDates("SNAPSHOT_DATE = '2026-04-28'")).toHaveLength(1);
    expect(typedDates('    out["release_date"] = "2026-05-21"')).toHaveLength(1);
    expect(typedDates('"by each force (force coverage 36 of 45 forces in window). "')).toHaveLength(1);
    expect(typedDates('        "lastUpdated": published_date(XLSX).isoformat(),')).toEqual([]);
  });

  it("lists only exclusions that still exist", () => {
    for (const f of Object.keys(EXCLUDED)) expect(transforms, `${f} is excluded but gone`).toContain(f);
  });

  for (const f of transforms.filter((t) => !(t in EXCLUDED))) {
    it(`${f} types no lastUpdated, release date or coverage count`, () => {
      expect(typedDates(fs.readFileSync(path.join(dir, f), "utf8"))).toEqual([]);
    });
  }
});
