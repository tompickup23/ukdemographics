#!/usr/bin/env python3
"""
NHS overseas-visitor funding context — national figures only.

This is a hand-curated dataset compiled from publicly-cited official
sources (Home Office annual reports, NAO reports, House of Commons
Library briefings, DHSC reports). It is NOT a fetched-and-parsed file
because the underlying data is published in narrative reports, not
machine-readable datasets.

Output:
  src/data/live/nhs-funding-context.json

Contents:
  - IHS rate history (£/year, by introduction date)
  - IHS annual revenue (£ millions, by fiscal year)
  - NHS overseas-visitor charging rules summary
  - NHS maternity national budget context
  - Caveats: cost recovery is Trust-level not LA-level, and DHSC
    estimates the bulk of identified overseas-visitor debt is
    uncollected.

Sources cited verbatim in the JSON output.
"""
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
OUT = ROOT / "src/data/live/nhs-funding-context.json"

IHS_RATES = [
    {"effective_from": "2015-04-06", "adult_per_year_gbp": 200, "student_under18_per_year_gbp": 150,
     "note": "IHS introduced under Immigration Act 2014; £200/year for non-student adults, £150/year for students/under-18s."},
    {"effective_from": "2019-01-08", "adult_per_year_gbp": 400, "student_under18_per_year_gbp": 300,
     "note": "Doubled by Immigration (Health Charge) (Amendment) Order 2018."},
    {"effective_from": "2020-10-27", "adult_per_year_gbp": 624, "student_under18_per_year_gbp": 470,
     "note": "Increased to align with NHS per-capita cost estimates."},
    {"effective_from": "2024-02-06", "adult_per_year_gbp": 1035, "student_under18_per_year_gbp": 776,
     "note": "Increased by Immigration (Health Charge) (Amendment) Order 2023."},
]

IHS_REVENUE = [
    {"year": "2020/21", "amount_gbp_millions": 480.82,
     "source": "Home Office annual report and accounts 2020-21"},
    {"year": "2021/22", "amount_gbp_millions": 1423.0,
     "source": "Home Office annual report and accounts 2021-22; Parliamentary written answer HL1647 (2022-07-11)"},
    {"year": "2023/24", "amount_gbp_millions": 1700.0,
     "source": "Home Office annual report and accounts 2023-24; reported as 'over £1.7 billion gross' in HoC Library briefing CBP-7274"},
    {"year": "2024/25", "amount_gbp_millions": 1315.6,
     "source": "Transfers to DHSC and Devolved Administrations, 2024-25 (Home Office accounts)"},
]

# Cumulative gross since introduction (2015) per HoC Library: £6.9bn through 2023/24
IHS_CUMULATIVE_TO_2024 = {
    "amount_gbp_millions": 6900.0,
    "period": "April 2015 to March 2024",
    "source": "House of Commons Library briefing CBP-7274 'The Immigration Health Surcharge'",
}


CHARGING_RULES = {
    "exempt_from_charges": [
        "British citizens and Indefinite Leave to Remain holders",
        "Holders of time-limited UK visas who paid the IHS as part of their visa application",
        "Asylum seekers, refugees, victims of trafficking, humanitarian protection holders",
        "Irish citizens (Common Travel Area)",
        "EEA citizens with valid PRC/S2 documents",
        "UK Armed Forces and their families",
    ],
    "charged_at_150_pct_of_tariff": [
        "Visitors on Standard Visitor visas",
        "Undocumented residents and visa overstayers",
        "Some chargeable cohorts under the Immigration (Charges to Overseas Visitors) Regulations 2015",
    ],
    "indicative_charge_levels_gbp_2024": {
        "Routine_vaginal_delivery_no_complications": [3000, 5500],
        "Caesarean_section": [5000, 7500],
        "Premature_birth_with_NICU": [15000, 30000],
        "Antenatal_appointment": [150, 400],
    },
    "note": (
        "Maternity care is classified as 'immediately necessary' and "
        "cannot be refused or delayed for charging. Trusts must invoice "
        "afterwards. The 150% multiplier is over the NHS national "
        "tariff (NHS Cost Recovery Programme guidance)."
    ),
}

NHS_MATERNITY_BUDGET = {
    "england_annual_total_gbp_billions": 3.0,
    "year": "2023/24",
    "source": "NHS England, NHS payment scheme and maternity tariff publications, 2023/24 financial year",
    "note": (
        "Approximate national NHS maternity budget across England. The "
        "exact figure varies by year and depends on whether you include "
        "neonatal critical care, fertility services, and antenatal "
        "screening. Treat as order-of-magnitude only."
    ),
}

COST_RECOVERY_LIMITATIONS = [
    "NHS cost-recovery returns are submitted by Trusts, not LAs. Per-Trust figures appear in individual NHS Trust annual reports; there is no central downloadable Trust-level dataset.",
    "DHSC estimates that approximately 80% of identified overseas-visitor debt across all NHS treatment is uncollected. Source: NAO 'Overseas visitors charging' (2016) and follow-up Public Accounts Committee scrutiny.",
    "The £400-500 million figure widely cited for 'NHS overseas-visitor debt' covers ALL chargeable treatment, of which maternity is a fraction.",
]


def main():
    out = {
        "source": "Hand-curated from publicly-cited official sources. See per-figure citations.",
        "lastUpdated": "2026-04-29",
        "scope": "England + Wales national figures only. Per-LA breakdowns are not published.",
        "ihsRateHistory": IHS_RATES,
        "ihsRevenueByYear": IHS_REVENUE,
        "ihsCumulativeRevenueSince2015": IHS_CUMULATIVE_TO_2024,
        "chargingRules": CHARGING_RULES,
        "nhsMaternityBudget": NHS_MATERNITY_BUDGET,
        "costRecoveryLimitations": COST_RECOVERY_LIMITATIONS,
        "primarySources": [
            "NHS (Charges to Overseas Visitors) Regulations 2015 (as amended), legislation.gov.uk",
            "Home Office, Immigration Health Surcharge: caseworker guidance v10.0 (Sept 2025)",
            "House of Commons Library briefing CBP-7274 'The Immigration Health Surcharge'",
            "NAO, 'Recovering the cost of NHS treatment for overseas visitors' (2016) and follow-ups",
            "Home Office annual report and accounts (2020-21, 2021-22, 2022-23, 2023-24, 2024-25)",
            "NHS England, Guidance on implementing the overseas visitor charging regulations",
            "NHS England, NHS Payment Scheme (national tariff)",
        ],
    }
    OUT.write_text(json.dumps(out, indent=2))
    print(f"Wrote {OUT}")
    print(f"\nIHS rate history: {len(IHS_RATES)} rate changes")
    print(f"IHS revenue series: {len(IHS_REVENUE)} fiscal years")
    print(f"\nLatest IHS rate (Feb 2024 onwards): £{IHS_RATES[-1]['adult_per_year_gbp']}/year (adult)")
    print(f"Latest IHS revenue (2024/25): £{IHS_REVENUE[-1]['amount_gbp_millions']:.1f}m transfer to DHSC")


if __name__ == "__main__":
    main()
