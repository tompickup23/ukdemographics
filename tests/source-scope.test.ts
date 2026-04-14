import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";

function loadSourceScope(): Array<Record<string, string>> {
  const url = new URL("../src/data/live/source-scope.json", import.meta.url);
  return JSON.parse(readFileSync(url, "utf8"));
}

describe("source-scope.json", () => {
  const sources = loadSourceScope();

  it("has at least 10 sources", () => {
    expect(sources.length).toBeGreaterThanOrEqual(10);
  });

  it("every source has required fields", () => {
    for (const source of sources) {
      expect(source).toHaveProperty("name");
      expect(source).toHaveProperty("type");
      expect(source).toHaveProperty("scope");
      expect(source).toHaveProperty("sourceUrl");
      expect(source.sourceUrl).toMatch(/^https?:\/\//);
    }
  });

  it("does not reference AI DOGE", () => {
    const json = JSON.stringify(sources);
    expect(json).not.toContain("AI DOGE");
  });

  it("does not reference ECA CRM", () => {
    const json = JSON.stringify(sources);
    expect(json).not.toContain("ECA CRM");
  });

  it("does not link to private GitHub repos", () => {
    for (const source of sources) {
      expect(source.sourceUrl).not.toContain("github.com/tompickup23/tompickup23.github.io");
      expect(source.sourceUrl).not.toContain("github.com/tompickup23/eca");
    }
  });
});

describe("follow-money.json integrity techniques", () => {
  it("does not reference AI DOGE in origin fields", () => {
    const url = new URL("../src/data/live/follow-money.json", import.meta.url);
    const data = JSON.parse(readFileSync(url, "utf8"));
    const origins = (data.integrityTechniques || []).map((t: { origin: string }) => t.origin);
    for (const origin of origins) {
      expect(origin).not.toContain("AI DOGE");
    }
  });
});
