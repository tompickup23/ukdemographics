#!/usr/bin/env python3
"""
HMRC Real Time Information — payrolled employments by nationality, UK
monthly time series Jul 2014 - Dec 2024.

Provides the labour-market stock dimension to pair with NINo flow:
NINo registers a person at first work or claim; HMRC RTI counts the
people actually on a UK payroll each month. Together they tell you
whether arrivals from a given nationality are converting into PAYE
employment, and at what rate.

Inputs:
  data/raw/hmrc_rti/payrolled-employments-2014-2024.ods (Table 1)
  data/raw/supplementary/nino-statxplore-cube.json (NINo flow summed
  across LAs)

Output:
  src/data/live/payroll-by-nationality.json

Caveats:
  - HMRC RTI counts EMPLOYMENTS not employees; one person with two
    jobs is counted twice. The headline figure overstates the head
    count by ~3-5%.
  - Self-employment, students-not-working, dependants and benefit
    claimants are NOT in this series. NINo is broader.
  - 47 nationalities only — chosen by HMRC for size/policy salience.
    Many high-flow NINo nationalities (e.g. Eritrea, Sudan, Iraq,
    Afghanistan) are absent because the published series excludes
    smaller cohorts.
  - National only at this granularity. Region splits exist in Tables
    5-17 (UK / EU / Non-EU); LA-level RTI is not published.
"""
import json
from pathlib import Path

import pandas as pd

ROOT = Path(__file__).resolve().parents[2]
SRC = ROOT / "data/raw/hmrc_rti/payrolled-employments-2014-2024.ods"
NINO_CUBE = ROOT / "data/raw/supplementary/nino-statxplore-cube.json"
OUT = ROOT / "src/data/live/payroll-by-nationality.json"


def load_nino_uk_totals():
    cube = json.loads(NINO_CUBE.read_text())
    fields = cube["fields"]
    nat_field = fields[1]
    qtr_field = fields[2]
    n_qtr = len(qtr_field["items"])
    recent4 = list(range(n_qtr - 4, n_qtr))
    values = cube["cubes"][list(cube["cubes"].keys())[0]]["values"]
    totals = {}
    from collections import defaultdict
    t = defaultdict(int)
    for la_slice in values:
        for ni in range(len(nat_field["items"])):
            cell = la_slice[ni]
            for qi in recent4:
                v = cell[qi] if qi < len(cell) else 0
                if v:
                    t[nat_field["items"][ni]["labels"][0]] += int(v)
    return dict(t)


# HMRC nationality column → NINo nationality name
HMRC_TO_NINO = {
    "USA": "United States",
    "Czechia": "Czech Republic",
}


def main():
    df = pd.read_excel(SRC, engine="odf", sheet_name="1", header=None)
    columns = df.iloc[2].tolist()
    # Data rows from index 3 to 128 (last data row before "End of worksheet")
    data = df.iloc[3:].copy()
    data.columns = columns
    data = data[data["Date"].astype(str) != "End of worksheet"]
    data = data.dropna(subset=["Date"])

    # Convert all numeric columns
    for col in columns[1:]:
        data[col] = pd.to_numeric(data[col], errors="coerce")

    # Latest snapshot
    latest_row = data.iloc[-1]
    latest_date = str(latest_row["Date"])

    # 5y prior snapshot
    five_y_back = data.iloc[-61] if len(data) >= 61 else data.iloc[0]
    five_y_back_date = str(five_y_back["Date"])

    nino = load_nino_uk_totals()

    # Build per-nationality summary
    nationalities = []
    for col in columns[1:]:
        latest = latest_row[col]
        prior = five_y_back[col]
        if pd.isna(latest):
            continue
        latest = int(latest)
        nino_name = HMRC_TO_NINO.get(col, col)
        nino_flow = nino.get(nino_name, None)
        change_5y = None
        change_5y_pct = None
        if not pd.isna(prior) and prior > 0:
            change_5y = int(latest - prior)
            change_5y_pct = round(change_5y / prior * 100, 1)
        nationalities.append({
            "country": col,
            "ninoCountryNameUsed": nino_name,
            "payrollLatest": latest,
            "payroll5yPrior": int(prior) if not pd.isna(prior) else None,
            "payrollChange5y": change_5y,
            "payrollChange5yPct": change_5y_pct,
            "ninoFlowRollingYear_UK": nino_flow,
        })

    # Sort by latest payroll
    nationalities.sort(key=lambda r: -r["payrollLatest"])

    # Top growing/shrinking by 5y absolute change
    by_change = sorted(
        [r for r in nationalities if r["payrollChange5y"] is not None],
        key=lambda r: -r["payrollChange5y"],
    )

    # Time series for each nationality (compact: monthly Date + count)
    time_series = {}
    dates = data["Date"].astype(str).tolist()
    for col in columns[1:]:
        ts = []
        for date_label, val in zip(dates, data[col].tolist()):
            if pd.isna(val):
                continue
            ts.append([date_label, int(val)])
        time_series[col] = ts

    out = {
        "source": (
            "HMRC Real Time Information via ONS — Payrolled employments in "
            "the UK by nationality, region and industrial sector, July 2014 "
            "to December 2024 (Table 1: monthly counts of UK payrolled "
            "employments by nationality). Joined with DWP Stat-Xplore "
            "NINo flow rolling year ending Q4 2025."
        ),
        "lastUpdated": "2026-04-28",
        "latestSnapshotDate": latest_date,
        "fiveYearBaselineDate": five_y_back_date,
        "caveat": (
            "HMRC RTI counts EMPLOYMENTS not employees — one person with "
            "two jobs is counted twice. The series excludes self-employed, "
            "students, dependants and the inactive. 47 nationalities are "
            "published; smaller cohorts (Eritrea, Sudan, Iraq, Afghanistan "
            "and many others) are aggregated into UK / EU / Non-EU rollups "
            "only. National granularity only at this level — there is no "
            "LA-level RTI by nationality. NINo flow and HMRC payroll are "
            "different concepts and should not be summed."
        ),
        "totalNationalitiesPublished": len(nationalities),
        "topByLatestPayroll": nationalities[:15],
        "topGainersBy5yChange": by_change[:10],
        "topLosersBy5yChange": list(reversed(by_change[-10:])),
        "timeSeries": time_series,
    }
    OUT.write_text(json.dumps(out, indent=2))
    print(f"Wrote {OUT}")
    print(f"Latest snapshot: {latest_date}")
    print(f"5y baseline:     {five_y_back_date}")
    print(f"Nationalities:   {len(nationalities)}")
    print(f"\nTop 10 by latest UK payroll:")
    for n in nationalities[:10]:
        chg = f"{n['payrollChange5yPct']:+.1f}%" if n['payrollChange5yPct'] is not None else "n/a"
        nino_str = f"NINo {n['ninoFlowRollingYear_UK']:,}" if n['ninoFlowRollingYear_UK'] else "n/a"
        print(f"  {n['country']:18s} payroll {n['payrollLatest']:>9,}   5y {chg:>8s}   {nino_str}")
    print(f"\nTop 5 gainers (5y absolute):")
    for n in by_change[:5]:
        print(f"  {n['country']:18s} {n['payrollChange5y']:+,}  ({n['payrollChange5yPct']:+.1f}%)")
    print(f"\nTop 5 losers:")
    for n in list(reversed(by_change[-5:])):
        print(f"  {n['country']:18s} {n['payrollChange5y']:+,}  ({n['payrollChange5yPct']:+.1f}%)")


if __name__ == "__main__":
    main()
