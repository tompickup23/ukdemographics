import fs from "node:fs";
import { describe, expect, it } from "vitest";
import data from "../src/data/live/income-taxpayers-la.json";
import {
  AREA_SHEET, CI_SHEET, NATIONAL_SHEET, LA_CODE,
  buildDataset, loadBank, numeric, transformAreas, transformNational,
} from "../scripts/transform/transform-hmrc-spi-la.mjs";
import { DATASETS, newestRelease } from "../scripts/fetch/fetch-hmrc-spi-la.mjs";

const spi = loadBank(process.cwd(), "hmrc_spi");
const national = loadBank(process.cwd(), "hmrc_income_tax");
const areas = Object.values(data.areas);
const cloneBook = () => structuredClone(spi.book);
const first = areas.find(a => a.taxpayers !== null)!;

describe("HMRC local income taxpayers", () => {
  it("replays the committed output from the hash verified source workbooks", () => {
    expect(buildDataset()).toEqual(data);
    for (const source of Object.values(data.sources)) {
      const manifest = JSON.parse(fs.readFileSync(source.manifest, "utf8"));
      expect(source.sha256).toBe(manifest.current.fileSha256);
      expect(source.url).toBe(manifest.current.sourceUrl);
      expect(source.publishedAt).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      expect(Date.parse(source.retrievedAt)).toBeGreaterThanOrEqual(Date.parse(source.publishedAt));
    }
  });

  it("retains all 361 authority rows with both sheet locators and no aggregate rows", () => {
    expect(areas).toHaveLength(361);
    for (const [code, a] of Object.entries(data.areas)) {
      expect(code).toMatch(LA_CODE);
      expect(a.code).toBe(code);
      expect(a.name.length).toBeGreaterThan(0);
      expect(a.edition).toBe(data.edition);
      expect(a.publishedAt).toBe(data.sources.hmrc_spi.publishedAt);
      expect(a.source.sheet).toBe(AREA_SHEET);
      expect(a.source.confidenceInterval.sheet).toBe(CI_SHEET);
      expect(spi.book.Sheets[AREA_SHEET][`A${a.source.row}`].v).toBe(code);
      expect(spi.book.Sheets[CI_SHEET][`A${a.source.confidenceInterval.row}`].v).toBe(code);
    }
  });

  it("agrees with every published total income cell and preserves unavailable cells", () => {
    for (const a of areas) {
      for (const field of ["taxpayers", "meanIncome", "medianIncome"] as const) {
        const source = spi.book.Sheets[AREA_SHEET][a.source.cells[field]].v;
        expect(a[field]).toBe(typeof source === "number" ? source * (field === "taxpayers" ? 1000 : 1) : null);
        if (a[field] === null) expect(a.notes.join(" ")).toContain(field);
        else expect(a[field]).toBeGreaterThan(0);
      }
      for (const [field, key] of [["taxpayersLower95", "lower"], ["taxpayersUpper95", "upper"]] as const) {
        const source = spi.book.Sheets[CI_SHEET][a.source.confidenceInterval.cells[key]].v;
        expect(a[field]).toBe(typeof source === "number" ? source * 1000 : null);
        if (a[field] === null) expect(a.notes.join(" ")).toContain(field);
      }
      if (a.taxpayers !== null) {
        expect(a.taxpayersLower95).not.toBeNull();
        expect(a.taxpayersUpper95).not.toBeNull();
        expect(a.taxpayersLower95!).toBeLessThanOrEqual(a.taxpayers);
        expect(a.taxpayersUpper95!).toBeGreaterThanOrEqual(a.taxpayers);
      }
    }
  });

  it("reconciles the published local sum within two percent of the same year national outturn", () => {
    const published = areas.filter(a => a.taxpayers !== null);
    const sum = published.reduce((s, a) => s + a.taxpayers!, 0);
    const sameYear = data.national.years[data.edition as keyof typeof data.national.years];
    expect(sameYear.status).toBe("outturn");
    expect(Math.abs(sum / sameYear.taxpayers! - 1)).toBeLessThan(0.02);
    expect(data.coverage.localAuthorityTaxpayers).toBe(sum);
    expect(data.coverage.sameYearNationalTaxpayers).toBe(sameYear.taxpayers);
    expect(data.coverage.rowsWithTaxpayers).toBe(published.length);
    expect(data.coverage.missingTaxpayerCodes).toEqual(areas.filter(a => a.taxpayers === null).map(a => a.code));
  });

  it("retains source codes and documents the two nonnumeric rows without substituting neighbours", () => {
    expect(data.areas).toHaveProperty("E08000019");
    expect(data.areas).toHaveProperty("E08000016");
    expect(data.areas).not.toHaveProperty("E08000039");
    expect(data.areas).not.toHaveProperty("E08000038");
    for (const code of ["E06000027", "E06000053"] as const) {
      const a = data.areas[code];
      expect(a.name).toBe(spi.book.Sheets[AREA_SHEET][`B${a.source.row}`].v);
      expect(data.notes.join(" ")).toContain(code);
    }
  });

  it("marks national years from the source boundary and projection footnote", () => {
    const notes = data.national.projectionAssumptions;
    expect(national.book.Sheets[notes.sheet][`B${notes.row}`].v).toBe(notes.text);
    for (const a of Object.values(data.national.years)) {
      const source = national.book.Sheets[NATIONAL_SHEET][a.source.cell].v;
      expect(a.taxpayers).toBe(typeof source === "number" ? source * 1000 : null);
      expect(a.status).toBe(a.taxpayers === null ? "unavailable" : a.edition <= data.national.lastOutturn ? "outturn" : "projected");
      if (a.status === "projected") expect(national.book.Sheets[NATIONAL_SHEET][`A${a.source.row}`].v).toContain(`[note ${notes.note}]`);
    }
  });

  it("rejects unknown missing markers rather than coercing them to zero", () => {
    for (const value of [null, undefined, "", "..", "[redacted]", -1, NaN]) {
      expect(() => numeric(value, "test cell")).toThrow(/Unexpected value/);
    }
  });

  it("rejects a shifted total income header", () => {
    const book = cloneBook();
    book.Sheets[AREA_SHEET].L5.v = "Employment income: Number of individuals";
    expect(() => transformAreas(book, spi.source)).toThrow(/Expected one header/);
  });

  it("rejects mismatched central estimates and reversed intervals", () => {
    const book = cloneBook(), sheet = book.Sheets[CI_SHEET];
    const loc = first.source.confidenceInterval.cells;
    sheet[loc.central].v *= 2;
    expect(() => transformAreas(book, spi.source)).toThrow(/Central estimates disagree/);
    sheet[loc.central].v /= 2;
    sheet[loc.lower].v = sheet[loc.upper].v + 1;
    expect(() => transformAreas(book, spi.source)).toThrow(/Invalid confidence interval/);
  });

  it("rejects duplicate authorities, mismatched editions and unrecognised projection status", () => {
    let book = cloneBook();
    book.Sheets[AREA_SHEET][`A${areas[1].source.row}`].v = first.code;
    expect(() => transformAreas(book, spi.source)).toThrow(/Duplicate authority/);
    book = cloneBook();
    book.Sheets[CI_SHEET].A1.v = "Table for tax year 2090 to 2091";
    expect(() => transformAreas(book, spi.source)).toThrow(/editions disagree/);
    const nationalBook = structuredClone(national.book);
    nationalBook.Sheets.Contents[data.national.statusSource.cell].v = "No status boundary";
    expect(() => transformNational(nationalBook, national.source)).toThrow(/Missing national outturn boundary/);
  });

  it("discovers the latest exact release title rather than the highest search ranking", () => {
    const title = DATASETS[0].title;
    const older = { title: "Personal incomes statistics for the tax year 2090 to 2091", link: "/government/statistics/older" };
    const newest = { title: "Personal incomes statistics for the tax year 2091 to 2092", link: "/government/statistics/newest" };
    expect(newestRelease([{ title: "Quality report: Personal Income Statistics", link: "/government/statistics/quality" }, older, newest], title)).toEqual(newest);
    expect(() => newestRelease([newest, newest], title)).toThrow(/Ambiguous/);
    expect(() => newestRelease([], title)).toThrow(/No matching/);
  });

  it("keeps authored notes free of long and pseudo dashes", () => {
    const prose = [...data.notes, data.coverage.note, ...areas.flatMap(a => a.notes), ...data.sourceNotes.map(n => n.text)];
    for (const text of prose) expect(text).not.toMatch(/[\u2013\u2014]| - /);
  });
});
