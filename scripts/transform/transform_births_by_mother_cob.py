#!/usr/bin/env python3
"""
ONS — Live births by country of birth of mother and area of usual
residence, 2024 (Table 6a of `parentscountryofbirth`). Per-LA breakdown
of all 2024 live births split into UK-born vs non-UK-born mother, with
non-UK-born further broken into six regions.

Pairs with NINo flow and Census 2021 country-of-birth stock as the
"second-generation pipeline" — the births dimension that doesn't appear
in either of the other two datasets.

Inputs:
  data/raw/ons_births/2024birthsbyparentscountry.xlsx (Table_6a)

Output:
  src/data/live/births-by-mother-cob.json

Caveats:
  - Geographic granularity in this ONS file is mixed: Country / Region /
    Unitary Authority / Non-metropolitan District / London Borough /
    Metropolitan District. We retain all rows but tag each with a
    geographyType field so consumers can filter.
  - Mother's country of birth is the SIX REGIONAL groups, not full
    country detail. The full-country detail lives in Tables 1 / 2a / 5
    of the same publication and is national/regional only — not LA.
  - 2024 is the latest year published. Earlier years are in Table 1.
  - A live birth here is a birth registered in 2024 with usual-resident
    address in that LA. It is not the same as the place where the
    mother lived at the moment of conception, nor where she is now.
"""
import json
from pathlib import Path

import pandas as pd

ROOT = Path(__file__).resolve().parents[2]
SRC = ROOT / "data/raw/ons_births/2024birthsbyparentscountry.xlsx"
OUT = ROOT / "src/data/live/births-by-mother-cob.json"

REGION_COLS = {
    7: "EU_pre2004",
    8: "EU_post2004",
    9: "RestOfEurope_nonEU",
    10: "Africa",
    11: "MiddleEastAndAsia",
    12: "RestOfWorld",
}


def main():
    df = pd.read_excel(SRC, engine="openpyxl", sheet_name="Table_6a", header=None)
    # Data starts at row 6 (after row 5 header)
    areas = {}
    for _, row in df.iloc[6:].iterrows():
        code = row.iloc[0]
        name = row.iloc[1]
        geog = row.iloc[2]
        if not isinstance(code, str) or not code.strip():
            continue
        try:
            total = int(row.iloc[3])
            uk_born = int(row.iloc[4])
            non_uk = int(row.iloc[5])
        except (TypeError, ValueError):
            continue
        non_uk_pct = float(row.iloc[6]) if not pd.isna(row.iloc[6]) else None

        regions = {}
        for col_idx, label in REGION_COLS.items():
            v = row.iloc[col_idx]
            if pd.isna(v):
                continue
            try:
                regions[label] = int(v)
            except (TypeError, ValueError):
                continue

        areas[code] = {
            "areaName": name,
            "geographyType": geog,
            "totalBirths2024": total,
            "ukBornMother": uk_born,
            "nonUkBornMother": non_uk,
            "nonUkBornMotherPct": non_uk_pct,
            "ukBornMotherPct": (
                round(uk_born / total * 100, 1) if total else None
            ),
            "byMotherRegion": regions,
        }

    # Top-N highest non-UK-born-mother percentage (LAs only)
    la_geographies = {
        "Unitary Authority", "Non-metropolitan District",
        "London Borough", "Metropolitan District",
    }
    la_areas = [
        (c, a) for c, a in areas.items()
        if a["geographyType"] in la_geographies and a["nonUkBornMotherPct"] is not None
    ]
    top_pct = sorted(la_areas, key=lambda kv: -kv[1]["nonUkBornMotherPct"])[:15]
    bottom_pct = sorted(la_areas, key=lambda kv: kv[1]["nonUkBornMotherPct"])[:10]

    out = {
        "source": (
            "Office for National Statistics — Births by parents' country of "
            "birth, England and Wales, 2024 (Table 6a: Live births by "
            "country of birth of mother and area of usual residence)."
        ),
        "lastUpdated": "2026-04-28",
        "year": 2024,
        "caveat": (
            "Mother's country of birth is reported in six regional groups "
            "at LA level (full-country detail is national/regional only). "
            "Geography mixes Country / Region / Unitary Authority / "
            "Non-metropolitan District / London Borough / Metropolitan "
            "District in one file — filter on geographyType when joining."
        ),
        "totalAreas": len(areas),
        "topNonUkBornMotherLAs": [
            {
                "code": c, "name": a["areaName"],
                "totalBirths": a["totalBirths2024"],
                "nonUkBornMotherPct": a["nonUkBornMotherPct"],
            }
            for c, a in top_pct
        ],
        "bottomNonUkBornMotherLAs": [
            {
                "code": c, "name": a["areaName"],
                "totalBirths": a["totalBirths2024"],
                "nonUkBornMotherPct": a["nonUkBornMotherPct"],
            }
            for c, a in bottom_pct
        ],
        "areas": areas,
    }
    OUT.write_text(json.dumps(out, indent=2))
    print(f"Wrote {OUT}")
    print(f"Areas covered: {len(areas)}")
    print(f"\nTop 10 LAs by non-UK-born-mother share:")
    for c, a in top_pct[:10]:
        print(f"  {a['areaName']:30s} {a['nonUkBornMotherPct']:5.1f}%  ({a['totalBirths2024']:,} births)")
    print(f"\nBurnley (E07000117):")
    print(json.dumps(areas.get("E07000117", {}), indent=2))


if __name__ == "__main__":
    main()
