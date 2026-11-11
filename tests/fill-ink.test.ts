import { describe, expect, it } from "vitest";
import { inkOnFill, INK_ON_DARK_FILL, INK_ON_LIGHT_FILL } from "../src/lib/fill-ink";
import { contrast } from "../src/lib/map/colour";
import { PARTY_COLOURS } from "../src/lib/party-colours";
import { readFileSync } from "node:fs";
import { join } from "node:path";

describe("ink on a filled shape", () => {
  for (const [party, fill] of Object.entries(PARTY_COLOURS)) {
    it(`${party} (${fill}) carries a label at 4.5:1 or better`, () => {
      const ink = inkOnFill(fill);
      expect(ink).not.toBeNull();
      expect(contrast(ink!, fill)).toBeGreaterThanOrEqual(4.5);
    });
  }

  it("picks dark ink on a pale fill and white on a deep one", () => {
    expect(inkOnFill("#fdf38e")).toBe(INK_ON_LIGHT_FILL);
    expect(inkOnFill("#005b54")).toBe(INK_ON_DARK_FILL);
  });

  it("hands a token fill the token that changes with the theme", () => {
    expect(inkOnFill("var(--accent)")).toBe("var(--on-accent)");
    expect(inkOnFill("var(--coral)")).toBe("var(--on-coral)");
    expect(inkOnFill("var(--something-else)")).toBeNull();
  });

  it("defines each ink token for both themes in global.css", () => {
    const css = readFileSync(join(process.cwd(), "src/styles/global.css"), "utf8");
    for (const token of ["--on-accent", "--on-coral"]) {
      expect(css.match(new RegExp(`${token}:`, "g"))?.length ?? 0).toBeGreaterThanOrEqual(2);
    }
  });
});

describe("accent text on the accent wash", () => {
  const css = readFileSync(join(process.cwd(), "src/styles/global.css"), "utf8");
  const [lightBlock, ...darkBlocks] = css.split("@media (prefers-color-scheme: dark)");
  const dark = darkBlocks.join("\n");
  const hex = (block: string, token: string) => block.match(new RegExp(`${token}:\\s*(#[0-9a-fA-F]{6})`))?.[1];

  it("reaches 4.5:1 on the light page", () => {
    expect(css).toContain("--accent-on-wash: var(--accent);");
    expect(contrast(hex(lightBlock, "--accent")!, hex(lightBlock, "--accent-wash")!)).toBeGreaterThanOrEqual(4.5);
  });

  it("reaches 4.5:1 on the dark page", () => {
    expect(contrast(hex(dark, "--accent-on-wash")!, hex(dark, "--accent-wash")!)).toBeGreaterThanOrEqual(4.5);
  });

  it("is what tags and chips on the wash are drawn in", () => {
    expect(css).toMatch(/\.chip\.accent \{[^}]*color: var\(--accent-on-wash\)/);
    const findings = readFileSync(join(process.cwd(), "src/pages/findings/index.astro"), "utf8");
    expect(findings).toMatch(/\.article-category \{[^}]*color: var\(--accent-on-wash\)/);
    expect(findings).toMatch(/\.finding-category \{[^}]*color: var\(--accent-on-wash\)/);
  });
});

describe("party names are never coloured text", () => {
  for (const file of ["src/pages/constituencies/index.astro", "src/pages/constituencies/[slug].astro"]) {
    it(`${file} does not set a party colour as a text colour`, () => {
      const source = readFileSync(join(process.cwd(), file), "utf8");
      expect(source).not.toMatch(/style=\{`color:\s*\$\{party/);
    });
  }
});
