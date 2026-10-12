#!/usr/bin/env python3
"""
HMRC payrolled employments in the UK by nationality: monthly series from July 2014 to the
newest reference month published (Table 1 of the region and industry data tables).

Provides the labour-market stock to pair with NINo flow: a NINo registers a person at
first work or claim; HMRC RTI counts employments on a UK payroll each month. Together
they show whether arrivals of a nationality are converting into PAYE employment.

Inputs:
  data/raw/hmrc_rti/Payrolled_employments_in_the_UK_by_nationality__region_and_industry__
    from_July_2014_to_<Month>_<year>.ods, newest edition, resolved by stem
    (scripts/fetch/fetch-hmrc-payroll.mjs downloads it)
  data/raw/supplementary/nino-statxplore-cube.json (NINo flow summed across LAs; this
    refresh leaves it at the data it holds)

Output:
  src/data/live/payroll-by-nationality.json

What is read from the workbook rather than written here: the reference period and the
publication date (cover sheet), the publisher ("Produced by" line), the table (by its
title), the nationality columns (by header) and the months (by date text). The five-year
baseline is the same calendar month five years earlier, found by its date.

Caveats:
  - HMRC RTI counts EMPLOYMENTS, not employees: one person with two jobs counts twice.
  - Self-employment, students not working, dependants and benefit claimants are not in
    this series. NINo is broader.
  - 47 nationalities are published. Smaller cohorts appear only in the UK, EU and non-EU
    totals of the industry tables.
  - National only at this granularity; there is no local authority RTI by nationality.
  - Not in the weekly refresh: the NINo cube needs a Stat-Xplore key.
"""
import json
import re
import sys
from collections import defaultdict
from pathlib import Path

import pandas as pd

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "lib"))
import hmrc_payroll_workbook as wbk  # noqa: E402

ROOT = Path(__file__).resolve().parents[2]
RAW_DIR = ROOT / "data/raw/hmrc_rti"
NINO_CUBE = ROOT / "data/raw/supplementary/nino-statxplore-cube.json"
OUT = ROOT / "src/data/live/payroll-by-nationality.json"

TABLE_TITLE = r"^Monthly counts of payrolled employments in the UK, by nationality$"

# HMRC nationality column -> NINo nationality name
HMRC_TO_NINO = {
    "USA": "United States",
    "Czechia": "Czech Republic",
}

MONTH_ABBR = {m: i for i, m in enumerate(
    ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"], start=1)}
MONTH_NAMES = ["", "January", "February", "March", "April", "May", "June", "July",
               "August", "September", "October", "November", "December"]


def quarter_bounds(label: str):
    """'Jan-25 to Mar-25' -> ('January 2025', 'March 2025')."""
    m = re.fullmatch(r"(\w{3})-(\d{2}) to (\w{3})-(\d{2})", label.strip())
    if not m:
        raise RuntimeError(f"unrecognised NINo quarter label {label!r}")
    a = f"{MONTH_NAMES[MONTH_ABBR[m.group(1).lower()]]} 20{m.group(2)}"
    b = f"{MONTH_NAMES[MONTH_ABBR[m.group(3).lower()]]} 20{m.group(4)}"
    return a, b


def load_nino_uk_totals():
    """NINo registrations by nationality, summed over the cube's latest four quarters."""
    cube = json.loads(NINO_CUBE.read_text())
    fields = cube["fields"]
    nat_field = next(f for f in fields if f.get("label") == "Nationality")
    qtr_field = next(f for f in fields if f.get("label") == "Quarter of Registration")
    if fields.index(nat_field) != 1 or fields.index(qtr_field) != 2:
        raise RuntimeError("NINo cube field order has changed; values are indexed [area][nationality][quarter]")
    n_qtr = len(qtr_field["items"])
    recent4 = list(range(n_qtr - 4, n_qtr))
    values = cube["cubes"][list(cube["cubes"].keys())[0]]["values"]
    t = defaultdict(int)
    for la_slice in values:
        for ni in range(len(nat_field["items"])):
            cell = la_slice[ni]
            for qi in recent4:
                v = cell[qi] if qi < len(cell) else 0
                if v:
                    t[nat_field["items"][ni]["labels"][0]] += int(v)
    first, _ = quarter_bounds(qtr_field["items"][recent4[0]]["labels"][0])
    _, last = quarter_bounds(qtr_field["items"][recent4[-1]]["labels"][0])
    return dict(t), f"{first} to {last}"


def main():
    src = wbk.resolve(RAW_DIR)
    sheets = wbk.read_all(src)
    cov = wbk.cover(sheets)
    hits = wbk.find_table(sheets, TABLE_TITLE)
    if len(hits) != 1:
        raise RuntimeError(f"expected one table titled like {TABLE_TITLE!r}, found {[h[0] for h in hits]}")
    sheet, table_title, _ = hits[0]
    data = wbk.table_frame(sheets[sheet], sheet)
    wbk.check_months(data, sheet, cov["periodEnd"])
    nationality_cols = [c for c in data.columns[1:] if c]
    if len(nationality_cols) < 40:
        raise RuntimeError(f"sheet {sheet}: only {len(nationality_cols)} nationality columns")

    latest_row = data.iloc[-1]
    latest_date = wbk.norm(latest_row["Date"])
    five_y_back = wbk.same_month_years_back(data, 5)
    if five_y_back is None:
        raise RuntimeError(f"sheet {sheet}: no row five years before {latest_date}")
    five_y_back_date = wbk.norm(five_y_back["Date"])

    nino, nino_period = load_nino_uk_totals()

    nationalities = []
    for col in nationality_cols:
        latest = latest_row[col]
        prior = five_y_back[col]
        if pd.isna(latest):
            continue
        latest = int(latest)
        nino_name = HMRC_TO_NINO.get(col, col)
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
            "ninoFlowRollingYear_UK": nino.get(nino_name),
        })

    nationalities.sort(key=lambda r: -r["payrollLatest"])
    by_change = sorted(
        [r for r in nationalities if r["payrollChange5y"] is not None],
        key=lambda r: -r["payrollChange5y"],
    )

    time_series = {}
    dates = [wbk.norm(d) for d in data["Date"]]
    for col in nationality_cols:
        time_series[col] = [[d, int(v)] for d, v in zip(dates, data[col].tolist()) if not pd.isna(v)]

    out = {
        "source": (
            f"{cov['publisher']}, {cov['title']}, published {pd.Timestamp(cov['published']).strftime('%-d %B %Y')} "
            f"(table: {table_title}). Joined with DWP Stat-Xplore NINo registrations to adult "
            f"overseas nationals, {nino_period}."
        ),
        "sourceUrl": wbk.COLLECTION_PAGE,
        "sourceFile": src.name,
        "lastUpdated": cov["published"],
        "latestSnapshotDate": latest_date,
        "fiveYearBaselineDate": five_y_back_date,
        "caveat": (
            "HMRC RTI counts employments, not employees: one person with two jobs is counted "
            "twice. The series excludes the self-employed, students not working, dependants "
            f"and the inactive. {len(nationalities)} nationalities are published; smaller "
            "cohorts appear only in the UK, EU and non-EU totals. National granularity only: "
            "there is no local authority RTI by nationality. NINo flow and HMRC payroll are "
            "different concepts and should not be summed."
        ),
        "totalNationalitiesPublished": len(nationalities),
        "topByLatestPayroll": nationalities[:15],
        "topGainersBy5yChange": by_change[:10],
        "topLosersBy5yChange": list(reversed(by_change[-10:])),
        "timeSeries": time_series,
    }
    OUT.write_text(json.dumps(out, indent=2, ensure_ascii=False) + "\n")
    print(f"Read {src.name}, sheet {sheet}: {table_title}")
    print(f"{cov['title']}; published {cov['published']}")
    print(f"Latest {latest_date}; five-year baseline {five_y_back_date}; {len(nationalities)} nationalities")
    print(f"NINo join: {nino_period}")
    print(f"Wrote {OUT}")


if __name__ == "__main__":
    main()
