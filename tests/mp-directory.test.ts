import fs from "node:fs";
import { describe, expect, it } from "vitest";
import mpDirectory from "../src/data/live/mp-directory.json";
import { foldConstituencyName, getAllPcons, getMpForPcon, getVacancyForPcon } from "../src/lib/pcon-data";

const dir = mpDirectory as any;

describe("MP directory", () => {
  it("gives every constituency page an MP or a recorded vacancy", () => {
    // "Montgomeryshire and Glyndwr" showed no MP until October 2026 because the
    // constituency dataset drops the circumflex Parliament uses.
    const missing = getAllPcons().filter((p) => !getMpForPcon(p.name) && !getVacancyForPcon(p.name));
    expect(missing.map((p) => p.name)).toEqual([]);
  });

  it("never lists a seat as both held and vacant", () => {
    for (const v of dir.vacancies ?? []) expect(getMpForPcon(v.constituencyName)).toBeNull();
  });

  it("folds Welsh diacritics and punctuation", () => {
    expect(foldConstituencyName("Montgomeryshire and Glyndŵr")).toBe(foldConstituencyName("Montgomeryshire and Glyndwr"));
    expect(foldConstituencyName("Ynys Môn")).toBe("ynys mon");
  });

  it("holds a published value only where the change is still unconfirmed", () => {
    const holds = JSON.parse(fs.readFileSync("scripts/fetch/mp-holds.json", "utf8")).holds;
    for (const h of holds) {
      expect(h.reason, h.constituencyName).toMatch(/\w/);
      expect(h.recorded).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      const applied = (dir.holds ?? []).find((x: any) => x.constituencyName === h.constituencyName && x.field === h.field);
      if (applied) expect(getMpForPcon(h.constituencyName)?.[h.field as "party"]).toBe(h.publishedValue);
    }
  });

  it("is a full House, not a partial fetch", () => {
    expect(dir.members.length + (dir.vacancies ?? []).length).toBeGreaterThanOrEqual(640);
    expect(dir.members.length).toBeLessThanOrEqual(650);
  });
});
