import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

/**
 * This site does not set nationality or immigration data against crime. Two
 * unrendered files did (an asylum-rate and a NINo-registration correlation with
 * area crime rates) and were retired on 12 October 2026 under decision D7,
 * together with the code that wrote them. This keeps them retired: no data file
 * of that kind, and no script that writes one.
 */
const root = path.resolve(".");
const walk = (dir: string): string[] =>
  fs.readdirSync(path.join(root, dir), { withFileTypes: true }).flatMap((e) => {
    const rel = `${dir}/${e.name}`;
    if (e.isDirectory()) return e.name === "node_modules" || e.name === "__pycache__" ? [] : walk(rel);
    return [rel];
  });

const CRIME_CORRELATION = /crime[-_]?correlation|correlat\w*[-_ ]\w*crime|nino[-_]crime/i;

describe("no crime correlation output", () => {
  it("holds no crime correlation data file", () => {
    const files = walk("src/data").filter((f) => CRIME_CORRELATION.test(path.basename(f)));
    expect(files).toEqual([]);
  });

  it("has no script that writes one", () => {
    const writers = walk("scripts").filter((f) =>
      /(writeJSON|writeFileSync|OUT\s*=)[^\n]*(crime[-_]?correlation|nino[-_]crime)/i.test(
        fs.readFileSync(path.join(root, f), "utf8")
      )
    );
    expect(writers).toEqual([]);
  });
});
