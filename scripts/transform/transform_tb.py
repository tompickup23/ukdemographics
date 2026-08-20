#!/usr/bin/env python3
"""
UKHSA Tuberculosis in England 2025 report (data through end-2024) —
per-LA 3-year-average TB notifications and national time series of TB
notifications by country of birth (non-UK-born population only).

Health-system-burden indicator for the immigration analysis. TB is the
single infectious-disease metric where country-of-birth composition
matters most: ~75% of UK TB notifications are non-UK-born and the
nationality mix of cases tracks the entry-from-high-incidence-country
flow with a multi-year lag.

Inputs:
  data/raw/ukhsa_tb/tb-incidence-2025.xlsx
    Supplementary_Table_8: per-LA 3-year average notifications
    Supplementary_Table_14: time series of notifications by COB

Output:
  src/data/live/tb-notifications.json

Caveats:
  - 3-year average smooths small-district volatility. Burnley's rate
    14.7 per 100k is averaged over 2022-2024.
  - Country of birth is reported only at the national level for the
    full nationality breakdown. The per-LA data does not break down
    by COB.
  - "TB rate" here is per 100,000 population; the England average for
    2024 is 9.5 per 100,000.
"""
import json
from pathlib import Path

import pandas as pd

ROOT = Path(__file__).resolve().parents[2]
SRC = ROOT / "data/raw/ukhsa_tb/tb-incidence-2025.xlsx"
OUT = ROOT / "src/data/live/tb-notifications.json"

# Burnley needs LAD24-friendly area codes. The UKHSA report uses LA NAMES,
# not codes. We'll match to the existing nino-dashboard areas by name.
NAME_TO_CODE_PATH = ROOT / "src/data/live/nino-dashboard.json"


def load_la_table():
    df = pd.read_excel(SRC, engine="openpyxl", sheet_name="Supplementary_Table_8", header=3)
    rows = []
    for _, row in df.iterrows():
        utla = str(row.iloc[1]) if not pd.isna(row.iloc[1]) else None
        ltla = str(row.iloc[2]) if not pd.isna(row.iloc[2]) else None
        if not utla or utla == "nan":
            continue
        try:
            pop = float(row.iloc[3])
            count = float(row.iloc[4])
            rate = float(row.iloc[5])
            lci = float(row.iloc[6])
            uci = float(row.iloc[7])
        except (TypeError, ValueError):
            continue
        rows.append({
            "ukhsa_region": str(row.iloc[0]),
            "utla": utla,
            "ltla": ltla,
            "population_3yr_avg": pop,
            "notifications_3yr_avg": count,
            "rate_per_100k": rate,
            "lower_CI": lci,
            "upper_CI": uci,
        })
    return rows


def load_cob_timeseries():
    df = pd.read_excel(SRC, engine="openpyxl", sheet_name="Supplementary_Table_14", header=3)
    columns = df.columns.tolist()
    # Columns alternate (number, percentage) for each country
    # First column is Year
    countries = []
    for i in range(1, len(columns), 2):
        col = str(columns[i])
        if col.endswith(" (number)"):
            countries.append(col.replace(" (number)", "").strip())
        elif "(number)" in col:
            countries.append(col.split(" (number)")[0].strip())
    series = {}
    for _, row in df.iterrows():
        try:
            year = int(row.iloc[0])
        except (TypeError, ValueError):
            continue
        for i, country in enumerate(countries):
            num_col = 1 + (i * 2)
            pct_col = 2 + (i * 2)
            if num_col >= len(row) or pct_col >= len(row):
                continue
            try:
                n = int(row.iloc[num_col])
                pct = round(float(row.iloc[pct_col]), 2)
            except (TypeError, ValueError):
                continue
            series.setdefault(country, []).append({
                "year": year, "notifications": n, "pctOfNonUkBorn": pct
            })
    return series, countries


def main():
    la_rows = load_la_table()
    cob_series, countries = load_cob_timeseries()

    # Match LA names to ONS codes via existing nino-dashboard
    nino = json.loads(NAME_TO_CODE_PATH.read_text())["areas"]
    name_to_code = {a["areaName"]: code for code, a in nino.items()}

    # Latest year by COB (just the latest row for each country)
    latest_by_cob = {}
    for country, ts in cob_series.items():
        if ts:
            latest = max(ts, key=lambda x: x["year"])
            latest_by_cob[country] = latest

    # Build areas: keyed by district code, with district + parent UTLA TB rates
    # The UKHSA table includes both UTLA and LTLA rows. For two-tier counties,
    # LTLA = the district name. For unitaries, LTLA = UTLA.
    areas = {}
    for r in la_rows:
        # Use LTLA (lower-tier) if it differs from UTLA — that's the district
        name = r["ltla"] if r["ltla"] != r["utla"] else r["utla"]
        code = name_to_code.get(name)
        if not code:
            continue
        areas[code] = {
            "areaName": name,
            "ukhsaRegion": r["ukhsa_region"],
            "parentUtla": r["utla"],
            "population3yrAvg": r["population_3yr_avg"],
            "notifications3yrAvg": r["notifications_3yr_avg"],
            "ratePer100k": r["rate_per_100k"],
            "lowerCI": r["lower_CI"],
            "upperCI": r["upper_CI"],
            "vsEnglandAvgPct": (
                round((r["rate_per_100k"] / 9.5 - 1) * 100, 1)
                if r["rate_per_100k"] else None
            ),
        }

    # Top LAs by rate
    top_rate = sorted(
        [(c, a) for c, a in areas.items() if a["notifications3yrAvg"] >= 5],
        key=lambda kv: -kv[1]["ratePer100k"],
    )[:15]

    # Top COBs by latest year notifications
    top_cob = sorted(
        latest_by_cob.items(),
        key=lambda kv: -kv[1]["notifications"],
    )[:15]

    out = {
        "source": (
            "UKHSA — Tuberculosis in England 2025 report (data through end-"
            "2024). Supplementary Table 8 (per-LA 3-year-average rates) and "
            "Supplementary Table 14 (time series of notifications by country "
            "of birth in the non-UK-born population)."
        ),
        "lastUpdated": "2026-04-28",
        "englandAverageRatePer100k_2024": 9.5,
        "totalNotifications2024": 5480,
        "totalNotifications2023": 4850,
        "totalChange2024Pct": 13.0,
        "caveat": (
            "TB notifications are not arrivals data — they reflect a "
            "multi-year mix of cumulative country-of-birth composition. "
            "Roughly 75% of UK TB cases are in non-UK-born people. The "
            "per-LA data is a 3-year average (2022-2024) which smooths "
            "small-district volatility. Country-of-birth detail is "
            "national only — there is no published per-LA × COB "
            "crosstab for TB notifications."
        ),
        "topLaByRate": [
            {"code": c, "name": a["areaName"], "ratePer100k": a["ratePer100k"],
             "notifications3yrAvg": a["notifications3yrAvg"],
             "vsEnglandAvgPct": a["vsEnglandAvgPct"]}
            for c, a in top_rate
        ],
        "topCountriesOfBirth_latestYear": [
            {"country": c, "year": v["year"], "notifications": v["notifications"],
             "pctOfNonUkBorn": v["pctOfNonUkBorn"]}
            for c, v in top_cob
        ],
        "areas": areas,
        "countryOfBirthTimeSeries": cob_series,
    }
    OUT.write_text(json.dumps(out, indent=2))
    print(f"Wrote {OUT}")
    print(f"LA areas: {len(areas)}")
    print(f"Countries in COB time series: {len(cob_series)}")
    print(f"\nTop 10 LAs by TB rate per 100k:")
    for c, a in top_rate[:10]:
        print(f"  {a['areaName']:25s} {a['ratePer100k']:5.1f}/100k  ({a['vsEnglandAvgPct']:+.0f}% vs England)")
    print(f"\nTop 10 countries of birth (latest year):")
    for c, v in top_cob[:10]:
        print(f"  {c:20s} {v['notifications']:>4} notifications  ({v['pctOfNonUkBorn']}% of non-UK-born)")
    print(f"\nBurnley:")
    burn = areas.get("E07000117")
    if burn:
        print(json.dumps(burn, indent=2))


if __name__ == "__main__":
    main()
