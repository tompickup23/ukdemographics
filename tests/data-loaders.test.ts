import { describe, it, expect } from "vitest";
import { loadRouteDashboard, loadLocalRouteLatest } from "../src/lib/route-data";
import { loadHotelEntityLedger } from "../src/lib/hotel-data";
import { loadMoneyLedger } from "../src/lib/money-data";

describe("route-data loader", () => {
  const dashboard = loadRouteDashboard();
  const local = loadLocalRouteLatest();

  it("loads route dashboard with national cards", () => {
    expect(dashboard.nationalCards.length).toBeGreaterThan(0);
    expect(dashboard.nationalCards[0]).toHaveProperty("label");
    expect(dashboard.nationalCards[0]).toHaveProperty("value");
    expect(dashboard.nationalCards[0]).toHaveProperty("sourceUrl");
  });

  it("loads route families", () => {
    expect(dashboard.routeFamilies.length).toBeGreaterThan(0);
    expect(dashboard.routeFamilies[0]).toHaveProperty("id");
    expect(dashboard.routeFamilies[0]).toHaveProperty("series");
  });

  it("loads national stock and flow dynamics", () => {
    expect(dashboard.nationalSystemDynamics.stockFlowCards.length).toBeGreaterThanOrEqual(4);
    expect(dashboard.nationalSystemDynamics.flowSeries.claims.length).toBeGreaterThan(0);
    expect(dashboard.nationalSystemDynamics.stockSeries.awaitingInitialDecision.length).toBeGreaterThan(0);
    expect(dashboard.nationalSystemDynamics.outcomeCohorts.length).toBeGreaterThan(0);
    expect(dashboard.nationalSystemDynamics.latestQuarter).toHaveProperty("decisionMinusClaims");
    expect(dashboard.nationalSystemDynamics.postDecisionPath.appeals.series.lodged?.length).toBeGreaterThan(0);
    expect(dashboard.nationalSystemDynamics.postDecisionPath.returns.series.total?.length).toBeGreaterThan(0);
    expect(dashboard.nationalSystemDynamics.postDecisionPath.appeals.dataCompleteThroughLabel).toMatch(/^\d{4} Q[1-4]$/);
  });

  it("loads local route areas", () => {
    expect(local.areas.length).toBeGreaterThan(100);
    expect(local.snapshotDate).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it("areas have required fields", () => {
    const area = local.areas[0];
    expect(area).toHaveProperty("areaCode");
    expect(area).toHaveProperty("areaName");
    expect(area).toHaveProperty("supportedAsylum");
    expect(area).toHaveProperty("contingencyAccommodation");
    expect(area).toHaveProperty("homesForUkraineArrivals");
    expect(typeof area.population).toBe("number");
  });

  it("top areas by metric includes supportedAsylum", () => {
    const asylumGroup = local.topAreasByMetric.find((g) => g.metricId === "supportedAsylum");
    expect(asylumGroup).toBeDefined();
    expect(asylumGroup!.rows.length).toBeGreaterThan(0);
  });

  it("keeps supported asylum described as stock rather than throughput", () => {
    const supportedAsylumRoute = dashboard.routeFamilies.find((route) => route.id === "asylum_support");
    const supportedAsylumMetric = local.routeMetricFamilies.find((metric) => metric.id === "supportedAsylum");

    expect(supportedAsylumRoute?.note.toLowerCase()).toContain("stock");
    expect(supportedAsylumRoute?.note.toLowerCase()).toContain("distinct people");
    expect(supportedAsylumMetric?.description.toLowerCase()).toContain("quarter-end stock");
    expect(supportedAsylumMetric?.description.toLowerCase()).toContain("not identical");
    expect(dashboard.limitations.some((item) => item.toLowerCase().includes("flat local"))).toBe(true);
    expect(dashboard.limitations.some((item) => item.toLowerCase().includes("support is not a synonym"))).toBe(true);
    expect(dashboard.limitations.some((item) => item.toLowerCase().includes("appeals dataset"))).toBe(true);
    expect(dashboard.limitations.some((item) => item.toLowerCase().includes("broader than asylum"))).toBe(true);
  });
});

describe("hotel-data loader", () => {
  const ledger = loadHotelEntityLedger();

  it("loads hotel entity ledger with summary", () => {
    expect(ledger.summary).toHaveProperty("totalNamedSites");
    expect(ledger.summary.totalNamedSites).toBeGreaterThan(0);
    expect(ledger.summary.archiveLeadCount).toBeGreaterThan(100);
  });

  it("sites have required fields", () => {
    const site = ledger.sites[0];
    expect(site).toHaveProperty("siteId");
    expect(site).toHaveProperty("siteName");
    expect(site).toHaveProperty("status");
    expect(site).toHaveProperty("entityCoverage");
  });

  it("areas have sighting data", () => {
    expect(ledger.areas.length).toBeGreaterThan(0);
    expect(ledger.areas[0]).toHaveProperty("areaName");
    expect(ledger.areas[0]).toHaveProperty("unnamedSiteCount");
  });

  it("includes archive verification tracking", () => {
    expect(ledger.archiveVerification.totalLeadCount).toBeGreaterThan(100);
    expect(ledger.archiveVerification.publicArchiveMatches.length).toBeGreaterThan(0);
    expect(ledger.archiveVerification.pendingVerificationCount).toBeGreaterThan(0);
    expect(ledger.archiveVerification.promotedNewCount).toBeGreaterThan(0);
  });
});

describe("money-data loader", () => {
  const ledger = loadMoneyLedger();

  it("loads money ledger with records", () => {
    expect(ledger.records.length).toBeGreaterThan(0);
    expect(ledger.summary.totalRecords).toBeGreaterThan(0);
  });

  it("records have required fields", () => {
    const record = ledger.records[0];
    expect(record).toHaveProperty("recordId");
    expect(record).toHaveProperty("title");
    expect(record).toHaveProperty("buyerName");
    expect(record).toHaveProperty("scopeClass");
  });

  it("supplier profiles exist", () => {
    expect(ledger.supplierProfiles.length).toBeGreaterThan(0);
    expect(ledger.supplierProfiles[0]).toHaveProperty("entityName");
  });
});
