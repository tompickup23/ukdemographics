import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { parseHpOptions } from "../scripts/model/lib/hp-options.mjs";
import { newCapStats, ratioSettings } from "../scripts/model/lib/hp-core.mjs";
import {
  isV80Run, methodologyText, stochasticSentence, V80_METHODOLOGY, V80_STOCHASTIC_SENTENCE,
} from "../scripts/model/lib/hp-methodology.mjs";

/**
 * The methodology string (V81_READINESS.md, blocker 5). A v8.0 run must write
 * the v8.0 text byte for byte; any other run must describe what it used.
 */
const published = JSON.parse(readFileSync("src/data/live/ethnic-projections.json", "utf8"));
const DASHES = /[–—]| - |&[mn]dash;/;

describe("v8.0 methodology text", () => {
  it("is the published text: the forward model's part then the stochastic sentence", () => {
    expect(V80_METHODOLOGY + V80_STOCHASTIC_SENTENCE).toBe(published.methodology);
  });

  it("is what a default run writes", () => {
    const opts = parseHpOptions([], {});
    const settings = ratioSettings({});
    expect(isV80Run(opts, settings)).toBe(true);
    const text = methodologyText({ opts, settings, base2021: { areas: {} }, projected: [], control: null, capStats: newCapStats(), schoolData: null });
    expect(text).toBe(V80_METHODOLOGY);
    expect(stochasticSentence({ opts, settings, simulations: 1000 })).toBe(V80_STOCHASTIC_SENTENCE);
  });

  it("is not written once a ratio setting changes", () => {
    const opts = parseHpOptions([], {});
    const settings = ratioSettings({ CCR_CEILING: "2" });
    expect(isV80Run(opts, settings)).toBe(false);
    const text = methodologyText({ opts, settings, base2021: { areas: {} }, projected: ["E07000117"], control: null, capStats: newCapStats(), schoolData: null });
    expect(text).not.toBe(V80_METHODOLOGY);
    expect(text).toContain("growth ceiling of 2");
    expect(text).toContain("not the settings selected on the out-of-sample test");
  });
});

describe("composed methodology text", () => {
  const opts = parseHpOptions(
    ["--base", "/tmp/base.json", "--countries-2011", "E,W", "--successors-2011", "on", "--control-totals", "/tmp/ct.json", "--cap-mode", "age-sex", "--model-version", "8.1"],
    {},
  );
  const settings = ratioSettings({});
  const base2021 = {
    estimatedAreas: { E07000124: {}, W06000001: {} },
    aggregatedAreas: { E06000066: {} },
    areas: {},
  };
  const control = {
    kind: "control-totals-json",
    label: "UKD v8.1 control totals (npp-level)",
    meta: {
      construction: "UKD's own construction from published ONS and Welsh Government series. Not an ONS or Welsh Government projection.",
      yearSources: [
        { years: "2022 to 2024", areas: "England and Wales", source: "ONS mid-year estimates, detailed time series MYEB1, as revised 29 July 2026" },
      ],
      assumptions: [
        "After mid-2047 each cell's growth ratio since mid-2025 is extended in a straight line from its mid-2043 to mid-2047 change and held at the mid-2047 value where the line would go negative. This is UKD's assumption; the SNPP ends at mid-2047.",
        "After mid-2047 each cell's growth ratio since mid-2025 is extended in a straight line from its mid-2043 to mid-2047 change and held at the mid-2047 value where the line would go negative. This is UKD's assumption; the Welsh Government projection ends at mid-2047.",
      ],
      sources: [
        { id: "ons_npp_2024_england", file: "data/raw/ons_npp_england/en1.zip", title: "National population projections: 2024-based", published: "Date published: 28 April 2026", projection: "Projection: Principal projection", used: "sheet Population" },
        { id: "wg_lapp_2022", file: "data/raw/wg_lapp/x.csv", title: "2022-based population projections by local authority", variant: "Principal projection", used: "principal projection, males and females" },
      ],
    },
  };
  const capStats = { ...newCapStats(), emptyCells: 16 };
  const projected = ["E07000117", "E07000124", "E06000066", "E06000060", "W06000001", "W06000015"];
  const names = { E07000124: "Ribble Valley", W06000001: "Isle of Anglesey", E06000066: "Somerset", E06000060: "Buckinghamshire" };
  const text = methodologyText({
    opts, settings, base2021, projected, names, successorsSummed: ["E06000060", "E06000066"], control, capStats,
    schoolData: { source: "DfE School Census 2024/25 (spc_pupils_ethnicity_and_language.csv)", areas: [] }, calibratedAreas: 3,
  });

  it("names the version, the coverage and Wales", () => {
    expect(text).toMatch(/^Hamilton-Perry single-year-of-age model, version 8\.1, with 20 ethnic groups, projecting 6 authorities \(4 in England, 2 in Wales\)\./);
    expect(text).toContain("for English and Welsh authorities");
  });

  it("lists the estimated bases and says they are estimates", () => {
    expect(text).toContain("The bases of 2 authorities are estimates, not observations");
    expect(text).toContain("Ribble Valley (E07000124) and Isle of Anglesey (W06000001)");
    expect(text).toContain("Census 2021 RM032");
    expect(text).toContain("4 authorities are direct observations, of which 1 April 2023 unitary is the sum of its 2022 districts: Somerset (E06000066)");
  });

  it("names the successor sums", () => {
    expect(text).toContain("2 authorities whose code changed after 2011 take the summed 2011 counts");
    expect(text).toContain("Buckinghamshire (E06000060) and Somerset (E06000066)");
  });

  it("describes the control totals, their sources and the straight-line extension once", () => {
    expect(text).toContain("Control totals: UKD v8.1 control totals (npp-level).");
    expect(text).toContain("2022 to 2024 (England and Wales), ONS mid-year estimates");
    expect(text.match(/After mid-2047/g)).toHaveLength(1);
    expect(text).toContain("This is UKD's assumption; the SNPP ends at mid-2047 and the Welsh Government projection ends at mid-2047.");
    expect(text).toContain("ONS, National population projections: 2024-based (Principal projection), sheet Population, published 28 April 2026, en1.zip");
    expect(text).toContain("Welsh Government, 2022-based population projections by local authority, principal projection, males and females, x.csv");
  });

  it("describes the cap mode with the run's own count of empty cells", () => {
    expect(text).toContain("Cap mode age-sex");
    expect(text).toContain("16 authority, sex, age and year cells had a positive control total and no modelled person");
  });

  it("describes the adjustments", () => {
    expect(text).toContain("Brexit adjustment to White Other");
    expect(text).toContain("School Census calibration from DfE School Census 2024/25");
    expect(text).toContain("in 3 authorities");
  });

  it("uses no dashes as punctuation", () => {
    expect(text).not.toMatch(DASHES);
    expect(stochasticSentence({ opts, settings, simulations: 1000 })).not.toMatch(DASHES);
  });

  it("gives a stochastic sentence that does not claim the v8.0 basis", () => {
    const s = stochasticSentence({ opts, settings, simulations: 1000 });
    expect(s).not.toBe(V80_STOCHASTIC_SENTENCE);
    expect(s).toContain("has not been re-derived for this configuration");
  });

  it("says when there is no cap", () => {
    const off = parseHpOptions(["--snpp-cap", "off"], {});
    const t = methodologyText({ opts: off, settings, base2021: { areas: {} }, projected: ["E07000117"], control: null, capStats: newCapStats(), schoolData: null });
    expect(t).toContain("No population control total is applied (cap off).");
  });
});
