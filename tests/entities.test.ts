import { describe, expect, test } from "vitest";

import {
  getEntityProfile,
  getEntityProfileByReference,
  getEntityProfiles,
  getLeadEntityProfileForTrail
} from "../src/lib/entities";
import { loadHotelEntityLedger } from "../src/lib/hotel-data";
import { getRouteInvestigationTrails } from "../src/lib/investigations";
import { loadMoneyLedger } from "../src/lib/money-data";
import { loadLocalRouteLatest } from "../src/lib/route-data";

const entityProfiles = getEntityProfiles();
const hotelLedger = loadHotelEntityLedger();
const moneyLedger = loadMoneyLedger();
const localRouteLatest = loadLocalRouteLatest();

describe("entity profiles", () => {
  test("builds a combined entity surface from hotel and money data", () => {
    expect(entityProfiles.length).toBeGreaterThanOrEqual(9);

    const serco = getEntityProfile("supplier_serco");
    const somani = getEntityProfile("supplier_03929881");

    expect(serco).toBeTruthy();
    expect(serco?.currentSiteCount).toBeGreaterThanOrEqual(2);
    expect(serco?.moneyRecordCount).toBeGreaterThanOrEqual(1);
    expect(serco?.currentSites.some((site) => site.siteName === "Phoenix Hotel")).toBe(true);

    expect(somani).toBeTruthy();
    expect(somani?.currentSites.some((site) => site.siteName === "Bell Hotel")).toBe(true);
    expect(somani?.linkedAreas.map((area) => area.areaName)).toContain("Epping Forest");
  });

  test("keeps money-only public bodies as entity pages", () => {
    const localAuthorities = getEntityProfile("supplier_participating_local_authorities");

    expect(localAuthorities).toBeTruthy();
    expect(localAuthorities?.currentSiteCount).toBe(0);
    expect(localAuthorities?.moneyRecordCount).toBeGreaterThanOrEqual(6);
    expect(localAuthorities?.routeFamilies).toContain("homes_for_ukraine");
  });

  test("maps case files back to the best matching entity page", () => {
    const trails = getRouteInvestigationTrails(localRouteLatest.areas, hotelLedger, moneyLedger, 3);
    const leadEntity = getLeadEntityProfileForTrail(trails[0]!);

    expect(leadEntity).toBeTruthy();
    expect(leadEntity?.entityId).toMatch(/^supplier_/);
  });

  test("finds entity profiles by name or company-number reference", () => {
    expect(getEntityProfileByReference("Serco", null)?.entityId).toBe("supplier_serco");
    expect(getEntityProfileByReference("Somani Hotels Limited", "03929881")?.entityId).toBe("supplier_03929881");
  });
});
