#!/usr/bin/env python3
"""
Extract the 2008-2024 national time series of live births by mother's
country of birth from the latest ONS publication (Table 1 of the 2024
file). Provides a 17-year trend that the existing per-LA single-year
file (births-by-mother-cob.json) lacks.

Inputs:
  data/raw/ons_births/2024birthsbyparentscountry.xlsx (Table_1)

Output:
  src/data/live/births-history-national.json

Caveats:
  - National (England + Wales) only. ONS publishes per-LA data only in
    Table 6a of each annual file; per-LA multi-year reconstruction
    would require year-by-year file harmonisation (sheet names and
    structures vary across 2018-2024 publications) and is not done
    here.
  - "Mother's country of birth" is what is recorded at registration.
"""
import json
from pathlib import Path

import pandas as pd

ROOT = Path(__file__).resolve().parents[2]
SRC = ROOT / "data/raw/ons_births/2024birthsbyparentscountry.xlsx"
OUT = ROOT / "src/data/live/births-history-national.json"


def main():
    df = pd.read_excel(SRC, engine="openpyxl", sheet_name="Table_1", header=None)
    # Find the header row (contains "Country of birth of mother" + year columns)
    header_row = None
    for i, row in df.iterrows():
        if "Country of birth of mother" in str(row.iloc[0]):
            header_row = i
            break
    if header_row is None:
        raise RuntimeError("Could not find header row in Table_1")

    header_cells = df.iloc[header_row].tolist()
    years = []
    year_cols = []
    for j, c in enumerate(header_cells[1:], start=1):
        try:
            yr = int(float(c))
            years.append(yr)
            year_cols.append(j)
        except (TypeError, ValueError):
            continue

    # Build per-category time series from rows after header
    series = {}
    for i in range(header_row + 1, len(df)):
        row = df.iloc[i]
        cat = str(row.iloc[0]).strip()
        if not cat or cat in {"nan", ""}:
            continue
        values = []
        for col in year_cols:
            v = row.iloc[col]
            try:
                values.append(int(v))
            except (TypeError, ValueError):
                values.append(None)
        if all(v is None for v in values):
            continue
        series[cat] = values

    # Sort years ascending and reorder values to match
    sorted_years_with_idx = sorted(enumerate(years), key=lambda kv: kv[1])
    sorted_years = [yr for _, yr in sorted_years_with_idx]
    sorted_indices = [idx for idx, _ in sorted_years_with_idx]
    for cat, vals in series.items():
        series[cat] = [vals[i] for i in sorted_indices]

    # Headline computations
    total_series = series.get("Total", [])
    uk_series = series.get("UK", [])
    non_uk_series = series.get("Total outside United Kingdom", [])
    non_uk_pct = []
    for t, n in zip(total_series, non_uk_series):
        if t and n is not None:
            non_uk_pct.append(round(n / t * 100, 1))
        else:
            non_uk_pct.append(None)

    out = {
        "source": (
            "ONS Births by parents' country of birth, England and Wales, "
            "2024 release. Table 1: Live births by country of birth of "
            "mother, 2008 to 2024. National only (England + Wales)."
        ),
        "lastUpdated": "2026-04-29",
        "years": sorted_years,
        "totalBirths": total_series,
        "ukBornMother": uk_series,
        "nonUkBornMother": non_uk_series,
        "nonUkBornMotherPct": non_uk_pct,
        "byCategoryTimeSeries": series,
        "caveat": (
            "England + Wales national totals only. Per-LA multi-year "
            "reconstruction is not done here because ONS sheet names "
            "and structures vary across the 2018-2024 publications. "
            "The single-year per-LA breakdown is in births-by-mother-"
            "cob.json (2024 only)."
        ),
    }
    OUT.write_text(json.dumps(out, indent=2))
    print(f"Wrote {OUT}")
    print(f"Years: {sorted_years[0]}-{sorted_years[-1]} ({len(sorted_years)} years)")
    print(f"Categories: {len(series)}")
    print(f"\nTotal births and non-UK-born mother share by year:")
    print(f"  {'Year':<6}{'Total':>10}{'UK':>10}{'NonUK':>10}{'NonUK%':>8}")
    for i, yr in enumerate(sorted_years):
        t = total_series[i] if i < len(total_series) else None
        u = uk_series[i] if i < len(uk_series) else None
        n = non_uk_series[i] if i < len(non_uk_series) else None
        p = non_uk_pct[i] if i < len(non_uk_pct) else None
        print(f"  {yr:<6}{t or '-':>10}{u or '-':>10}{n or '-':>10}{p or '-':>8}")


if __name__ == "__main__":
    main()
