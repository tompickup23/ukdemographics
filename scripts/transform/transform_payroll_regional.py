#!/usr/bin/env python3
"""
Parse HMRC RTI Tables 5-17 (England + 9 regions + Scotland + Wales + NI)
into a per-region × per-industry × {UK, EU, Non-EU} dataset.

Inputs:
  data/raw/hmrc_rti/payrolled-employments-2014-2024.ods

Output:
  src/data/live/payroll-by-region-industry.json

Schema:
  {
    "regions": {
      "North West": {
        "latestSnapshotDate": "December 2024",
        "totalEmployment": ...,
        "byNationalityGroup": {"UK": ..., "EU": ..., "NonEU": ...},
        "byIndustry": {
          "Manufacturing": {
            "total": ..., "UK": ..., "EU": ..., "NonEU": ...,
            "nonUkSharePct": ...
          },
          ...
        },
        "5yChange": {
          "totalEmployment": int, "UK": int, "EU": int, "NonEU": int
        }
      }
    }
  }
"""
import json
from pathlib import Path
import re

import pandas as pd

ROOT = Path(__file__).resolve().parents[2]
SRC = ROOT / "data/raw/hmrc_rti/payrolled-employments-2014-2024.ods"
OUT = ROOT / "src/data/live/payroll-by-region-industry.json"

# Each table covers one region; sheet number to region name
SHEET_TO_REGION = {
    "5":  "England",
    "6":  "North East",
    "7":  "North West",
    "8":  "Yorkshire and the Humber",
    "9":  "East Midlands",
    "10": "West Midlands",
    "11": "East",
    "12": "London",
    "13": "South East",
    "14": "South West",
    "15": "Scotland",
    "16": "Wales",
    "17": "Northern Ireland",
}

# Map of header substring -> {industry, group} parsing
def parse_column_header(h):
    """Returns (industry_or_None, group_in_{UK,EU,NonEU,Total}, label) for column."""
    if h is None or pd.isna(h) or h == "Date":
        return None
    h = str(h)
    # Determine group
    # CRITICAL: check non-EU BEFORE EU (non-EU contains "EU nationals" substring).
    if "non-EU nationals" in h:
        group = "NonEU"
    elif "UK nationals" in h:
        group = "UK"
    elif "EU nationals" in h:
        group = "EU"
    elif "Total employment counts" in h:
        group = "Total"
    else:
        return None
    # Industry — text after "in" if present
    m = re.search(r" in (.+)$", h)
    industry = m.group(1).strip() if m else None
    return (industry, group)


def main():
    out_regions = {}
    for sheet_id, region_name in SHEET_TO_REGION.items():
        # Auto-detect header row: scan first 6 rows for the one starting "Date"
        df_raw = pd.read_excel(SRC, engine="odf", sheet_name=sheet_id, header=None, nrows=6)
        header_row = None
        for i in range(len(df_raw)):
            if str(df_raw.iloc[i, 0]).strip() == "Date":
                header_row = i
                break
        if header_row is None:
            print(f"  WARNING: {region_name} ({sheet_id}) — couldn't find Date header")
            continue
        df = pd.read_excel(SRC, engine="odf", sheet_name=sheet_id, header=header_row)
        df = df[df["Date"].astype(str) != "End of worksheet"]
        df = df.dropna(subset=["Date"])

        # Build column index: list of (industry, group, col)
        col_meta = []
        for col in df.columns[1:]:
            parsed = parse_column_header(col)
            if parsed:
                col_meta.append((*parsed, col))

        # Latest snapshot row + 5y prior
        latest_row = df.iloc[-1]
        five_y_back = df.iloc[-61] if len(df) >= 61 else df.iloc[0]

        latest_date = str(latest_row["Date"])
        five_y_back_date = str(five_y_back["Date"])

        def num(row, col):
            v = row[col]
            try:
                return int(v) if pd.notna(v) else None
            except (ValueError, TypeError):
                return None

        # Total / UK / EU / NonEU at the region-wide level (industry=None)
        region_totals = {"Total": None, "UK": None, "EU": None, "NonEU": None}
        prior_totals = {"Total": None, "UK": None, "EU": None, "NonEU": None}
        by_industry = {}
        for industry, group, col in col_meta:
            if industry is None:
                region_totals[group] = num(latest_row, col)
                prior_totals[group] = num(five_y_back, col)
            else:
                ind = by_industry.setdefault(industry, {"latest": {}, "prior": {}})
                ind["latest"][group] = num(latest_row, col)
                ind["prior"][group] = num(five_y_back, col)

        # Compute non-UK shares per industry
        industries_out = {}
        for ind, vals in by_industry.items():
            total = vals["latest"].get("Total")
            uk = vals["latest"].get("UK")
            eu = vals["latest"].get("EU")
            non_eu = vals["latest"].get("NonEU")
            non_uk_share = None
            if total and total > 0 and uk is not None:
                non_uk_share = round((total - uk) / total * 100, 1)
            t5 = vals["prior"].get("Total")
            chg5y = (total - t5) if (total is not None and t5 is not None) else None
            chg5y_pct = round(chg5y / t5 * 100, 1) if (chg5y is not None and t5) else None
            industries_out[ind] = {
                "total": total,
                "UK": uk, "EU": eu, "NonEU": non_eu,
                "nonUkSharePct": non_uk_share,
                "change5y": chg5y,
                "change5yPct": chg5y_pct,
            }

        # 5y change at region level
        chg5y = {}
        for g in ("Total", "UK", "EU", "NonEU"):
            l = region_totals[g]
            p = prior_totals[g]
            chg5y[g] = (l - p) if (l is not None and p is not None) else None

        out_regions[region_name] = {
            "latestSnapshotDate": latest_date,
            "fiveYearBaselineDate": five_y_back_date,
            "totalEmployment": region_totals["Total"],
            "byNationalityGroup": {
                "UK": region_totals["UK"],
                "EU": region_totals["EU"],
                "NonEU": region_totals["NonEU"],
            },
            "nonUkSharePct": (
                round((region_totals["Total"] - region_totals["UK"]) / region_totals["Total"] * 100, 1)
                if region_totals["Total"] and region_totals["UK"] is not None else None
            ),
            "fiveYearChange": chg5y,
            "byIndustry": industries_out,
        }
        def fmt(v):
            return f"{v:,}" if isinstance(v, int) else str(v)
        print(f"  {region_name}: total {fmt(region_totals['Total'])} "
              f"(UK {fmt(region_totals['UK'])}, EU {fmt(region_totals['EU'])}, "
              f"Non-EU {fmt(region_totals['NonEU'])})")

    out = {
        "source": (
            "HMRC Real Time Information via ONS — Payrolled employments "
            "in the UK by nationality, region and industrial sector, "
            "Tables 5-17 (Jul 2014 – Dec 2024 monthly time series). "
            "This file consolidates the latest-month snapshot and 5y "
            "change per region per industry."
        ),
        "lastUpdated": "2026-04-29",
        "caveat": (
            "Counts are EMPLOYMENTS not employees (a person with two "
            "jobs is counted twice). Industry breakdown is at SIC 2007 "
            "section level (A-U). Some cells are suppressed [c] and "
            "appear as missing here."
        ),
        "regions": out_regions,
    }
    OUT.write_text(json.dumps(out, indent=2))
    print(f"\nWrote {OUT}")
    print(f"Regions: {len(out_regions)}")
    # North West summary for Burnley context
    nw = out_regions.get("North West", {})
    if nw:
        print(f"\n=== North West (Burnley region) Dec 2024 ===")
        print(f"Total: {nw['totalEmployment']:,} (Non-UK share {nw['nonUkSharePct']}%)")
        print(f"  UK:     {nw['byNationalityGroup']['UK']:,}")
        print(f"  EU:     {nw['byNationalityGroup']['EU']:,}")
        print(f"  Non-EU: {nw['byNationalityGroup']['NonEU']:,}")
        print(f"5y change: total {nw['fiveYearChange']['Total']:+,}, "
              f"UK {nw['fiveYearChange']['UK']:+,}, EU {nw['fiveYearChange']['EU']:+,}, "
              f"Non-EU {nw['fiveYearChange']['NonEU']:+,}")
        # Top industries by non-UK share
        ranked = sorted(
            ((n, v) for n, v in nw["byIndustry"].items() if v["nonUkSharePct"] is not None),
            key=lambda kv: -kv[1]["nonUkSharePct"],
        )
        print(f"\nTop North West industries by non-UK share (latest):")
        for ind, v in ranked[:6]:
            print(f"  {ind:50s} {v['nonUkSharePct']:>5.1f}% non-UK  ({v['total']:,} total)")


if __name__ == "__main__":
    main()
