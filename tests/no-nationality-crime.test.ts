import { describe, expect, it } from "vitest";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * House rule: no claim or juxtaposition linking nationality, migration status or
 * asylum to crime, offending or prison. Added on 12 October 2026 with the same
 * check on Asylum Stats, where a prison-population-by-nationality section was
 * withdrawn. No UK Demographics finding failed it. This fails if prose of that
 * kind comes into any finding, outside a dated correction notice.
 *
 * The pattern looks for a nationality or prison-population term and a crime term
 * in the same paragraph. It is a tripwire, not a classifier: a new hit needs a
 * human read, and an allowed paragraph is listed below with its reason.
 */
const FINDINGS = join(process.cwd(), "src/content/findings");

const CRIME = /\b(crime|crimes|criminal|offend\w*|offence\w*|prison\w*|prisoner\w*|convict\w*|arrest\w*|FNOs?)\b/i;
const NATIONALITY = /\b(nationalit\w*|foreign nationals?|Albanian|Iraqi|Iranian|Vietnamese|Eritrean|Afghan|Syrian|Sudanese|Pakistani|Jamaican|Polish|Romanian|asylum (?:seeker|nationalit)\w*)\b/i;

/** Paragraphs allowed to carry both kinds of term, with the reason. */
const ALLOWED: Array<{ file: string; contains: string; reason: string }> = [];

const paragraphs = (text: string) =>
  text
    .replace(/^---[\s\S]*?\n---\n/, "")
    .split(/\n\s*\n/)
    .filter((p) => !p.trimStart().startsWith(">"));

describe("no nationality-to-crime prose in findings", () => {
  it("finds no paragraph pairing a nationality or asylum term with a crime or prison term", () => {
    const hits: string[] = [];
    for (const file of readdirSync(FINDINGS).filter((f) => f.endsWith(".md"))) {
      for (const p of paragraphs(readFileSync(join(FINDINGS, file), "utf8"))) {
        if (!CRIME.test(p) || !NATIONALITY.test(p)) continue;
        if (ALLOWED.some((a) => a.file === file && p.includes(a.contains))) continue;
        hits.push(`${file}: ${p.slice(0, 120).replace(/\s+/g, " ")}`);
      }
    }
    expect(hits).toEqual([]);
  });

  it("can fire: a planted paragraph is caught", () => {
    const planted = "Albanian nationals in the prison population correlate with the top asylum nationalities.";
    expect(CRIME.test(planted) && NATIONALITY.test(planted)).toBe(true);
  });
});
