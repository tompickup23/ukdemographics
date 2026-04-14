import { readFileSync } from "node:fs";

export interface MoneyRecordLinkedSite {
  siteId: string;
  siteName: string;
  areaName: string;
  regionName: string;
  entityCoverage: string;
}

export interface MoneyRecord {
  recordId: string;
  recordType: string;
  title: string;
  buyerName: string;
  buyerBodyId: string | null;
  supplierId: string | null;
  supplierName: string | null;
  supplierCompanyNumber: string | null;
  supplierRole: string | null;
  routeFamily: string | null;
  schemeLabel: string | null;
  scopeClass: string;
  status: string;
  noticeType: string | null;
  awardDate: string | null;
  publishedDate: string | null;
  periodLabel: string | null;
  valueGbp: number | null;
  valueKind: string | null;
  geographyScope: string | null;
  siteIds: string[];
  linkedSites: MoneyRecordLinkedSite[];
  sourceTitle: string | null;
  sourceUrl: string | null;
  confidence: string | null;
  notes: string | null;
}

export interface MoneySupplierProfile {
  supplierId: string;
  entityName: string;
  entityRole: string;
  companyNumber: string | null;
  routeFamilies: string[];
  siteCount: number;
  publicContractCount: number;
  publicContractValueGbp: number | null;
  riskLevel: string | null;
  integritySignalCount: number;
  sourceUrls: string[] | null;
  siteIds: string[];
  notes: string | null;
}

export interface MoneyLedger {
  generatedAt: string;
  summary: {
    totalRecords: number;
    primeContractRows: number;
    fundingInstructionRows: number;
    scrutinyOrCostRows: number;
    rowsWithDisclosedValue: number;
    uniqueSuppliers: number;
    linkedNamedSites: number;
    routeFamiliesCovered: number;
  };
  records: MoneyRecord[];
  supplierProfiles: MoneySupplierProfile[];
  routeGroups: Array<{
    routeFamily: string;
    recordCount: number;
    rowsWithValue: number;
  }>;
  recordTypeGroups: Array<{
    recordType: string;
    recordCount: number;
  }>;
  investigativeLeads: Array<{
    id: string;
    title: string;
    detail: string;
    sourceUrl: string;
    severity: string;
  }>;
  supplierLayers: Array<{
    id: string;
    label: string;
    scope: string;
    examples: string[];
    description: string;
    questions: string[];
  }>;
  limitations: string[];
  sources: Array<{
    name: string;
    sourceUrl: string;
    type: string;
  }>;
}

function readProjectJson<T>(projectRelativePath: string): T {
  const fileUrl = new URL(`../../${projectRelativePath}`, import.meta.url);
  return JSON.parse(readFileSync(fileUrl, "utf8")) as T;
}

export function loadMoneyLedger(): MoneyLedger {
  return readProjectJson<MoneyLedger>("src/data/live/money-ledger.json");
}
