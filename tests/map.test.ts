import { createHash } from "node:crypto";
import fs from "node:fs";
import { gzipSync } from "node:zlib";
import { afterEach, describe, expect, it } from "vitest";

import { PLACE_COUNT } from "../src/lib/coverage";
import {
  BOUNDARY_FILE,
  BOUNDARY_SOURCE_FILE,
  DASHES,
  LOADED_WORDS,
  RANKING_WORDS,
  MARK_SHADE,
  MARK_SVG,
  PROJECTED_YEARS,
  SEQUENTIAL,
  TEMPLATE_KEYS,
  VISIONS,
  areaName,
  colourFor,
  contrast,
  countyCodes,
  countyFrame,
  focusFrame,
  getIndicator,
  isSummed2011,
  latestYear,
  loadCouncils,
  neighbourIndex,
  oklabLightness,
  placeCodes,
  qa,
  regionFrame,
  regionSlugs,
  renderStill,
  seenDistance,
  type Frame,
  type RenderResult
} from "../src/lib/map";

// Raw sources, re-read from disk so the check does not trust the module's own reading.
const readJson = (p: string) => JSON.parse(fs.readFileSync(p, "utf8"));
const projections = readJson("src/data/live/ethnic-projections.json");
const mye = readJson("src/data/live/population-estimates.json");

const pop = getIndicator("population_change", { projections: false });
const wb = getIndicator("white_british_share", { projections: false });
const BURNLEY = "E07000117";
const LANCASHIRE = "E10000017";

/** A spread of frames: a district, a London borough, a Welsh council, an island, a county, a region. */
const sampleFrames = (): Frame[] => [
  focusFrame(BURNLEY),
  focusFrame("E09000001"), // City of London: tiny focus, large neighbours
  focusFrame("W06000015"), // Cardiff
  focusFrame("E06000046"), // Isle of Wight: no land border, nearest councils instead
  focusFrame("E06000063"), // Cumberland: borders Scotland, formed 2023
  countyFrame(LANCASHIRE),
  regionFrame("london")
];

function sampleRenders(): RenderResult[] {
  const out: RenderResult[] = [];
  for (const frame of sampleFrames()) for (const ind of [pop, wb]) for (const tk of TEMPLATE_KEYS) for (const y of ind.years)
    if (tk === "inline" || y === latestYear(ind) || y === ind.years[0]) out.push(renderStill(frame, ind, tk, y));
  return out;
}
let samples: RenderResult[] | null = null;
const getSamples = () => (samples ??= sampleRenders());

/** Exact display of a raw source value, formatted independently of the registry. */
const MINUS = "−";
function expectedPopulation(code: string, year: number): string {
  const s = mye.areas[code].series;
  const v = Number(((s[String(year)] / s["2011"] - 1) * 100).toFixed(1));
  return `${v > 0 ? "+" : v < 0 ? MINUS : ""}${Math.abs(v).toFixed(1)}%`;
}
const successors2011 = readJson("src/data/live/census-2011-successors.json").areas;
function expectedWhiteBritish(code: string, year: number): string {
  // The 2011 sums for councils formed since 2011 are read from the separately derived file.
  const d = year === 2011 ? successors2011[code] : null;
  if (d) return `${((d.groups_absolute.white_british / d.total_population) * 100).toFixed(1)}%`;
  const a = projections.areas[code];
  const side = year === 2011 ? a.baseline : a.current;
  return side.year === year ? `${side.groups.white_british.toFixed(1)}%` : "n/a";
}

describe("map geometry", () => {
  it("has a boundary for every council with a place page", () => {
    const geo = loadCouncils();
    const codes = placeCodes();
    expect(codes.length).toBe(PLACE_COUNT);
    expect(codes.filter((c) => !geo.has(c))).toEqual([]);
  });

  it("matches the hash recorded in its source file", () => {
    const src = readJson(BOUNDARY_SOURCE_FILE);
    const sha = createHash("sha256").update(fs.readFileSync(BOUNDARY_FILE)).digest("hex");
    expect(sha).toBe(src.sha256);
    expect(src.publisher).toBe("Office for National Statistics");
  });

  it("rewinds every ring so d3 sees each council, not the globe minus it", async () => {
    const { geoArea } = await import("d3-geo");
    for (const [code, f] of loadCouncils()) expect(geoArea(f as never), code).toBeLessThan(0.01);
  });

  it("finds neighbours symmetrically, and a land council has at least one", () => {
    const idx = neighbourIndex();
    for (const [code, nb] of idx) for (const n of nb) expect(idx.get(n), `${code} -> ${n}`).toContain(code);
    expect(idx.get(BURNLEY)!.map(areaName).sort()).toEqual(["Calderdale", "Hyndburn", "Pendle", "Ribble Valley", "Rossendale"]);
    const isolated = [...idx].filter(([, nb]) => nb.length === 0).map(([c]) => areaName(c)).sort();
    expect(isolated).toEqual(["Isle of Anglesey", "Isle of Wight", "Isles of Scilly"]);
    expect(idx.get("E07000008")!.map(areaName)).toEqual(["South Cambridgeshire"]); // an enclave: the shared line is a hole
  });

  it("gives every place a focus frame and a region frame, and every district a county frame", () => {
    const regions = regionSlugs();
    const inRegion = new Set(regions.flatMap((r) => regionFrame(r.slug).members));
    const districts = readJson("src/data/lookups/district-to-utla.json").districts;
    for (const code of placeCodes()) {
      const f = focusFrame(code);
      expect(f.members[0]).toBe(code);
      expect(inRegion.has(code), code).toBe(true);
      if (districts[code]) expect(countyFrame(districts[code].countyCode).core).toContain(code);
    }
    expect(countyCodes()).toHaveLength(21);
  });

  it("keeps ceremonial unitaries out of the county council area (P1)", () => {
    const lancs = countyFrame(LANCASHIRE);
    expect(lancs.core).toHaveLength(12);
    expect(lancs.extras.map(areaName)).toEqual(["Blackburn with Darwen", "Blackpool"]);
    expect(lancs.core.some((c) => lancs.extras.includes(c))).toBe(false);
    const lookup = readJson("src/data/lookups/ceremonial-county-unitaries.json");
    for (const county of Object.values<{ unitaries: Array<{ code: string; name: string }> }>(lookup.counties))
      for (const u of county.unitaries) expect(projections.areas[u.code]?.areaName, u.code).toBe(u.name);
  });
});

describe("map indicators", () => {
  afterEach(() => { delete process.env.MAPS_PROJECTIONS; });

  it("shows no projected year while MAPS_PROJECTIONS is off", () => {
    delete process.env.MAPS_PROJECTIONS;
    const ind = getIndicator("white_british_share");
    expect(ind.years).toEqual([2011, 2021]);
    for (const y of PROJECTED_YEARS) expect(ind.status(BURNLEY, y)).toBe("absent");
    const svg = renderStill(focusFrame(BURNLEY), ind, "inline", 2021).svg;
    for (const y of PROJECTED_YEARS) expect(svg).not.toContain(`-${y}=`);
    expect(svg).not.toContain("PROJECTION");
  });

  it("renders councils on the older model run as n/a when projections are on", () => {
    process.env.MAPS_PROJECTIONS = "1";
    const ind = getIndicator("white_british_share");
    expect(ind.years).toEqual([2011, 2021, ...PROJECTED_YEARS]);
    const res = renderStill(countyFrame(LANCASHIRE), ind, "portrait", 2031);
    const ribble = res.drawn.find((d) => d.name === "Ribble Valley")!;
    expect(projections.areas[ribble.code].stochastic?.["2031"]).toBeUndefined();
    expect(ribble.status).toBe("older_run");
    expect(ribble.display).toBe("n/a");
    expect(res.drawn.find((d) => d.code === BURNLEY)!.display).toBe(`${projections.areas[BURNLEY].projections["2031"].white_british.toFixed(1)}%`);
    expect(qa(res)).toEqual([]);
  });

  it("gives councils formed since 2011 their summed 2011 figure, never the 2021 one", () => {
    const derived = readJson("src/data/live/census-2011-successors.json");
    const formed = Object.keys(derived.areas);
    expect(formed).toHaveLength(11);
    expect(formed.filter((c) => !isSummed2011(c))).toEqual([]);
    expect(derived.checks.siteAreas2011Total).toBe(derived.checks.englandAndWales2011Total);
    for (const code of formed) {
      const d = derived.areas[code];
      // ethnic-projections.json and the separately derived sums agree, cell for cell.
      const base = projections.areas[code].baseline;
      expect(base.year).toBe(2011);
      expect(base.total_population).toBe(d.total_population);
      expect(base.groups_absolute).toEqual(d.groups_absolute);
      const share = Number(((d.groups_absolute.white_british / d.total_population) * 100).toFixed(2));
      expect(wb.status(code, 2011)).toBe("ok");
      expect(wb.value(code, 2011)).toBe(share);
      expect(wb.value(code, 2011)).not.toBe(projections.areas[code].current.groups.white_british);
      expect(wb.sub(code, 2021)).toMatch(/pts from 2011|no change/);
    }
    // Cumberland: Allerdale 96,422 + Carlisle 107,524 + Copeland 70,603 (Census 2011 usual residents).
    expect(derived.areas.E06000063.total_population).toBe(274549);
    const res = renderStill(focusFrame("E06000063"), wb, "portrait", 2011);
    expect(res.texts.map((t) => t.content).join(" ")).toContain("summed from the 2011 districts now in each council: Cumberland; Westmorland and Furness.");
  });

  it("keeps the sequential ramp rising in lightness and short of white", () => {
    const L = SEQUENTIAL.map(oklabLightness);
    for (let i = 1; i < L.length; i++) expect(L[i]).toBeGreaterThan(L[i - 1]);
    expect(Math.max(...L)).toBeLessThan(0.8);
    expect(wb.scale.type).toBe("sequential");
  });

  it("keeps adjacent classes apart for normal, protan, deutan and tritan vision", () => {
    // 0.045 in OKLab is about twice a just-noticeable difference.
    for (const ind of [pop, wb]) for (const v of VISIONS) {
      const r = ind.scale.colours;
      for (let i = 1; i < r.length; i++) expect(seenDistance(r[i - 1], r[i], v), `${ind.id} ${v} ${r[i - 1]} ${r[i]}`).toBeGreaterThan(0.045);
    }
  });

  it("hatches n/a, so it never reads as the darkest class", () => {
    const res = renderStill(focusFrame("E06000063"), getIndicator("white_british_share", { projections: true }), "portrait", 2031);
    const na = res.drawn.filter((d) => d.display === "n/a");
    expect(na.length).toBeGreaterThan(0);
    for (const d of na) expect(res.fills[d.code]).toMatch(/^url\(#ukd-na-/);
    expect(res.svg).toMatch(/<pattern id="ukd-na-cumberland-portrait"/);
  });

  it("uses no red for any group", () => {
    for (const c of [...wb.scale.colours, ...pop.scale.colours]) {
      const [r, g, b] = [1, 3, 5].map((i) => parseInt(c.slice(i, i + 2), 16));
      expect(r > 150 && r > 1.8 * g && r > 1.8 * b, c).toBe(false);
    }
  });
});

describe("map renderer", () => {
  it("passes every QA gate on a spread of frames, templates and years", () => {
    for (const res of getSamples()) expect(qa(res), `${res.layout.ind.id}/${res.layout.frame.id}/${res.layout.tk}`).toEqual([]);
  });

  it("meets WCAG contrast for every text element against what it sits on", () => {
    for (const res of getSamples()) for (const t of res.texts) {
      const large = t.size >= 24 || (t.size >= 18.66 && t.weight >= 600);
      expect(contrast(t.fill, t.bg), `"${t.content}"`).toBeGreaterThanOrEqual(large ? 3 : 4.5);
    }
  });

  it("puts no dash in any text people read", () => {
    for (const res of getSamples()) {
      const text = [...res.svg.matchAll(/>([^<>]+)</g)].map((m) => m[1]).join("\n");
      expect(DASHES.test(text)).toBe(false);
      expect(DASHES.test(res.alt)).toBe(false);
      expect(res.svg).not.toMatch(/\u2013|\u2014/);
    }
  });

  it("uses no ranking language and only neutral verbs", () => {
    for (const res of getSamples()) for (const t of [...res.texts.map((x) => x.content), res.alt]) {
      expect(RANKING_WORDS.test(t), t).toBe(false);
      expect(LOADED_WORDS.test(t), t).toBe(false);
    }
    expect(RANKING_WORDS.test("the highest share")).toBe(true);
    expect(LOADED_WORDS.test("diversity spread")).toBe(true);
  });

  it("carries at least four brand marks, two inside the map panel", () => {
    for (const res of getSamples()) {
      expect(res.brand).toBeGreaterThanOrEqual(4);
      expect(res.brandInPanel).toBeGreaterThanOrEqual(2);
      // Each mark draws its five shaded bars; count them in the SVG itself.
      expect(res.svg.split(`fill="${MARK_SHADE}"`).length - 1).toBeGreaterThanOrEqual(3 * 5);
      expect(res.svg).toContain("ukdemographics.co.uk");
      expect(res.svg).not.toMatch(/Tom Pickup/i);
    }
  });

  it("draws every value exactly as the source file holds it", () => {
    for (const res of getSamples()) {
      const { ind } = res.layout;
      for (const d of res.drawn) {
        const want = ind.id === "population_change" ? expectedPopulation(d.code, d.year) : expectedWhiteBritish(d.code, d.year);
        expect(d.display, `${d.name} ${d.year}`).toBe(want);
        if (ind.id === "population_change") expect(d.sub).toBe(`${mye.areas[d.code].series[String(d.year)].toLocaleString("en-GB")} people`);
      }
      for (const t of res.texts.filter((x) => x.role === "value")) expect(res.drawn.map((d) => d.display)).toContain(t.content);
    }
  });

  it("uses the same fixed classes in every year", () => {
    const frame = countyFrame(LANCASHIRE);
    const legendFills = (svg: string) => [...svg.matchAll(/<rect [^>]*height="20" rx="3" fill="(#[0-9a-f]{6})"/g)].map((m) => m[1]);
    const years = wb.years.map((y) => renderStill(frame, wb, "portrait", y));
    expect(legendFills(years[0].svg)).toEqual(wb.scale.colours);
    for (const r of years) {
      expect(legendFills(r.svg)).toEqual(legendFills(years[0].svg));
      for (const d of r.drawn) if (d.value != null) expect(r.fills[d.code]).toBe(colourFor(wb, d.value));
    }
  });

  it("lays the web map out at 600 units with values of 26 units or more", () => {
    const res = renderStill(focusFrame(BURNLEY), pop, "inline", 2025);
    expect(res.svg).toMatch(/viewBox="0 0 600 \d+"/);
    const values = res.texts.filter((t) => t.role === "value");
    expect(values.length).toBeGreaterThan(1);
    for (const v of values) expect(v.size).toBeGreaterThanOrEqual(26);
    // Every year's fill and value ride on data attributes for the year switcher.
    for (const y of pop.years) expect(res.svg).toContain(`data-f-${y}=`);
  });

  it("keeps story text out of the top 230 and bottom 400 pixels", () => {
    const res = renderStill(countyFrame(LANCASHIRE), wb, "story", 2021);
    for (const t of res.texts) {
      expect(t.y - t.size, t.content).toBeGreaterThanOrEqual(230);
      expect(t.y, t.content).toBeLessThanOrEqual(1920 - 400);
    }
  });

  it("gives an island its nearest councils, called nearest, not bordering", () => {
    const wight = focusFrame("E06000046"), scilly = focusFrame("E06000053"), anglesey = focusFrame("W06000001");
    expect(wight.relation).toBe("nearby");
    expect(anglesey.members.slice(1).map(areaName)).toContain("Gwynedd");
    expect(scilly.members.slice(1).map(areaName)).toEqual(["Cornwall"]);
    expect(wight.members.length).toBeGreaterThan(1);
    const svg = renderStill(scilly, pop, "portrait", 2025).svg;
    expect(svg).toContain("NEAREST COUNCILS, A TO Z");
    expect(svg).not.toContain("BORDERING");
    expect(focusFrame(BURNLEY).relation).toBe("bordering");
  });

  it("shares the mark with the Open Graph cards unchanged", () => {
    expect(MARK_SVG).toBe(
      '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64" width="64" height="64">' +
      '<rect x="20" y="8" width="10" height="9" fill="#7b74f2"/><rect x="34" y="8" width="12" height="9" fill="#574fa8"/>' +
      '<rect x="16" y="19" width="14" height="9" fill="#7b74f2"/><rect x="34" y="19" width="16" height="9" fill="#574fa8"/>' +
      '<rect x="12" y="30" width="18" height="9" fill="#7b74f2"/><rect x="34" y="30" width="20" height="9" fill="#574fa8"/>' +
      '<rect x="8" y="41" width="22" height="9" fill="#7b74f2"/><rect x="34" y="41" width="24" height="9" fill="#574fa8"/>' +
      '<rect x="4" y="52" width="26" height="9" fill="#7b74f2"/><rect x="34" y="52" width="28" height="9" fill="#574fa8"/>' +
      "</svg>"
    );
  });

  it("keeps every council's web map within its page-weight budget", { timeout: 120_000 }, () => {
    // Stage 2 puts one map per page, both measures on it: 25 KB gzipped per measure at most.
    const over: string[] = [];
    for (const code of placeCodes()) for (const ind of [pop, wb]) {
      const svg = renderStill(focusFrame(code), ind, "inline", latestYear(ind)).svg;
      const gz = gzipSync(svg).length;
      if (gz > 25 * 1024) over.push(`${areaName(code)} ${ind.id}: ${(gz / 1024).toFixed(1)} KB`);
    }
    expect(over).toEqual([]);
  });

  it("renders every council's latest card in every template without a QA failure", { timeout: 240_000 }, () => {
    const failures: string[] = [];
    for (const code of placeCodes()) for (const ind of [pop, wb]) for (const tk of TEMPLATE_KEYS) {
      const errs = qa(renderStill(focusFrame(code), ind, tk, latestYear(ind)));
      if (errs.length) failures.push(`${areaName(code)} ${ind.id} ${tk}: ${errs[0]}`);
    }
    expect(failures).toEqual([]);
  });
});
