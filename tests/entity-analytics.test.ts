import { describe, expect, test } from "vitest";

import {
  getAreaRegionalPrimeProviderCoverage,
  getEntityExposureSummary,
  getEntityLinkedPlaceRankings,
  getEntityRegionalContractCoverage,
  getEntityRegionSpread,
  getEntityTimeline
} from "../src/lib/entity-analytics";
import { getEntityProfile } from "../src/lib/entities";
import { loadHotelEntityLedger } from "../src/lib/hotel-data";
import { loadLocalRouteLatest } from "../src/lib/route-data";

const localRouteLatest = loadLocalRouteLatest();
const hotelLedger = loadHotelEntityLedger();

describe("entity analytics helpers", () => {
  test("summarizes non-resolved exposure for named-estate profiles", () => {
    const serco = getEntityProfile("supplier_serco");

    expect(serco).toBeTruthy();

    const summary = getEntityExposureSummary(serco!);

    expect(summary.currentSiteCount).toBe(5);
    expect(summary.nonResolvedCurrentSiteCount).toBe(5);
    expect(summary.unresolvedCurrentSiteCount).toBe(4);
    expect(summary.partialCurrentSiteCount).toBe(1);
    expect(summary.resolvedCurrentSiteCount).toBe(0);
    expect(summary.leadArea?.areaName).toBe("West Northamptonshire");
  });

  test("groups named-estate footprint by region", () => {
    const mears = getEntityProfile("supplier_mears");

    expect(mears).toBeTruthy();

    const spread = getEntityRegionSpread(mears!);

    expect(spread.length).toBeGreaterThanOrEqual(1);
    expect(spread[0]?.regionName).toBe("Yorkshire and The Humber");
    expect(spread[0]?.currentSiteCount).toBe(2);
    expect(spread[0]?.areaNames).toEqual(expect.arrayContaining(["North Yorkshire", "Wakefield"]));
  });

  test("ranks linked places and stays empty for money-only profiles", () => {
    const serco = getEntityProfile("supplier_serco");
    const publicBodies = getEntityProfile("supplier_participating_local_authorities");

    expect(serco).toBeTruthy();
    expect(publicBodies).toBeTruthy();

    const sercoRankings = getEntityLinkedPlaceRankings(serco!);
    const publicBodyRankings = getEntityLinkedPlaceRankings(publicBodies!);

    expect(sercoRankings[0]?.areaName).toBe("West Northamptonshire");
    expect(sercoRankings[0]?.rank).toBe(1);
    expect(publicBodyRankings).toHaveLength(0);
  });

  test("builds dated timelines from site evidence and money rows", () => {
    const serco = getEntityProfile("supplier_serco");
    const localAuthorities = getEntityProfile("supplier_participating_local_authorities");

    expect(serco).toBeTruthy();
    expect(localAuthorities).toBeTruthy();

    const sercoTimeline = getEntityTimeline(serco!);
    const localAuthorityTimeline = getEntityTimeline(localAuthorities!);

    expect(sercoTimeline.firstCurrentSiteDate).toBe("2025-07-30");
    expect(sercoTimeline.eventCount).toBeGreaterThanOrEqual(2);
    expect(sercoTimeline.events.some((event) => event.title.includes("Bell Hotel"))).toBe(true);

    expect(localAuthorityTimeline.latestMoneyDate).toBeTruthy();
    expect(localAuthorityTimeline.events.every((event) => event.kind === "money_row")).toBe(true);
  });

  test("maps regional prime-provider coverage without confusing it for named estate", () => {
    const serco = getEntityProfile("supplier_serco");
    const birmingham = localRouteLatest.areas.find((area) => area.areaCode === "E08000025");
    const hillingdon = localRouteLatest.areas.find((area) => area.areaCode === "E09000017");

    expect(serco).toBeTruthy();
    expect(birmingham).toBeTruthy();
    expect(hillingdon).toBeTruthy();

    const sercoCoverage = getEntityRegionalContractCoverage(serco!, localRouteLatest.areas, hotelLedger.areas, 5);
    const birminghamProvider = getAreaRegionalPrimeProviderCoverage(
      birmingham!,
      [serco!, getEntityProfile("supplier_mears")!, getEntityProfile("supplier_clearsprings_ready_homes")!],
      localRouteLatest.areas,
      hotelLedger.areas
    );
    const hillingdonProvider = getAreaRegionalPrimeProviderCoverage(
      hillingdon!,
      [serco!, getEntityProfile("supplier_mears")!, getEntityProfile("supplier_clearsprings_ready_homes")!],
      localRouteLatest.areas,
      hotelLedger.areas
    );

    expect(sercoCoverage).toBeTruthy();
    expect(sercoCoverage?.geographyLabels).toEqual(
      expect.arrayContaining(["East of England", "Midlands", "North West"])
    );
    expect(sercoCoverage?.directLinkedAreaCount).toBe(2);
    expect(sercoCoverage?.topCoveredAreas[0]?.areaName).toBe("Birmingham");

    expect(birminghamProvider?.profile.entityId).toBe("supplier_serco");
    expect(hillingdonProvider?.profile.entityId).toBe("supplier_clearsprings_ready_homes");
  });
});
