/**
 * The crossing below a 50% White British share is published as a decade between two
 * model years, never as a year interpolated between them (maps plan v2.2, issue I28).
 */
import fs from "node:fs";
import { describe, expect, it } from "vitest";
import rawProjections from "../src/data/live/ethnic-projections.json";
import { PROJECTION_DECADES, crossingDecade } from "../src/lib/crossing";
import { plausibleThrough } from "../src/lib/projection-plausibility";

const areas = (rawProjections as unknown as { areas: Record<string, any> }).areas;

describe("crossing decade", () => {
  it("returns only published model years, the decade where the projection first falls below half", () => {
    const bad: string[] = [];
    for (const [code, a] of Object.entries(areas)) {
      const d = crossingDecade(a);
      const now = a.current.census_groups.white_british;
      if (d === "already") { if (now >= 50) bad.push(`${code}: already, but ${now}`); continue; }
      if (d === null) continue;
      if (!(PROJECTION_DECADES as readonly number[]).includes(d.to)) bad.push(`${code}: ${d.to} is not a projection year`);
      if (d.from !== 2021 && !(PROJECTION_DECADES as readonly number[]).includes(d.from)) bad.push(`${code}: ${d.from}`);
      const through = plausibleThrough(a);
      if (through == null || d.to > through) bad.push(`${code}: ${d.to} beyond the horizon ${through}`);
      const before = d.from === 2021 ? now : a.projections[String(d.from)].white_british;
      const after = a.projections[String(d.to)].white_british;
      if (!(before >= 50 && after < 50)) bad.push(`${code}: ${before} to ${after}`);
    }
    expect(bad).toEqual([]);
  });

  it("is what the place page, the homepage and the places index print, with no interpolated year", () => {
    for (const f of ["src/pages/places/[slug].astro", "src/pages/index.astro", "src/pages/places/index.astro"]) {
      const src = fs.readFileSync(f, "utf8");
      expect(src, f).toContain("crossingDecade");
      expect(src, f).not.toMatch(/\* \(y2 - y1\)|projected to end around|Interpolated between projection decades|Crosses 50%<\/span>/);
    }
  });

  it("lists homepage areas A to Z within each decade, not by how soon", () => {
    const src = fs.readFileSync("src/pages/index.astro", "utf8");
    expect(src).toContain(".sort((a, b) => a.areaName.localeCompare(b.areaName))");
    expect(src).not.toContain("crossingSoon");
  });
});
