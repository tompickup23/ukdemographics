import { describe, expect, it } from "vitest";
import {
  filterMoneyExplorerItems,
  sortMoneyExplorerItems,
  summarizeMoneyExplorerItems,
  type MoneyExplorerItem
} from "../src/lib/money-explorer";

const items: MoneyExplorerItem[] = [
  {
    recordId: "a",
    title: "Asylum support tariff row",
    buyerName: "Home Office",
    supplierName: "Provider A",
    routeFamily: "asylum_support",
    recordType: "funding_instruction",
    scopeClass: "route_specific",
    hasValue: true,
    valueGbp: 1200,
    linkedSiteCount: 2,
    siteIds: ["s1", "s2"],
    publishedAt: "2026-02-01",
    searchText: "asylum support tariff row home office provider a"
  },
  {
    recordId: "b",
    title: "Hotel scrutiny estimate",
    buyerName: "NAO",
    supplierName: "Provider B",
    routeFamily: "not_route_specific",
    recordType: "scrutiny_estimate",
    scopeClass: "context_only",
    hasValue: false,
    valueGbp: 0,
    linkedSiteCount: 1,
    siteIds: ["s2"],
    publishedAt: "2026-01-15",
    searchText: "hotel scrutiny estimate nao provider b"
  },
  {
    recordId: "c",
    title: "Homes for Ukraine grant",
    buyerName: "DLUHC",
    supplierName: "",
    routeFamily: "homes_for_ukraine",
    recordType: "funding_instruction",
    scopeClass: "route_specific",
    hasValue: true,
    valueGbp: 600,
    linkedSiteCount: 0,
    siteIds: [],
    publishedAt: "2025-12-20",
    searchText: "homes for ukraine grant dluhc"
  }
];

describe("money explorer helpers", () => {
  it("filters by query, route, value mode, and scope", () => {
    const filtered = filterMoneyExplorerItems(items, {
      query: "asylum",
      routeFamily: "asylum_support",
      recordType: "all",
      buyerName: "all",
      valueMode: "with_value",
      scopeClass: "route_specific",
      sort: "newest"
    });

    expect(filtered.map((item) => item.recordId)).toEqual(["a"]);
  });

  it("sorts by value and summarizes unique linked sites", () => {
    const ordered = sortMoneyExplorerItems(items, "value");
    const summary = summarizeMoneyExplorerItems(ordered);

    expect(ordered.map((item) => item.recordId)).toEqual(["a", "c", "b"]);
    expect(summary.recordCount).toBe(3);
    expect(summary.rowsWithValue).toBe(2);
    expect(summary.disclosedValueTotal).toBe(1800);
    expect(summary.linkedSiteCount).toBe(2);
    expect(summary.leadBuyerName).toBe("DLUHC");
  });
});

