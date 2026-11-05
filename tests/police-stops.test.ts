import { describe, expect, it } from "vitest";
import { planWindow } from "../scripts/lib/police-stops.mjs";
import { robotsVerdict } from "../scripts/lib/retrieval-log.mjs";

/**
 * The stop-and-search fetch plans its requests from data.police.uk's /crimes-street-dates
 * response, so the shape of that response is checked here against fixtures, as is the
 * robots.txt reading every fetch relies on. No request is made.
 */

// Trimmed from the 4 November 2026 response: newest first, a month without
// stop-and-search data, and a force listed twice.
const DATES = [
  { date: "2026-09", "stop-and-search": [] },
  { date: "2026-08", "stop-and-search": ["leicestershire", "avon-and-somerset", "btp"] },
  { date: "2026-07", "stop-and-search": ["avon-and-somerset", "btp", "btp"] },
  { date: "2026-06", "stop-and-search": ["city-of-london"] },
  { date: "2026-05", "stop-and-search": ["avon-and-somerset"] }
];

describe("planWindow", () => {
  it("takes the newest three months with stop-and-search data and one file per force-month", () => {
    const plan = planWindow(DATES);
    expect(plan.months.map((m) => m.date)).toEqual(["2026-08", "2026-07", "2026-06"]);
    expect(plan.months[1].forces).toEqual(["avon-and-somerset", "btp"]);
    expect(plan.forcesListed).toEqual(["avon-and-somerset", "btp", "city-of-london", "leicestershire"]);
    expect(plan.files).toHaveLength(6);
    expect(plan.files[0]).toEqual({
      force: "avon-and-somerset",
      date: "2026-08",
      url: "https://data.police.uk/api/stops-force?force=avon-and-somerset&date=2026-08",
      fileName: "avon-and-somerset-2026-08.json"
    });
  });

  it("does not depend on the order the API lists months in", () => {
    expect(planWindow([...DATES].reverse()).months.map((m) => m.date)).toEqual(["2026-08", "2026-07", "2026-06"]);
  });

  it("refuses a response that is not a list", () => {
    expect(() => planWindow({ error: "moved" })).toThrow(/did not return a list/);
  });

  it("refuses a record without a YYYY-MM date", () => {
    expect(() => planWindow([{ date: "August 2026", "stop-and-search": ["btp"] }])).toThrow(/YYYY-MM date/);
  });

  it("refuses a force id that could become a path", () => {
    expect(() => planWindow([{ date: "2026-08", "stop-and-search": ["../evil"] }])).toThrow(/not a bare slug/);
  });

  it("refuses a response with no stop-and-search month", () => {
    expect(() => planWindow([{ date: "2026-08", "stop-and-search": [] }, { date: "2026-07" }])).toThrow(/no month/);
  });
});

describe("robotsVerdict", () => {
  it("allows everything for an empty file, as data.police.uk serves", () => {
    expect(robotsVerdict("", "/api/stops-force")).toBe("allowed");
  });

  it("applies the longest matching rule for the * group", () => {
    const text = "User-agent: *\nDisallow: /api/\nAllow: /api/crimes-street-dates\n";
    expect(robotsVerdict(text, "/api/stops-force")).toBe("disallowed");
    expect(robotsVerdict(text, "/api/crimes-street-dates")).toBe("allowed");
    expect(robotsVerdict(text, "/docs/")).toBe("allowed");
  });

  it("prefers a group naming this agent over the * group", () => {
    const text = "User-agent: *\nAllow: /\n\nUser-agent: ukdemographics\nDisallow: /api/\n";
    expect(robotsVerdict(text, "/api/stops-force")).toBe("disallowed");
  });
});
