import fs from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

import {
  AREA_CODE_ALIASES,
  ALIAS_AREA_CODES,
  canonicalAreaCode,
  isAliasAreaCode
} from "../src/lib/area-codes";
import rawProjections from "../src/data/live/ethnic-projections.json";

const LIVE_DIR = path.resolve("src/data/live");
const AREA_CODE = /^[ENSWK]\d{8}$/;

const projections = rawProjections as { areas: Record<string, { areaName?: string }> };

/** Every code-keyed map in a live data file, found by key shape rather than by name. */
function codeKeyedMaps(
  value: unknown,
  keyPath: string,
  found: Array<{ keyPath: string; map: Record<string, unknown> }> = []
): Array<{ keyPath: string; map: Record<string, unknown> }> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return found;

  const record = value as Record<string, unknown>;
  const keys = Object.keys(record);
  const codeKeys = keys.filter((k) => AREA_CODE.test(k));
  if (codeKeys.length > 0 && codeKeys.length === keys.length) {
    found.push({ keyPath: keyPath || "(root)", map: record });
    return found;
  }

  for (const [k, v] of Object.entries(record)) {
    codeKeyedMaps(v, keyPath ? `${keyPath}.${k}` : k, found);
  }
  return found;
}

const liveFiles = fs
  .readdirSync(LIVE_DIR)
  .filter((f) => f.endsWith(".json"))
  .sort();

/** The per-authority layers generate_national_dashboards.mjs builds from the projections. */
const DERIVED_FROM_PROJECTIONS = [
  "dependency-ratios.json",
  "economic-profile.json",
  "ethnic-projections.json",
  "fiscal-resilience.json",
  "health-demand.json",
  "housing-demand.json",
  "language-projections.json",
  "school-pressure.json"
];

describe("canonicalAreaCode", () => {
  it("resolves a reissued code onto the code the area record is filed under", () => {
    // Barnsley and Sheffield were reissued by the Barnsley and Sheffield
    // (Boundary Change) Order 2024, effective 1 April 2025. The Census 2021
    // base this model is built on, and the LAD24 boundary file, still carry the
    // codes on the right of these assertions.
    expect(canonicalAreaCode("E08000038")).toBe("E08000016");
    expect(canonicalAreaCode("E08000039")).toBe("E08000019");
  });

  it("passes through every code that is not an alias", () => {
    expect(canonicalAreaCode("E08000025")).toBe("E08000025");
    expect(canonicalAreaCode("E08000016")).toBe("E08000016");
    expect(isAliasAreaCode("E08000016")).toBe(false);
    expect(isAliasAreaCode("E08000038")).toBe(true);
  });

  it("points every alias at a record that exists", () => {
    // An alias resolving to a code with no area record is worse than no alias:
    // the lookup still misses, and the map says the problem is handled.
    for (const canonical of Object.values(AREA_CODE_ALIASES)) {
      expect(Object.keys(projections.areas)).toContain(canonical);
    }
  });
});

describe("ethnic-projections.json area map", () => {
  it("holds one record per authority", () => {
    // Barnsley and Sheffield were each filed twice, under both their Census
    // code and their reissued code, with projections from two different model
    // runs: Barnsley's 2041 White British share read 85.7% under one and 77.6%
    // under the other. /places listed 320 rows for 318 authorities and every
    // national aggregate that walked this map counted 801,000 people twice.
    const seen = new Map<string, string[]>();
    for (const [code, area] of Object.entries(projections.areas)) {
      const name = area.areaName;
      if (!name) continue;
      seen.set(name, [...(seen.get(name) ?? []), code]);
    }

    const duplicated = [...seen.entries()]
      .filter(([, codes]) => codes.length > 1)
      .map(([name, codes]) => `${name}: ${codes.join(", ")}`);

    expect(duplicated).toEqual([]);
  });

  it("names every area it holds", () => {
    // A record with no areaName is invisible to the duplicate check above, so
    // the check has to be able to see all of them for its zero to mean anything.
    const unnamed = Object.entries(projections.areas)
      .filter(([, area]) => !area.areaName)
      .map(([code]) => code);

    expect(unnamed).toEqual([]);
  });

  it("would catch a duplicate if one returned", () => {
    // The guard above reports zero. This is the fixture that proves the zero is
    // a result rather than a structural impossibility.
    const withDuplicate = {
      E08000016: { areaName: "Barnsley" },
      E08000038: { areaName: "Barnsley" },
      E08000025: { areaName: "Birmingham" }
    };
    const seen = new Map<string, string[]>();
    for (const [code, area] of Object.entries(withDuplicate)) {
      seen.set(area.areaName, [...(seen.get(area.areaName) ?? []), code]);
    }
    const duplicated = [...seen.entries()].filter(([, codes]) => codes.length > 1);

    expect(duplicated).toHaveLength(1);
    expect(duplicated[0][1]).toEqual(["E08000016", "E08000038"]);
  });
});

describe("live data files", () => {
  it("file no area record under an alias code", () => {
    // scripts/model/canonicalise_area_codes.mjs runs after the model and folds
    // these out. This is what fails when a generator that has not been made
    // alias-aware puts one back.
    const offenders: string[] = [];

    for (const file of liveFiles) {
      let data: unknown;
      try {
        data = JSON.parse(fs.readFileSync(path.join(LIVE_DIR, file), "utf8"));
      } catch {
        continue;
      }
      for (const { keyPath, map } of codeKeyedMaps(data, "")) {
        for (const alias of ALIAS_AREA_CODES) {
          if (alias in map) offenders.push(`${file} ${keyPath}: ${alias}`);
        }
      }
    }

    expect(offenders).toEqual([]);
  });

  it("hold one record per authority in every layer derived from the projections", () => {
    // Scoped rather than universal, because a repeated areaName is not always a
    // duplicate authority: school-eal.json files all thirteen Kent districts
    // under the county's name, since DfE publishes that series at county level.
    // These eight are the layers generated per authority from the projections,
    // where a repeated name can only mean the authority was filed twice.
    const offenders: string[] = [];

    for (const file of DERIVED_FROM_PROJECTIONS) {
      let data: unknown;
      try {
        data = JSON.parse(fs.readFileSync(path.join(LIVE_DIR, file), "utf8"));
      } catch {
        continue;
      }
      for (const { keyPath, map } of codeKeyedMaps(data, "")) {
        const seen = new Map<string, string[]>();
        for (const [code, record] of Object.entries(map)) {
          const name = (record as { areaName?: string } | null)?.areaName;
          if (!name) continue;
          seen.set(name, [...(seen.get(name) ?? []), code]);
        }
        for (const [name, codes] of seen) {
          if (codes.length > 1) offenders.push(`${file} ${keyPath}: ${name} (${codes.join(", ")})`);
        }
      }
    }

    expect(offenders).toEqual([]);
  });
});
