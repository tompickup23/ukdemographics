import type { MoneyRecord } from "./money-data";

export interface MoneyRouteSummary {
  routeFamily: string;
  recordCount: number;
  rowsWithValue: number;
  disclosedValueTotal: number;
  linkedSiteCount: number;
  buyerCount: number;
  supplierCount: number;
}

export interface MoneyBuyerSummary {
  buyerName: string;
  recordCount: number;
  rowsWithValue: number;
  disclosedValueTotal: number;
  linkedSiteCount: number;
  routeFamilyCount: number;
}

export interface MoneyRecordTypeSummary {
  recordType: string;
  recordCount: number;
  rowsWithValue: number;
  disclosedValueTotal: number;
}

export interface MoneyLinkedRegionSummary {
  regionName: string;
  recordCount: number;
  rowsWithValue: number;
  linkedSiteCount: number;
  disclosedValueTotal: number;
}

export function getMoneyRouteSummaries(records: MoneyRecord[]): MoneyRouteSummary[] {
  const routes = new Map<
    string,
    {
      recordCount: number;
      rowsWithValue: number;
      disclosedValueTotal: number;
      linkedSiteIds: Set<string>;
      buyers: Set<string>;
      suppliers: Set<string>;
    }
  >();

  for (const record of records) {
    const routeFamily = record.routeFamily ?? "not_route_specific";
    const summary =
      routes.get(routeFamily) ??
      {
        recordCount: 0,
        rowsWithValue: 0,
        disclosedValueTotal: 0,
        linkedSiteIds: new Set<string>(),
        buyers: new Set<string>(),
        suppliers: new Set<string>()
      };

    summary.recordCount += 1;

    if (typeof record.valueGbp === "number") {
      summary.rowsWithValue += 1;
      summary.disclosedValueTotal += record.valueGbp;
    }

    for (const site of record.linkedSites) {
      summary.linkedSiteIds.add(site.siteId);
    }

    if (record.buyerName) {
      summary.buyers.add(record.buyerName);
    }

    if (record.supplierName) {
      summary.suppliers.add(record.supplierName);
    }

    routes.set(routeFamily, summary);
  }

  return [...routes.entries()]
    .map(([routeFamily, summary]) => ({
      routeFamily,
      recordCount: summary.recordCount,
      rowsWithValue: summary.rowsWithValue,
      disclosedValueTotal: summary.disclosedValueTotal,
      linkedSiteCount: summary.linkedSiteIds.size,
      buyerCount: summary.buyers.size,
      supplierCount: summary.suppliers.size
    }))
    .sort((a, b) => b.recordCount - a.recordCount || b.disclosedValueTotal - a.disclosedValueTotal);
}

export function getMoneyBuyerSummaries(records: MoneyRecord[]): MoneyBuyerSummary[] {
  const buyers = new Map<
    string,
    {
      recordCount: number;
      rowsWithValue: number;
      disclosedValueTotal: number;
      linkedSiteIds: Set<string>;
      routeFamilies: Set<string>;
    }
  >();

  for (const record of records) {
    const summary =
      buyers.get(record.buyerName) ??
      {
        recordCount: 0,
        rowsWithValue: 0,
        disclosedValueTotal: 0,
        linkedSiteIds: new Set<string>(),
        routeFamilies: new Set<string>()
      };

    summary.recordCount += 1;

    if (typeof record.valueGbp === "number") {
      summary.rowsWithValue += 1;
      summary.disclosedValueTotal += record.valueGbp;
    }

    if (record.routeFamily) {
      summary.routeFamilies.add(record.routeFamily);
    }

    for (const site of record.linkedSites) {
      summary.linkedSiteIds.add(site.siteId);
    }

    buyers.set(record.buyerName, summary);
  }

  return [...buyers.entries()]
    .map(([buyerName, summary]) => ({
      buyerName,
      recordCount: summary.recordCount,
      rowsWithValue: summary.rowsWithValue,
      disclosedValueTotal: summary.disclosedValueTotal,
      linkedSiteCount: summary.linkedSiteIds.size,
      routeFamilyCount: summary.routeFamilies.size
    }))
    .sort((a, b) => b.disclosedValueTotal - a.disclosedValueTotal || b.recordCount - a.recordCount);
}

export function getMoneyRecordTypeSummaries(records: MoneyRecord[]): MoneyRecordTypeSummary[] {
  const recordTypes = new Map<
    string,
    {
      recordCount: number;
      rowsWithValue: number;
      disclosedValueTotal: number;
    }
  >();

  for (const record of records) {
    const summary =
      recordTypes.get(record.recordType) ??
      {
        recordCount: 0,
        rowsWithValue: 0,
        disclosedValueTotal: 0
      };

    summary.recordCount += 1;

    if (typeof record.valueGbp === "number") {
      summary.rowsWithValue += 1;
      summary.disclosedValueTotal += record.valueGbp;
    }

    recordTypes.set(record.recordType, summary);
  }

  return [...recordTypes.entries()]
    .map(([recordType, summary]) => ({
      recordType,
      recordCount: summary.recordCount,
      rowsWithValue: summary.rowsWithValue,
      disclosedValueTotal: summary.disclosedValueTotal
    }))
    .sort((a, b) => b.recordCount - a.recordCount || b.disclosedValueTotal - a.disclosedValueTotal);
}

export function getMoneyLinkedRegionSummaries(records: MoneyRecord[]): MoneyLinkedRegionSummary[] {
  const regions = new Map<
    string,
    {
      recordIds: Set<string>;
      valuedRecordIds: Set<string>;
      linkedSiteIds: Set<string>;
      disclosedValueTotal: number;
    }
  >();

  for (const record of records) {
    const seenRegions = new Set<string>();

    for (const site of record.linkedSites) {
      const summary =
        regions.get(site.regionName) ??
        {
          recordIds: new Set<string>(),
          valuedRecordIds: new Set<string>(),
          linkedSiteIds: new Set<string>(),
          disclosedValueTotal: 0
        };

      summary.linkedSiteIds.add(site.siteId);

      if (!seenRegions.has(site.regionName)) {
        summary.recordIds.add(record.recordId);

        if (typeof record.valueGbp === "number") {
          summary.valuedRecordIds.add(record.recordId);
          summary.disclosedValueTotal += record.valueGbp;
        }

        seenRegions.add(site.regionName);
      }

      regions.set(site.regionName, summary);
    }
  }

  return [...regions.entries()]
    .map(([regionName, summary]) => ({
      regionName,
      recordCount: summary.recordIds.size,
      rowsWithValue: summary.valuedRecordIds.size,
      linkedSiteCount: summary.linkedSiteIds.size,
      disclosedValueTotal: summary.disclosedValueTotal
    }))
    .sort((a, b) => b.linkedSiteCount - a.linkedSiteCount || b.recordCount - a.recordCount);
}
