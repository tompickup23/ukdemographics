export interface SupportedAsylumReadingRule {
  title: string;
  body: string;
}

export const supportedAsylumReadingRules: SupportedAsylumReadingRule[] = [
  {
    title: "Quarter-end stock, not throughput",
    body: "Supported asylum counts show how many people were receiving support at the end of the period. They are not new claims, arrivals, or the number of distinct people seen across the period."
  },
  {
    title: "Support is not the same thing as the backlog",
    body: "People awaiting an initial decision and people on asylum support overlap, but they are not identical groups. Some supported people are further into appeals or on other support routes, while some people awaiting an initial decision are not in the published support count."
  },
  {
    title: "Processing and exits move the stock",
    body: "The stock changes when people enter support and when they leave it through case progression, including grants, refusals, withdrawals, departures, or moves out of the published support categories."
  },
  {
    title: "Flat local lines can still hide churn",
    body: "A place hovering around the same level can mean low movement, or heavy turnover with inflows offset by exits. The published local tables do not show how many different people passed through support in that area."
  }
];

export interface AsylumSystemReadingRule {
  title: string;
  body: string;
}

export const asylumSystemReadingRules: AsylumSystemReadingRule[] = [
  {
    title: "Initial outcomes are not latest outcomes",
    body: "Initial decisions show operational output at the time of decision. Latest outcomes by claim year can change later through appeals, reconsiderations, or subsequent case progression, so the two measures should not be treated as interchangeable."
  },
  {
    title: "People, claims, and claim cohorts are different units",
    body: "Home Office asylum tables mix quarterly claim flows, quarter-end stock counts, and claim-year cohorts. The site keeps those units separate and does not add them together as if they were one common total."
  }
];

export function buildSupportedAsylumStockDescription(
  latestPeriodLabel: string,
  hasIllustrativeData = false
): string {
  return `Quarter-end stock series to ${latestPeriodLabel}. A rise or fall is a net change in the number of people on support at period end, not the number of new claims or distinct people moving through the caseload. Support stock also overlaps with, but is not identical to, the awaiting-decision backlog.${hasIllustrativeData ? " Illustrative bridge points are still visible between official anchors." : ""}`;
}
