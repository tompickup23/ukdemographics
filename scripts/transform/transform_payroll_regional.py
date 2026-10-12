#!/usr/bin/env python3
"""
HMRC payrolled employments by region and industry for UK, EU and non-EU nationals: the
regional tables of the newest region and industry data tables workbook (England, the
nine English regions, Scotland, Wales and Northern Ireland).

Inputs:
  data/raw/hmrc_rti/Payrolled_employments_in_the_UK_by_nationality__region_and_industry__
    from_July_2014_to_<Month>_<year>.ods, newest edition, resolved by stem
    (scripts/fetch/fetch-hmrc-payroll.mjs downloads it)

Output:
  src/data/live/payroll-by-region-industry.json

Schema:
  {
    "regions": {
      "North West": {
        "latestSnapshotDate": "December 2025",
        "fiveYearBaselineDate": "December 2020",
        "totalEmployment": ...,
        "byNationalityGroup": {"UK": ..., "EU": ..., "NonEU": ...},
        "nonUkSharePct": ...,
        "fiveYearChange": {"Total": ..., "UK": ..., "EU": ..., "NonEU": ...},
        "byIndustry": {
          "Manufacturing": {"total": ..., "UK": ..., "EU": ..., "NonEU": ...,
                            "nonUkSharePct": ..., "change5y": ..., "change5yPct": ...},
          ...
        }
      }
    }
  }

Each table is found by its title, and its region is read from that title, so a change in
sheet order cannot file one region's figures under another's name. Columns are parsed
from their header text. The reference period and publication date come from the cover.
Regions are named as on this site's place pages ("East", "Yorkshire and the Humber").
"""
import json
import re
import sys
from pathlib import Path

import pandas as pd

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "lib"))
import hmrc_payroll_workbook as wbk  # noqa: E402

ROOT = Path(__file__).resolve().parents[2]
RAW_DIR = ROOT / "data/raw/hmrc_rti"
OUT = ROOT / "src/data/live/payroll-by-region-industry.json"

REGION_TABLE = (
    r"^Monthly counts of payrolled employments in (?:the )?(?P<region>.+?) by industry "
    r"SIC codes \(A-U\) for UK, EU and non-EU nationals$"
)
# Every region a place page can ask for, in the order the old output listed them.
REGIONS = [
    "England", "North East", "North West", "Yorkshire and the Humber", "East Midlands",
    "West Midlands", "East", "London", "South East", "South West", "Scotland", "Wales",
    "Northern Ireland",
]


def parse_column_header(h):
    """(industry or None, group in UK/EU/NonEU/Total) for a column header, or None."""
    if not h or h == "Date":
        return None
    # Check non-EU before EU: "non-EU nationals" contains "EU nationals".
    if "non-EU nationals" in h:
        group = "NonEU"
    elif "UK nationals" in h:
        group = "UK"
    elif "EU nationals" in h:
        group = "EU"
    elif h.startswith("Total employment counts"):
        group = "Total"
    else:
        return None
    m = re.search(r" in (.+)$", h)
    return (m.group(1).strip() if m else None, group)


def num(row, col):
    v = row[col]
    try:
        return int(v) if pd.notna(v) else None
    except (ValueError, TypeError):
        return None


def region_summary(body: pd.DataFrame, sheet: str) -> dict:
    col_meta = []
    for col in body.columns[1:]:
        parsed = parse_column_header(col)
        if parsed:
            col_meta.append((*parsed, col))
    region_level = {g for ind, g, _ in col_meta if ind is None}
    if region_level != {"Total", "UK", "EU", "NonEU"}:
        raise RuntimeError(f"sheet {sheet}: region-wide columns found for {sorted(region_level)}")
    industries = {ind for ind, _, _ in col_meta if ind}
    if len(industries) < 15:
        raise RuntimeError(f"sheet {sheet}: only {len(industries)} industries parsed from the headers")

    latest_row = body.iloc[-1]
    five_y_back = wbk.same_month_years_back(body, 5)
    if five_y_back is None:
        raise RuntimeError(f"sheet {sheet}: no row five years before {wbk.norm(latest_row['Date'])}")

    region_totals = {"Total": None, "UK": None, "EU": None, "NonEU": None}
    prior_totals = dict(region_totals)
    by_industry = {}
    for industry, group, col in col_meta:
        if industry is None:
            region_totals[group] = num(latest_row, col)
            prior_totals[group] = num(five_y_back, col)
        else:
            ind = by_industry.setdefault(industry, {"latest": {}, "prior": {}})
            ind["latest"][group] = num(latest_row, col)
            ind["prior"][group] = num(five_y_back, col)

    industries_out = {}
    for ind, vals in by_industry.items():
        total = vals["latest"].get("Total")
        uk = vals["latest"].get("UK")
        non_uk_share = round((total - uk) / total * 100, 1) if (total and total > 0 and uk is not None) else None
        t5 = vals["prior"].get("Total")
        chg5y = (total - t5) if (total is not None and t5 is not None) else None
        industries_out[ind] = {
            "total": total,
            "UK": uk, "EU": vals["latest"].get("EU"), "NonEU": vals["latest"].get("NonEU"),
            "nonUkSharePct": non_uk_share,
            "change5y": chg5y,
            "change5yPct": round(chg5y / t5 * 100, 1) if (chg5y is not None and t5) else None,
        }

    chg5y = {}
    for g in ("Total", "UK", "EU", "NonEU"):
        latest, prior = region_totals[g], prior_totals[g]
        chg5y[g] = (latest - prior) if (latest is not None and prior is not None) else None

    return {
        "latestSnapshotDate": wbk.norm(latest_row["Date"]),
        "fiveYearBaselineDate": wbk.norm(five_y_back["Date"]),
        "totalEmployment": region_totals["Total"],
        "byNationalityGroup": {"UK": region_totals["UK"], "EU": region_totals["EU"], "NonEU": region_totals["NonEU"]},
        "nonUkSharePct": (
            round((region_totals["Total"] - region_totals["UK"]) / region_totals["Total"] * 100, 1)
            if region_totals["Total"] and region_totals["UK"] is not None else None
        ),
        "fiveYearChange": chg5y,
        "byIndustry": industries_out,
    }


def main():
    src = wbk.resolve(RAW_DIR)
    sheets = wbk.read_all(src)
    cov = wbk.cover(sheets)
    found = {}
    for sheet, _, m in wbk.find_table(sheets, REGION_TABLE):
        region = m.group("region")
        if region in found:
            raise RuntimeError(f"two tables for {region}: sheets {found[region]} and {sheet}")
        found[region] = sheet
    missing = [r for r in REGIONS if r not in found]
    extra = [r for r in found if r not in REGIONS]
    if missing or extra:
        raise RuntimeError(f"regional tables: missing {missing}, unexpected {extra}")

    out_regions = {}
    for region in REGIONS:
        sheet = found[region]
        body = wbk.table_frame(sheets[sheet], sheet)
        wbk.check_months(body, sheet, cov["periodEnd"])
        out_regions[region] = region_summary(body, sheet)
        r = out_regions[region]
        print(f"  {region} (sheet {sheet}): total {r['totalEmployment']:,}, non-UK {r['nonUkSharePct']}%")

    out = {
        "source": (
            f"{cov['publisher']}, {cov['title']}, published "
            f"{pd.Timestamp(cov['published']).strftime('%-d %B %Y')} (regional tables: monthly "
            "counts of payrolled employments by industry SIC codes (A-U) for UK, EU and "
            "non-EU nationals). This file holds the latest month and the change from the "
            "same month five years earlier, per region and industry."
        ),
        "sourceUrl": wbk.COLLECTION_PAGE,
        "sourceFile": src.name,
        "lastUpdated": cov["published"],
        "caveat": (
            "Counts are employments, not employees (a person with two jobs is counted "
            "twice), rounded to the nearest 100, so breakdowns may not sum to totals. "
            "Region is where the employee lives, not where they work. Industry is the SIC "
            "2007 section (A to U). Cells HMRC marks [c] (confidential) appear as missing."
        ),
        "regions": out_regions,
    }
    OUT.write_text(json.dumps(out, indent=2, ensure_ascii=False) + "\n")
    print(f"Read {src.name}: {cov['title']}; published {cov['published']}")
    print(f"Wrote {OUT} ({len(out_regions)} regions)")


if __name__ == "__main__":
    main()
