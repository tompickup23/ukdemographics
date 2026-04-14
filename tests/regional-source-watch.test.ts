import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";

interface RegionalSourceWatch {
  summary: {
    regionalPartnerCount: number;
    similarOrganisationCount: number;
    archiveToolCount: number;
    archivedResearchInputCount: number;
    regionalPartnerAssetCount: number;
    regionalPartnerDashboardCount: number;
    migrationObservatoryGuideLinkCount: number;
    nwrsmpWorkbookCount: number;
    nwrsmpHistoricWorkbookCount: number;
    nwrsmpAuthorityObservationCount: number;
    nwrsmpLatestGroupRowCount: number;
    nwrsmpSupportedSeriesAreaCount: number;
    nwrsmpSupportedSeriesPointCount: number;
  };
  nwrsmp: {
    pageUrl: string;
    dashboardUrl: string | null;
    documents: Array<{
      title: string;
      publishedAt: string;
      sourceUrl: string;
      format: string;
    }>;
    supportedSeries: {
      areaCount: number;
      pointCount: number;
      firstPeriodEnd: string;
      latestPeriodEnd: string;
      primaryWorkbookPublishedAt: string | null;
    };
  };
  regionalPartnerAssets: Array<{
    organisation: string;
    assetTitle: string;
    assetUrl: string;
    assetType: string;
  }>;
  migrationObservatoryGuideLinks: Array<{
    assetTitle: string;
    assetUrl: string;
  }>;
  regionalPartners: Array<{
    organisation: string;
    currentUrl: string;
    historicPriority: string;
  }>;
  similarOrganisations: Array<{
    organisation: string;
    currentUrl: string;
  }>;
  archiveTools: Array<{
    organisation: string;
    currentUrl: string;
  }>;
  archivedResearchInputs: Array<{
    organisation: string;
    currentUrl: string;
  }>;
}

function loadRegionalSourceWatch(): RegionalSourceWatch {
  const url = new URL("../src/data/live/regional-source-watch.json", import.meta.url);
  return JSON.parse(readFileSync(url, "utf8"));
}

describe("regional-source-watch.json", () => {
  const watch = loadRegionalSourceWatch();

  it("tracks regional partner leads and archive tools", () => {
    expect(watch.summary.regionalPartnerCount).toBeGreaterThanOrEqual(4);
    expect(watch.summary.similarOrganisationCount).toBeGreaterThanOrEqual(2);
    expect(watch.summary.archiveToolCount).toBeGreaterThanOrEqual(2);
    expect(watch.summary.archivedResearchInputCount).toBeGreaterThanOrEqual(1);
    expect(watch.summary.regionalPartnerAssetCount).toBeGreaterThanOrEqual(10);
    expect(watch.summary.regionalPartnerDashboardCount).toBeGreaterThanOrEqual(4);
    expect(watch.summary.migrationObservatoryGuideLinkCount).toBeGreaterThanOrEqual(4);
    expect(watch.regionalPartners.length).toBe(watch.summary.regionalPartnerCount);
    expect(watch.similarOrganisations.length).toBe(watch.summary.similarOrganisationCount);
    expect(watch.archiveTools.length).toBe(watch.summary.archiveToolCount);
    expect(watch.archivedResearchInputs.length).toBe(watch.summary.archivedResearchInputCount);
  });

  it("includes a north west workbook series with a latest snapshot", () => {
    expect(watch.summary.nwrsmpWorkbookCount).toBeGreaterThanOrEqual(3);
    expect(watch.nwrsmp.pageUrl).toBe("https://northwestrsmp.org.uk/data-and-insights/");
    expect(watch.nwrsmp.dashboardUrl).toMatch(/^https:\/\/public\.tableau\.com\/views\//);
    expect(watch.nwrsmp.documents[0]?.sourceUrl).toMatch(/^https:\/\/northwestrsmp\.org\.uk\//);
    expect(watch.nwrsmp.documents[0]?.format).toBe("xlsx");
    expect(watch.summary.nwrsmpSupportedSeriesAreaCount).toBeGreaterThan(300);
    expect(watch.summary.nwrsmpSupportedSeriesPointCount).toBeGreaterThan(10000);
    expect(watch.nwrsmp.supportedSeries.firstPeriodEnd).toBe("2014-03-31");
    expect(watch.nwrsmp.supportedSeries.latestPeriodEnd).toBe("2025-12-31");
    expect(watch.nwrsmp.supportedSeries.primaryWorkbookPublishedAt).toBe("2026-02-27");
  });

  it("sorts the north west workbook series newest first", () => {
    const publishedDates = watch.nwrsmp.documents.map((row) => row.publishedAt);
    const sortedDates = [...publishedDates].sort((left, right) => right.localeCompare(left));
    expect(publishedDates).toEqual(sortedDates);
  });

  it("keeps migration observatory, AIDA, and the archived hotel map in distinct lanes", () => {
    expect(watch.similarOrganisations.map((row) => row.organisation)).toContain("Migration Observatory");
    expect(watch.similarOrganisations.map((row) => row.organisation)).toContain("Asylum Information Database (AIDA)");
    expect(watch.archivedResearchInputs[0]?.currentUrl).toMatch(/^https:\/\/web\.archive\.org\/web\//);
  });

  it("extracts concrete partner dashboards and traced local-guide links", () => {
    expect(
      watch.regionalPartnerAssets.some(
        (row) =>
          row.organisation === "Migration Yorkshire" &&
          row.assetTitle === "Refugee and asylum seeker Power BI dashboard" &&
          row.assetUrl.startsWith("https://app.powerbi.com/view")
      )
    ).toBe(true);
    expect(
      watch.regionalPartnerAssets.some(
        (row) =>
          row.organisation === "North East Migration Partnership" &&
          row.assetTitle === "North East regional Power BI dashboard"
      )
    ).toBe(true);
    expect(
      watch.migrationObservatoryGuideLinks.some(
        (row) =>
          row.assetTitle === "Home Office local-authority asylum and resettlement data" &&
          row.assetUrl.includes("asylum-and-resettlement-datasets#local-authority-data")
      )
    ).toBe(true);
  });
});
