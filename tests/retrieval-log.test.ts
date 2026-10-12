import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { download, safeTarget } from "../scripts/lib/retrieval-log.mjs";

/**
 * The raw-file guard in the shared fetch helper. File names are built from publisher
 * responses, so a planted "../" must be refused before any request or write.
 */

const rawDir = fs.mkdtempSync(path.join(os.tmpdir(), "ukd-raw-"));

describe("safeTarget", () => {
  it("accepts a bare published file name inside the raw directory", () => {
    const name = "sen-api-provision_2025-26.json";
    expect(safeTarget(rawDir, name)).toBe(path.resolve(rawDir, name));
  });

  for (const bad of ["../evil.json", "..", "a/../../evil.ods", "sub/file.ods", "/etc/passwd", "..\\evil.ods", "", ".hidden"]) {
    it(`refuses ${JSON.stringify(bad)}`, () => {
      expect(() => safeTarget(rawDir, bad)).toThrow(/unsafe raw file name/);
    });
  }
});

describe("download", () => {
  it("refuses a planted ../ name before making any request or writing anything", async () => {
    // An unresolvable host: if the guard did not fire first, this would fail differently.
    await expect(download("https://example.invalid/x.ods", rawDir, "../planted.ods")).rejects.toThrow(/unsafe raw file name/);
    expect(fs.existsSync(path.join(rawDir, "..", "planted.ods"))).toBe(false);
  });
});
