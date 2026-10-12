import { describe, expect, it } from "vitest";
import { mkdtempSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { DEFAULTS, isV80Configuration, parseHpOptions } from "../scripts/model/lib/hp-options.mjs";
import { loadControlTotals } from "../scripts/model/lib/control-totals.mjs";

describe("forward model options", () => {
  it("defaults to the v8.0 configuration", () => {
    const o = parseHpOptions([], {});
    expect(o.groups).toBe("detailed");
    expect(o.snppCap).toBe(true);
    expect(o.capMode).toBe("total");
    expect(o.brexitDamp).toBe(true);
    expect(o.schoolCalibration).toBe(true);
    expect(o.format).toBe("site");
    expect(o.output).toBe(path.resolve(DEFAULTS.siteInput));
    expect(o.modelVersion).toBe("8.0-out-of-sample-calibrated");
    expect(o.successors2011).toBe(false);
    expect(isV80Configuration(o)).toBe(true);
    expect(isV80Configuration(parseHpOptions(["--successors-2011", "on"], {}))).toBe(false);
  });

  it("keeps the environment variables that already existed", () => {
    const o = parseHpOptions([], { HP_OUTPUT: "/tmp/x.json", BREXIT_DAMP: "0" });
    expect(o.output).toBe("/tmp/x.json");
    expect(o.brexitDamp).toBe(false);
    expect(isV80Configuration(o)).toBe(false);
  });

  it("lets a flag win over the environment", () => {
    expect(parseHpOptions(["--brexit-damp", "on"], { BREXIT_DAMP: "0" }).brexitDamp).toBe(true);
    expect(parseHpOptions(["--snpp-cap=off"], { HP_SNPP_CAP: "on" }).snppCap).toBe(false);
  });

  it("turns the ethnic blocks off and writes raw output in all-persons mode", () => {
    const o = parseHpOptions(["--groups", "all-persons", "--output", "/tmp/all.json"], {});
    expect(o.brexitDamp).toBe(false);
    expect(o.schoolCalibration).toBe(false);
    expect(o.format).toBe("raw");
    expect(o.runRecord).toBe("/tmp/all.json.run.json");
  });

  it("refuses an all-persons run with an ethnic block or a site write", () => {
    expect(() => parseHpOptions(["--groups", "all-persons", "--brexit-damp", "on"], {})).toThrow(/Brexit/);
    expect(() => parseHpOptions(["--groups", "all-persons", "--school-calibration", "on"], {})).toThrow(/School Census/);
    expect(() => parseHpOptions(["--groups", "all-persons", "--format", "site"], {})).toThrow(/site file/);
  });

  it("rejects unknown flags and bad values", () => {
    expect(() => parseHpOptions(["--snp-cap", "off"], {})).toThrow(/unknown flag/);
    expect(() => parseHpOptions(["--cap-mode", "region"], {})).toThrow(/cap-mode/);
    expect(() => parseHpOptions(["--snpp-cap", "maybe"], {})).toThrow(/on or off/);
  });
});

describe("control totals", () => {
  const dir = mkdtempSync(path.join(os.tmpdir(), "ukd-ct-"));

  it("extends an SNPP file beyond its last year the way v8.0 did", () => {
    const file = path.join(dir, "snpp.csv");
    writeFileSync(
      file,
      [
        '"AREA_CODE","AREA_NAME","COMPONENT","SEX","AGE_GROUP","2043","2047"',
        "E07000117,Burnley,Population,persons,All ages,100,108",
        "E07000117,Burnley,Population,persons,0,100,108",
      ].join("\n"),
    );
    const ct = loadControlTotals(file);
    expect(ct.total("E07000117", 2047)).toBe(108);
    // (108 - 100) / 4 = 2 a year, so 2051 is 108 + 2 * 4.
    expect(ct.total("E07000117", 2051)).toBe(116);
    expect(ct.hasCells).toBe(false);
    expect(() => ct.cell("E07000117", "M", 0, 2031)).toThrow(/age-sex/);
  });

  it("reads totals and cells from a control-totals JSON", () => {
    const file = path.join(dir, "ct.json");
    writeFileSync(
      file,
      JSON.stringify({
        years: [2031],
        ages: [0, 1, 90],
        areas: { E07000117: { M: { 2031: [1, 2, 3] }, F: { 2031: [4, 5, 6] } } },
      }),
    );
    const ct = loadControlTotals(file);
    expect(ct.total("E07000117", 2031)).toBe(21);
    expect(ct.cell("E07000117", "F", 90, 2031)).toBe(6);
    expect(ct.total("E07000117", 2041)).toBeUndefined();
    expect(ct.total("E09000033", 2031)).toBeUndefined();
  });
});
