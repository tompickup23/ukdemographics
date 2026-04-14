import { describe, expect, test } from "vitest";

import { loadHotelEntityLedger } from "../src/lib/hotel-data";
import {
  getCompareInvestigationTrails,
  getHomepageInvestigationTrails,
  getPlaceInvestigationTrails,
  getRouteInvestigationTrails,
  getSpendingLinkedSiteTrails
} from "../src/lib/investigations";
import { loadMoneyLedger } from "../src/lib/money-data";
import { loadLocalRouteLatest } from "../src/lib/route-data";

const hotelLedger = loadHotelEntityLedger();
const moneyLedger = loadMoneyLedger();
const localRouteLatest = loadLocalRouteLatest();

describe("investigation trails", () => {
  test("builds homepage trails with unique areas and linked follow-through steps", () => {
    const trails = getHomepageInvestigationTrails(localRouteLatest.areas, hotelLedger, moneyLedger, 3);

    expect(trails).toHaveLength(3);
    expect(new Set(trails.map((trail) => trail.areaCode ?? trail.areaName)).size).toBe(3);
    expect(trails.every((trail) => trail.steps.length === 3)).toBe(true);
    expect(trails.some((trail) => trail.moneyMatchType === "direct")).toBe(true);
  });

  test("deduplicates spending trails by linked money row", () => {
    const trails = getSpendingLinkedSiteTrails(localRouteLatest.areas, hotelLedger, moneyLedger, 4);

    expect(trails.length).toBeGreaterThan(0);
    expect(trails.every((trail) => trail.moneyMatchType === "direct")).toBe(true);
    expect(new Set(trails.map((trail) => trail.recordIds[0])).size).toBe(trails.length);
    expect(trails.some((trail) => trail.siteName === "Phoenix Hotel")).toBe(true);
  });

  test("builds place-level trails that keep the hotel and money chain together", () => {
    const eppingForest = localRouteLatest.areas.find((area) => area.areaCode === "E07000072");

    expect(eppingForest).toBeTruthy();

    const trails = getPlaceInvestigationTrails(eppingForest!, hotelLedger, moneyLedger, localRouteLatest.areas, 4);

    expect(trails.length).toBeGreaterThan(0);
    expect(trails.some((trail) => trail.siteName === "Phoenix Hotel")).toBe(true);
    expect(trails.some((trail) => trail.steps.some((step) => step.href.includes("/spending/")))).toBe(true);
  });

  test("builds compare and route case files with unique areas", () => {
    const compareTrails = getCompareInvestigationTrails(localRouteLatest.areas, hotelLedger, moneyLedger, 3);
    const routeTrails = getRouteInvestigationTrails(localRouteLatest.areas, hotelLedger, moneyLedger, 3);

    expect(compareTrails.length).toBeGreaterThan(0);
    expect(routeTrails.length).toBeGreaterThan(0);
    expect(new Set(compareTrails.map((trail) => trail.areaCode ?? trail.areaName)).size).toBe(compareTrails.length);
    expect(new Set(routeTrails.map((trail) => trail.areaCode ?? trail.areaName)).size).toBe(routeTrails.length);
  });
});
