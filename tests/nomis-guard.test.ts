import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { NOMIS_API_PATTERN } from "../scripts/lib/nomis-guard.mjs";

/**
 * Nomis's robots.txt disallows its dataset API for all agents, so no script in
 * this repo may call it. The scripts that used to are listed here; each stops at
 * refuseNomisDatasetApi() before any request. A new caller anywhere under
 * scripts/ fails the first check, and a guard moved below a request, or removed,
 * fails the last.
 */
const GUARDED_SCRIPTS = [
  "scripts/fetch/fetch-census-2001-ethnicity-age.mjs",
  "scripts/fetch/fetch-census-2011-ethnicity-age.mjs",
  "scripts/fetch/fetch-census-2011-migration.mjs",
  "scripts/fetch/fetch-census-ethnicity.mjs",
  "scripts/fetch/fetch-country-of-birth.mjs",
  "scripts/fetch/fetch-econ-activity-passport.mjs",
  "scripts/fetch/fetch-economic-data.mjs",
  "scripts/fetch/fetch-nomis-census.mjs"
];
const GUARD = "scripts/lib/nomis-guard.mjs";

const root = path.resolve(".");
const walk = (dir: string): string[] =>
  fs.readdirSync(path.join(root, dir), { withFileTypes: true }).flatMap((e) => {
    const rel = `${dir}/${e.name}`;
    if (e.isDirectory()) return e.name === "node_modules" || e.name === "__pycache__" ? [] : walk(rel);
    return [rel];
  });

describe("no script calls the Nomis dataset API", () => {
  it("finds no caller outside the guarded scripts", () => {
    const callers = walk("scripts").filter((f) => NOMIS_API_PATTERN.test(fs.readFileSync(path.join(root, f), "utf8")));
    const unguarded = callers.filter((f) => f !== GUARD && !GUARDED_SCRIPTS.includes(f));
    expect(unguarded).toEqual([]);
  });

  it("guards every listed script before its first request", () => {
    for (const f of GUARDED_SCRIPTS) {
      const lines = fs.readFileSync(path.join(root, f), "utf8").split("\n");
      const code = (l: string) => !/^\s*(\*|\/\/|\/\*)/.test(l);
      const guardAt = lines.findIndex((l) => code(l) && /^refuseNomisDatasetApi\(/.test(l));
      const fetchAt = lines.findIndex((l) => code(l) && /\bfetch\(/.test(l));
      expect(guardAt, `${f}: no top-level refuseNomisDatasetApi() call`).toBeGreaterThan(-1);
      expect(guardAt, `${f}: guard comes after a request`).toBeLessThan(fetchAt === -1 ? Infinity : fetchAt);
    }
  });

  it("exits each guarded script before fetch() is reached", () => {
    // fetch() is replaced before the script loads: if it is ever called, the
    // process exits 99 and says so, and nothing goes over the network.
    const preload = path.join(fs.mkdtempSync(path.join(os.tmpdir(), "nomis-guard-")), "trap.mjs");
    fs.writeFileSync(preload, 'globalThis.fetch = () => { process.stderr.write("FETCH CALLED\\n"); process.exit(99); };\n');
    for (const f of GUARDED_SCRIPTS) {
      const run = spawnSync(process.execPath, ["--import", preload, f], { cwd: root, encoding: "utf8" });
      expect(run.stderr, f).not.toContain("FETCH CALLED");
      expect(run.status, `${f}\n${run.stderr}`).toBe(1);
      expect(run.stderr, f).toContain("robots.txt disallows the dataset API");
      expect(run.stderr, f).toContain(f);
    }
  });
});
