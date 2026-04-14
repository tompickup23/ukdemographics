import { describe, expect, it } from "vitest";
import type { MoneyRecord } from "../src/lib/money-data";
import {
  getMoneyBuyerSummaries,
  getMoneyLinkedRegionSummaries,
  getMoneyRecordTypeSummaries,
  getMoneyRouteSummaries
} from "../src/lib/money-analytics";

function makeRecord(overrides: Partial<MoneyRecord>): MoneyRecord {
  return {
    recordId: "record-a",
    recordType: "prime_contract_scope",
    title: "Alpha",
    buyerName: "Home Office",
    buyerBodyId: "home_office",
    supplierId: "supplier-a",
    supplierName: "Supplier A",
    supplierCompanyNumber: null,
    supplierRole: "prime_provider",
    routeFamily: "asylum_support",
    schemeLabel: null,
    scopeClass: "route_specific",
    status: "active",
    noticeType: null,
    awardDate: null,
    publishedDate: null,
    periodLabel: null,
    valueGbp: 100,
    valueKind: "contract_value",
    geographyScope: null,
    siteIds: ["site-a"],
    linkedSites: [
      {
        siteId: "site-a",
        siteName: "Alpha Hotel",
        areaName: "Alpha",
        regionName: "North West",
        entityCoverage: "partial"
      }
    ],
    sourceTitle: "Source",
    sourceUrl: "https://example.com/a",
    confidence: "high",
    notes: null,
    ...overrides
  };
}

describe("money analytics helpers", () => {
  it("aggregates route summaries with distinct buyers, suppliers, and sites", () => {
    const summaries = getMoneyRouteSummaries([
      makeRecord({ recordId: "a", supplierName: "Supplier A", valueGbp: 100 }),
      makeRecord({
        recordId: "b",
        supplierName: "Supplier B",
        buyerName: "Council",
        valueGbp: 50,
        linkedSites: [
          {
            siteId: "site-b",
            siteName: "Bravo Hotel",
            areaName: "Bravo",
            regionName: "North West",
            entityCoverage: "unresolved"
          }
        ]
      }),
      makeRecord({
        recordId: "c",
        routeFamily: "homes_for_ukraine",
        supplierName: "Supplier C",
        linkedSites: [],
        siteIds: [],
        valueGbp: null
      })
    ]);

    expect(summaries[0].routeFamily).toBe("asylum_support");
    expect(summaries[0].recordCount).toBe(2);
    expect(summaries[0].rowsWithValue).toBe(2);
    expect(summaries[0].disclosedValueTotal).toBe(150);
    expect(summaries[0].linkedSiteCount).toBe(2);
    expect(summaries[0].buyerCount).toBe(2);
    expect(summaries[0].supplierCount).toBe(2);
  });

  it("aggregates buyer summaries", () => {
    const summaries = getMoneyBuyerSummaries([
      makeRecord({ recordId: "a", buyerName: "Home Office", valueGbp: 100 }),
      makeRecord({ recordId: "b", buyerName: "Home Office", routeFamily: "uk_resettlement_scheme", valueGbp: null }),
      makeRecord({ recordId: "c", buyerName: "Council", linkedSites: [], siteIds: [], valueGbp: 50 })
    ]);

    expect(summaries[0].buyerName).toBe("Home Office");
    expect(summaries[0].recordCount).toBe(2);
    expect(summaries[0].rowsWithValue).toBe(1);
    expect(summaries[0].disclosedValueTotal).toBe(100);
    expect(summaries[0].routeFamilyCount).toBe(2);
  });

  it("aggregates record type summaries", () => {
    const summaries = getMoneyRecordTypeSummaries([
      makeRecord({ recordId: "a", recordType: "prime_contract_scope", valueGbp: 100 }),
      makeRecord({ recordId: "b", recordType: "prime_contract_scope", valueGbp: null }),
      makeRecord({ recordId: "c", recordType: "funding_instruction", valueGbp: 25 })
    ]);

    expect(summaries[0].recordType).toBe("prime_contract_scope");
    expect(summaries[0].recordCount).toBe(2);
    expect(summaries[0].rowsWithValue).toBe(1);
    expect(summaries[0].disclosedValueTotal).toBe(100);
  });

  it("aggregates linked region summaries by distinct site", () => {
    const summaries = getMoneyLinkedRegionSummaries([
      makeRecord({
        recordId: "a",
        linkedSites: [
          {
            siteId: "site-a",
            siteName: "Alpha Hotel",
            areaName: "Alpha",
            regionName: "North West",
            entityCoverage: "partial"
          },
          {
            siteId: "site-b",
            siteName: "Bravo Hotel",
            areaName: "Bravo",
            regionName: "North West",
            entityCoverage: "partial"
          }
        ],
        valueGbp: 100
      }),
      makeRecord({
        recordId: "b",
        linkedSites: [
          {
            siteId: "site-b",
            siteName: "Bravo Hotel",
            areaName: "Bravo",
            regionName: "North West",
            entityCoverage: "partial"
          }
        ],
        valueGbp: null
      }),
      makeRecord({
        recordId: "c",
        linkedSites: [
          {
            siteId: "site-c",
            siteName: "Charlie Hotel",
            areaName: "Charlie",
            regionName: "South East",
            entityCoverage: "partial"
          }
        ],
        valueGbp: 25
      })
    ]);

    expect(summaries[0].regionName).toBe("North West");
    expect(summaries[0].recordCount).toBe(2);
    expect(summaries[0].linkedSiteCount).toBe(2);
    expect(summaries[0].rowsWithValue).toBe(1);
    expect(summaries[0].disclosedValueTotal).toBe(100);
  });
});
