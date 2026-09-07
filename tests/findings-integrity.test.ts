import { describe, expect, it } from "vitest";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * A finding's badge has to be supported by its own prose.
 *
 * The stat_value badge, the headline and the body are three separate strings in
 * one file and nothing was holding them together. Birmingham shipped a badge
 * reading "43% -> 11%" over a headline saying "under 15%" and a body table
 * saying 14.9%, and it stayed that way through the 13 August 2026 recalibration
 * because the recalibration touched the body and not the frontmatter. The 11 was
 * the superseded projection, still on the card, still in the share text, still in
 * the related-findings grid on every other demographics page.
 *
 * So: every number in the badge must appear somewhere a reader can check it, in
 * the headline, the summary or the body. That is a weaker claim than "the badge
 * is right" and it is the strongest one a test can make without a data source,
 * but it is the one that catches a badge nobody updated.
 *
 * This does not exempt ratios. "1.66x" has to find its 1.66 like everything else.
 */

const FINDINGS_DIR = join(process.cwd(), "src", "content", "findings");

interface Finding {
  file: string;
  statValue: string;
  haystack: string;
}

/** Frontmatter is read as text rather than through the collection loader, so the
 *  test sees the file as authored and does not inherit the schema's silent drops. */
function parseFinding(file: string): Finding {
  const raw = readFileSync(join(FINDINGS_DIR, file), "utf8");
  const match = raw.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n([\s\S]*)$/);
  if (!match) throw new Error(`${file}: no frontmatter block`);
  const [, frontmatter, body] = match;

  const field = (name: string): string => {
    const m = frontmatter.match(new RegExp(`^${name}:\\s*(.*)$`, "m"));
    if (!m) throw new Error(`${file}: no ${name} in frontmatter`);
    return m[1].trim().replace(/^["']|["']$/g, "");
  };

  return {
    file,
    statValue: field("stat_value"),
    // stat_label is deliberately not in here. It is a caption for the badge, so
    // "WBI 2021->2051" would vouch for a badge year without any prose behind it.
    haystack: [field("headline"), field("summary"), body].join("\n")
  };
}

/**
 * Number tokens in a badge: percentages, years, plain counts and thousands-
 * separated counts, each optionally wearing a currency symbol, a sign, or a
 * %, pp, x, K or M suffix. The suffix is stripped; the digits are the token.
 */
export function numberTokens(statValue: string): string[] {
  return [...statValue.matchAll(/\d[\d,]*(?:\.\d+)?/g)].map((m) => m[0]);
}

/**
 * A token is present if it appears at the start of a number in the prose.
 *
 * The left edge is enforced so a badge reading "15" is not vouched for by 2015
 * or by 1.56pp. The right edge is deliberately open, because a badge abbreviates:
 * "319K" is written 319,452 in the body and "162K" is 162,133. Prefix matching is
 * what lets the abbreviation find its full figure.
 */
export function tokenAppears(token: string, haystack: string): boolean {
  const forms = new Set([token, token.replace(/,/g, "")]);
  const hays = [haystack, haystack.replace(/,/g, "")];
  for (const form of forms) {
    const pattern = new RegExp(`(?<![\\d.,])${form.replace(/\./g, "\\.")}`);
    if (hays.some((h) => pattern.test(h))) return true;
  }
  return false;
}

const findings = readdirSync(FINDINGS_DIR)
  .filter((f) => f.endsWith(".md"))
  .sort()
  .map(parseFinding);

describe("findings badge integrity", () => {
  it("reads the whole corpus", () => {
    expect(findings.length).toBeGreaterThan(15);
  });

  it.each(findings.map((f) => [f.file, f] as const))(
    "%s: every number in stat_value appears in the headline, summary or body",
    (_file, finding) => {
      const tokens = numberTokens(finding.statValue);
      expect(tokens.length, `${finding.file}: stat_value "${finding.statValue}" has no number`).toBeGreaterThan(0);
      const missing = tokens.filter((t) => !tokenAppears(t, finding.haystack));
      expect(
        missing,
        `${finding.file}: stat_value "${finding.statValue}" cites ${missing.join(", ")}, which the prose never does`
      ).toEqual([]);
    }
  );
});

describe("the check fires on a known positive", () => {
  // Silence only counts if the method can find a real one. This is the badge
  // Birmingham actually shipped, against the body it actually shipped with.
  const birmingham = findings.find((f) => f.file === "birmingham-demographic-transformation.md")!;

  it("catches the superseded Birmingham badge", () => {
    const tokens = numberTokens("43% → 11%");
    expect(tokens).toEqual(["43", "11"]);
    expect(tokenAppears("43", birmingham.haystack)).toBe(true);
    expect(tokenAppears("11", birmingham.haystack)).toBe(false);
  });

  it("does not let a longer number vouch for a shorter one", () => {
    expect(tokenAppears("15", "the 2015 figure")).toBe(false);
    expect(tokenAppears("15", "1.56pp of error")).toBe(false);
    expect(tokenAppears("15", "projected under 15% by 2051")).toBe(true);
  });

  it("lets an abbreviated badge find the full figure", () => {
    expect(tokenAppears("319", "319,452 people identified as Arab")).toBe(true);
    expect(tokenAppears("108,099", "fell from 108,099 in 2023")).toBe(true);
  });
});
