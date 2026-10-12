import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

/**
 * /compare/ builds its tables in an inline script with appendRow(<tbody>, label, ...).
 * No crime row may sit in the same table as a migration or nationality row
 * (decision of 12 October 2026, under the house rule against nationality-to-crime
 * juxtaposition). Crime goes in its own block about local services and safety,
 * with its own heading and source line. This reads the page source and checks
 * which tbody each row is appended to.
 */
const src = fs.readFileSync(path.resolve("src/pages/compare.astro"), "utf8");

const rows = [...src.matchAll(/appendRow\(\s*(\w+)\s*,\s*(`[^`]*`|"[^"]*")/g)].map((m) => ({
  body: m[1],
  label: m[2].slice(1, -1)
}));

const CRIME = /crime|offen|police|prison/i;
const MIGRATION = /nino|nationalit|born|arriv|passport|migra|asylum|visa|EAL|white british|ethnic/i;

describe("/compare/ keeps crime apart from migration and nationality", () => {
  it("finds the rows, so the checks below are real", () => {
    expect(rows.filter((r) => CRIME.test(r.label)).length).toBeGreaterThan(0);
    expect(rows.filter((r) => MIGRATION.test(r.label)).length).toBeGreaterThan(0);
  });

  it("appends no crime row to a table that holds a migration or nationality row", () => {
    const migrationBodies = new Set(rows.filter((r) => MIGRATION.test(r.label)).map((r) => r.body));
    const clashes = rows.filter((r) => CRIME.test(r.label) && migrationBodies.has(r.body)).map((r) => r.label);
    expect(clashes).toEqual([]);
  });

  it("gives the crime table its own heading and source line", () => {
    const crimeBodies = new Set(rows.filter((r) => CRIME.test(r.label)).map((r) => r.body));
    expect(crimeBodies.size).toBe(1);
    expect(src).toMatch(/Local services and safety/);
    expect(src).toMatch(/crimeSource/);
  });
});
