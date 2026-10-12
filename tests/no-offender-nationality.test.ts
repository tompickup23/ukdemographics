import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

/**
 * This site does not set nationality or immigration data against offending.
 * `fno-bridge.json` joined the MoJ foreign national offender prison population by
 * nationality to NINo registrations by nationality. Nothing rendered it, and it was
 * retired on 12 October 2026 with the script that built it, under the house rule
 * against nationality-to-crime claims (the same treatment as the crime correlation
 * files in PR #78). This keeps it retired.
 */
const root = path.resolve(".");
const walk = (dir: string): string[] =>
  fs.readdirSync(path.join(root, dir), { withFileTypes: true }).flatMap((e) => {
    const rel = `${dir}/${e.name}`;
    if (e.isDirectory()) return e.name === "node_modules" || e.name === "__pycache__" ? [] : walk(rel);
    return [rel];
  });

const OFFENDER_FILE = /\bfno\b|fno[-_]|foreign[-_]national[-_]offender|prison[-_]population/i;

describe("no foreign national offender output", () => {
  it("holds no offender-by-nationality data file", () => {
    expect(walk("src/data").filter((f) => OFFENDER_FILE.test(path.basename(f)))).toEqual([]);
  });

  it("has no script that builds one", () => {
    const scripts = walk("scripts").filter(
      (f) => OFFENDER_FILE.test(path.basename(f)) || /moj_fno|fno-bridge|prison-population/i.test(fs.readFileSync(path.join(root, f), "utf8"))
    );
    expect(scripts).toEqual([]);
  });

  it("has no source or page that reads one", () => {
    const readers = walk("src").filter(
      (f) => /\.(astro|ts|tsx|mjs|js|md)$/.test(f) && /fno-bridge|fnoBridge|foreign national offender/i.test(fs.readFileSync(path.join(root, f), "utf8"))
    );
    expect(readers).toEqual([]);
  });
});
