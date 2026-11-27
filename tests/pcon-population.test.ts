import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";

import {
  AGE_COUNT,
  EXPECTED_SEATS,
  ageFromLabel,
  checkPconTable,
  countFrom,
  readPconTable,
  sexFromLabel
} from "../scripts/lib/pcon-population.mjs";
import {
  ENGLAND_AND_WALES_POPULATION,
  PCON_POPULATION_LABEL,
  PCON_POPULATION_PUBLISHED_DAY,
  PCON_POPULATION_SOURCE,
  PCON_POPULATION_STATUS,
  getPconPopulation,
  midYearLabel,
  pconPopulationCodes,
  sharePct,
  summariseRows
} from "../src/lib/pcon-population";
import { buildConstituencyDescription } from "../src/lib/search-listing";
import { getAllPcons } from "../src/lib/pcon-data";

/**
 * Constituency population and age from the ONS small area release (register row R629).
 *
 * No published figure is pinned here. The reader is tested on tables made up in this
 * file, because no real table had been seen when it was written; the made-up counts
 * never leave the tests. The data file is checked in whichever state it is in: empty
 * while the release is awaited, and against the mid-year estimates file once built.
 */

const read = (p: string) => JSON.parse(fs.readFileSync(path.resolve(p), "utf8"));
const sum = (row: number[]) => row.reduce((a, b) => a + b, 0);

// A made-up seat: the count at each age depends on the seat number, sex and age only.
const counts = (seat: number, sex: "M" | "F") => Array.from({ length: AGE_COUNT }, (_, age) => 400 + seat * 3 + (sex === "F" ? 7 : 0) + (age % 11));
const ageLabel = (age: number) => (age === 90 ? "Aged 90+" : `Age ${age}`);
const englishCode = (i: number) => `E14${String(1063 + i).padStart(6, "0")}`;
const welshCode = (i: number) => `W07${String(81 + i).padStart(6, "0")}`;
const allCodes = [
  ...Array.from({ length: EXPECTED_SEATS.England }, (_, i) => englishCode(i)),
  ...Array.from({ length: EXPECTED_SEATS.Wales }, (_, i) => welshCode(i))
];

function longTable(codes: string[]): string {
  const lines = ["DATE,GEOGRAPHY_NAME,GEOGRAPHY_CODE,GENDER_NAME,C_AGE_NAME,MEASURES_NAME,OBS_VALUE"];
  codes.forEach((code, seat) => {
    const m = counts(seat, "M");
    const f = counts(seat, "F");
    lines.push(`2025,"Seat ${seat}, North",${code},Total,All Ages,Value,${sum(m) + sum(f)}`);
    lines.push(`2025,"Seat ${seat}, North",${code},Male,Aged 16 to 64,Value,${sum(m.slice(16, 65))}`);
    for (const [label, row] of [["Male", m], ["Female", f]] as const) {
      row.forEach((v, age) => lines.push(`2025,"Seat ${seat}, North",${code},${label},${ageLabel(age)},Value,${v}`));
    }
  });
  return lines.join("\n") + "\n";
}

function wideTable(codes: string[], style: "joined" | "split"): string {
  const ages = Array.from({ length: AGE_COUNT }, (_, age) => ageLabel(age));
  const lines = ['"Population estimates - small area"', '"ONS Crown Copyright Reserved"', "", '"date   :","2025"'];
  for (const [label, sex] of [["Total", "T"], ["Male", "M"], ["Female", "F"]] as const) {
    lines.push("", `"gender :","${label}"`, "");
    lines.push((style === "joined" ? ['"2024 parliamentary constituencies"'] : ['"mnemonic"', '"2024 parliamentary constituencies"']).concat(['"All Ages"'], ages.map((a) => `"${a}"`)).join(","));
    codes.forEach((code, seat) => {
      const row = sex === "T" ? counts(seat, "M").map((v, a) => v + counts(seat, "F")[a]) : counts(seat, sex);
      const lead = style === "joined" ? [`"${code} : Seat ${seat}"`] : [`"${code}"`, `"Seat ${seat}"`];
      lines.push(lead.concat([String(sum(row))], row.map((v) => (v > 999 ? `"${v.toLocaleString("en-GB")}"` : String(v)))).join(","));
    });
  }
  return lines.join("\r\n") + "\r\n";
}

describe("reading a constituency table", () => {
  it("reads age and sex labels and nothing else as a single year of age", () => {
    expect(ageFromLabel("Age 0")).toBe(0);
    expect(ageFromLabel("Age 89")).toBe(89);
    expect(ageFromLabel("Aged 90+")).toBe(90);
    expect(ageFromLabel("Age 90 and over")).toBe(90);
    for (const band of ["All Ages", "Aged 0 to 15", "Aged 16+", "Age 0 - 4", "Aged 5-9", "Aged 65+", "Age 91"]) expect(ageFromLabel(band), band).toBeNull();
    expect([sexFromLabel("Male"), sexFromLabel("Females"), sexFromLabel("Total"), sexFromLabel("Persons"), sexFromLabel("Other")]).toEqual(["M", "F", "T", "T", null]);
    expect([countFrom("1,234"), countFrom("0"), countFrom("12.5"), countFrom("-"), countFrom("")]).toEqual([1234, 0, null, null, null]);
  });

  it("reads a long table: one row per seat, sex and age", () => {
    const table = readPconTable(longTable(allCodes.slice(0, 3)));
    expect(table.layout).toBe("long");
    expect(table.seats.size).toBe(3);
    expect(table.dates).toEqual(["2025"]);
    const seat = table.seats.get(englishCode(1));
    expect(seat.name).toBe("Seat 1, North");
    expect(seat.M).toEqual(counts(1, "M"));
    expect(seat.F).toEqual(counts(1, "F"));
    expect(table.totals.get(englishCode(1))).toBe(sum(counts(1, "M")) + sum(counts(1, "F")));
  });

  it("reads a wide table: a block per sex, a column per age, in either naming style", () => {
    for (const style of ["joined", "split"] as const) {
      const table = readPconTable(wideTable([englishCode(0), welshCode(4)], style));
      expect(table.layout).toBe("wide");
      expect([...table.seats.keys()]).toEqual([englishCode(0), welshCode(4)]);
      expect(table.seats.get(welshCode(4)).name).toBe("Seat 1");
      expect(table.seats.get(welshCode(4)).M).toEqual(counts(1, "M"));
      expect(table.seats.get(welshCode(4)).F).toEqual(counts(1, "F"));
      expect(table.dates).toEqual(["2025"]);
    }
  });

  it("stops on a table it cannot read, and on a value that is not a count", () => {
    expect(() => readPconTable("Area,Value\nBurnley,1\n")).toThrow(/no constituency rows found/);
    expect(() => readPconTable(longTable([englishCode(0)]).replace(/,Male,Age 5,Value,\d+/, ",Male,Age 5,Value,c"))).toThrow(/is not a count/);
    const twice = longTable([englishCode(0)]);
    expect(() => readPconTable(twice + twice.split("\n").find((l) => l.includes(",Male,Age 7,")) + "\n")).toThrow(/two values/);
  });
});

describe("checks before any figure is written", () => {
  const full = readPconTable(longTable(allCodes));
  const add = (codes: string[]) => codes.reduce((a, c) => a + sum(full.seats.get(c).M) + sum(full.seats.get(c).F), 0);
  const countryTotals = {
    England: add(allCodes.slice(0, EXPECTED_SEATS.England)),
    Wales: add(allCodes.slice(EXPECTED_SEATS.England))
  };

  it("passes a whole table whose seats add to the two country totals", () => {
    expect(full.seats.size).toBe(575);
    expect(checkPconTable(full, { countryTotals })).toEqual([]);
  });

  it("names a missing seat, a short row and a country total that does not match", () => {
    const short = readPconTable(longTable(allCodes.slice(1)));
    expect(checkPconTable(short).join("; ")).toMatch(/542 English seats, expected 543/);

    const holed = readPconTable(longTable(allCodes).replace(new RegExp(`\\n[^\\n]*${welshCode(2)},Female,Age 40,[^\\n]*`), ""));
    expect(checkPconTable(holed).join("; ")).toMatch(new RegExp(`${welshCode(2)}: sex F does not have 91`));

    const off = checkPconTable(full, { countryTotals: { ...countryTotals, Wales: countryTotals.Wales + 1 } });
    expect(off).toHaveLength(1);
    expect(off[0]).toMatch(/Welsh seats add to/);
  });

  it("names a seat whose ages do not add to the table's own total", () => {
    const text = longTable(allCodes).replace(new RegExp(`(${englishCode(9)},Total,All Ages,Value,)(\\d+)`), (_, lead, n) => `${lead}${Number(n) + 5}`);
    expect(checkPconTable(readPconTable(text)).join("; ")).toMatch(new RegExp(`${englishCode(9)}: ages add to`));
  });
});

describe("the script that records a hand download", () => {
  const script = "scripts/fetch/adopt-ons-pcon-estimates.mjs";
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "pcon-adopt-"));
  // fetch() is replaced before the script loads: any request ends the run with 99.
  const trap = path.join(dir, "trap.mjs");
  fs.writeFileSync(trap, 'globalThis.fetch = () => { process.stderr.write("FETCH CALLED\\n"); process.exit(99); };\n');
  const run = (args: string[]) => spawnSync(process.execPath, ["--import", trap, script, ...args], { cwd: path.resolve("."), encoding: "utf8" });
  const flags = ["--reference-date", "2025-06-30", "--retrieved-at", "2026-12-01T10:00:00Z", "--retrieved-by", "hand", "--dry-run"];

  it("reads the file, reports it and writes nothing on a dry run, with no request", () => {
    const file = path.join(dir, "sample.csv");
    fs.writeFileSync(file, longTable(allCodes.slice(0, 4)));
    const out = run(["--adopt", file, ...flags]);
    expect(out.stderr).not.toContain("FETCH CALLED");
    expect(out.status, out.stderr).toBe(0);
    expect(out.stdout).toMatch(/would adopt sample\.csv [0-9a-f]{64} .*long layout, 4 seats/);
    expect(fs.existsSync(path.resolve("data/raw/ons_pcon_estimates/sample.csv"))).toBe(false);
  });

  it("refuses a workbook, a date that is not 30 June and a missing flag", () => {
    const book = path.join(dir, "sample.xlsx");
    fs.writeFileSync(book, "not a table");
    expect(run(["--adopt", book, ...flags]).status).toBe(2);
    const file = path.join(dir, "sample.csv");
    expect(run(["--adopt", file, "--reference-date", "2025-12-31", "--retrieved-at", "2026-12-01", "--retrieved-by", "hand"]).status).toBe(2);
    expect(run(["--adopt", file]).status).toBe(2);
  });

  it("has no request in it, and neither has the build script", () => {
    for (const f of [script, "scripts/build/build-pcon-population.mjs", "scripts/lib/pcon-population.mjs"]) {
      const code = fs.readFileSync(path.resolve(f), "utf8").split("\n").filter((l) => !/^\s*(\*|\/\/|\/\*)/.test(l)).join("\n");
      expect(code, f).not.toMatch(/\bfetch\(|https?\.request|node:https?/);
    }
  });
});

describe("the figures the page states", () => {
  it("works out the total, median age and three age bands from single years of age", () => {
    const M = Array.from({ length: AGE_COUNT }, () => 10);
    const F = Array.from({ length: AGE_COUNT }, () => 10);
    const s = summariseRows(M, F);
    expect(s.population).toBe(1820);
    expect([s.males, s.females]).toEqual([910, 910]);
    expect(s.bands).toEqual({ "0-17": 360, "18-64": 940, "65+": 520 });
    expect(s.bands["0-17"] + s.bands["18-64"] + s.bands["65+"]).toBe(s.population);
    expect(s.medianAge).toBeCloseTo(45.5, 6);
    expect(sharePct(360, 1820)).toBe("19.8%");
  });

  it("labels a 30 June date and refuses any other", () => {
    expect(midYearLabel("2025-06-30")).toBe("mid-2025");
    expect(midYearLabel(null)).toBeNull();
    expect(() => midYearLabel("2025-12-31")).toThrow();
  });

  it("puts the ONS figure in the description in place of the snapshot", () => {
    const d = buildConstituencyDescription("Burnley", { mp: true, pip: true, demographics: false, localAuthorities: true, populationLabel: "mid-2025" });
    expect(d).toMatch(/population and age at mid-2025/);
    expect(d).not.toMatch(/demographic snapshot/);
    expect(d).not.toMatch(/[‒-―]| - /);
    const before = buildConstituencyDescription("Burnley", { mp: true, pip: true, demographics: true, localAuthorities: true });
    expect(before).toMatch(/a demographic snapshot/);
  });
});

describe("pcon-population.json, in whichever state it is in", () => {
  const file = read("src/data/live/pcon-population.json");
  const pcons = getAllPcons();

  it("is either empty and awaiting the release, or built and sourced", () => {
    expect(["awaiting", "published"]).toContain(file.status);
    expect(PCON_POPULATION_STATUS).toBe(file.status);
    if (file.status === "awaiting") {
      expect(file.seats).toEqual({});
      expect(file.source).toBeNull();
      expect(file.referenceDate).toBeNull();
      expect(pconPopulationCodes()).toEqual([]);
      expect(ENGLAND_AND_WALES_POPULATION).toBeNull();
      expect(PCON_POPULATION_LABEL).toBeNull();
      expect(PCON_POPULATION_SOURCE).toBeNull();
      expect(PCON_POPULATION_PUBLISHED_DAY).toBeNull();
      for (const p of pcons) expect(getPconPopulation(p.code)).toBeNull();
      return;
    }
    const manifest = read("data/raw/manifests/ons_pcon_estimates.json");
    expect(file.source.publisher).toBe("Office for National Statistics");
    expect(file.source.title.length).toBeGreaterThan(20);
    expect(file.source.published).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(file.source.releaseUrl).toMatch(/^https:\/\/www\.ons\.gov\.uk\/releases\//);
    expect(file.source.fileSha256).toBe(manifest.current.fileSha256);
    expect(file.referenceDate).toBe(manifest.current.referenceDate);
    expect(file.source.datasetName).toBe(manifest.datasetName);
    expect(file.source.datasetUrl).toMatch(/^https:\/\/www\.nomisweb\.co\.uk\/datasets\//);
    expect(PCON_POPULATION_PUBLISHED_DAY).toMatch(/^\d{1,2} [A-Z][a-z]+ \d{4}$/);
  });

  it("once built, covers every English and Welsh seat and adds to the mid-year estimates", () => {
    if (file.status === "awaiting") return;
    const estimates = read("src/data/live/population-estimates.json");
    expect(file.referenceDate).toBe(estimates.source.referenceDate);
    const codes = Object.keys(file.seats);
    expect(codes.filter((c) => c.startsWith("E14"))).toHaveLength(EXPECTED_SEATS.England);
    expect(codes.filter((c) => c.startsWith("W07"))).toHaveLength(EXPECTED_SEATS.Wales);
    expect(codes.filter((c) => !/^(E14|W07)\d{6}$/.test(c))).toEqual([]);
    const add = (prefix: string) => codes.filter((c) => c.startsWith(prefix)).reduce((a, c) => a + sum(file.seats[c].M) + sum(file.seats[c].F), 0);
    expect(add("E14")).toBe(estimates.countries.E92000001.population);
    expect(add("W07")).toBe(estimates.countries.W92000004.population);
    expect(ENGLAND_AND_WALES_POPULATION?.population).toBe(estimates.countries.K04000001.population);
    for (const c of codes) {
      expect(file.seats[c].M).toHaveLength(AGE_COUNT);
      expect(file.seats[c].F).toHaveLength(AGE_COUNT);
    }
    for (const p of pcons) {
      const got = getPconPopulation(p.code);
      if (p.country === "England" || p.country === "Wales") expect(got?.population, p.name).toBeGreaterThan(0);
      else expect(got, p.name).toBeNull();
    }
  });
});

describe("the constituency page", () => {
  const page = fs.readFileSync(path.resolve("src/pages/constituencies/[slug].astro"), "utf8");

  it("draws the ONS section only for a seat with a figure, and the snapshot only without one", () => {
    expect(page).toContain('from "../../lib/pcon-population"');
    expect(page).toContain("const population = getPconPopulation(pcon.code);");
    expect(page).toContain("const demog = population ? null : getPconDemographics(pcon);");
    expect(page).toMatch(/\{population && populationSource && \(\s*<section class="section" id="population">/);
  });

  it("types no figure and names its source from the data file", () => {
    const section = page.slice(page.indexOf('id="population"'), page.indexOf('id="demographics"'));
    for (const field of ["publisher", "releaseUrl", "title", "geography", "datasetUrl", "datasetName"]) expect(section).toContain(`{populationSource.${field}}`);
    expect(section).toContain("{PCON_POPULATION_PUBLISHED_DAY}");
    expect(section).not.toMatch(/\d{2},\d{3}|\b20\d\d\b|\d+(\.\d+)?%/);
    expect(section).not.toMatch(/[‒-―]| - /);
  });
});
