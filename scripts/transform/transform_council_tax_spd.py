#!/usr/bin/env python3
"""
Council Tax Single-Person Discount per LA from MHCLG Council Taxbase
2024 (CTB1 returns, snapshot 7 October 2024).

Single-occupier discount take-up is a strong proxy for single-person
households — adults living alone get 25% off council tax. Rising
share is associated with population churn, transient occupancy and
the in-migration / break-up of households.

Inputs:
  data/raw/council_taxbase/ctb_la_2024.ods (sheet Council_Taxbase_Data)

Output:
  src/data/live/council-tax-spd.json

Caveats:
  - Snapshot 7 October 2024.
  - Single-person discount excludes households where 'all but one
    resident is disregarded' (a separate 25% category, Table 1.09)
    and 'all residents disregarded' (50% category, Table 1.10).
    Reported here is Table 1.08 only.
  - Denominator is Table 1.07 (chargeable dwellings).
"""
import json
from pathlib import Path

import pandas as pd

ROOT = Path(__file__).resolve().parents[2]
SRC = ROOT / "data/raw/council_taxbase/ctb_la_2024.ods"
OUT = ROOT / "src/data/live/council-tax-spd.json"

# Column positions identified by inspecting row 4 (table titles) +
# row 5 (sub-headers). Per-table layout: 11 cols (Band A disabled,
# Band A, Band B-H, Total, blank).
COL_ONS_CODE = 1
COL_REGION = 2
COL_LA_NAME = 3
COL_TOTAL_DWELLINGS = 13              # Table 1.01 Total
COL_CHARGEABLE_TOTAL = 75              # Table 1.07 Total (chargeable)
COL_SPD_TOTAL = 86                     # Table 1.08 Total (single-occupier 25%)
COL_DISREGARDED_25_TOTAL = 97          # Table 1.09 Total
COL_DISREGARDED_50_TOTAL = 108         # Table 1.10 Total

DATA_START_ROW = 7  # Adur, first per-LA row (England aggregate is row 6)


def to_int(v):
    if pd.isna(v):
        return None
    try:
        return int(v)
    except (TypeError, ValueError):
        return None


def main():
    df = pd.read_excel(SRC, engine="odf", sheet_name="Council_Taxbase_Data", header=None)
    areas = {}
    for i in range(DATA_START_ROW, len(df)):
        row = df.iloc[i]
        code = row.iloc[COL_ONS_CODE]
        if not isinstance(code, str) or not code.startswith("E"):
            continue
        name = row.iloc[COL_LA_NAME]
        total_dwellings = to_int(row.iloc[COL_TOTAL_DWELLINGS])
        chargeable = to_int(row.iloc[COL_CHARGEABLE_TOTAL])
        spd = to_int(row.iloc[COL_SPD_TOTAL])
        disreg_25 = to_int(row.iloc[COL_DISREGARDED_25_TOTAL])
        disreg_50 = to_int(row.iloc[COL_DISREGARDED_50_TOTAL])
        if chargeable is None or chargeable == 0:
            continue
        spd_pct = round(spd / chargeable * 100, 1) if spd is not None else None
        areas[code] = {
            "areaName": name,
            "totalDwellings": total_dwellings,
            "chargeableDwellings": chargeable,
            "singlePersonDiscount25": spd,
            "singlePersonDiscountPctOfChargeable": spd_pct,
            "disregarded25": disreg_25,
            "disregardedAll50": disreg_50,
        }

    top = sorted(
        [(c, a) for c, a in areas.items() if a["singlePersonDiscountPctOfChargeable"] is not None],
        key=lambda kv: -kv[1]["singlePersonDiscountPctOfChargeable"],
    )[:15]
    bot = sorted(
        [(c, a) for c, a in areas.items() if a["singlePersonDiscountPctOfChargeable"] is not None],
        key=lambda kv: kv[1]["singlePersonDiscountPctOfChargeable"],
    )[:10]

    out = {
        "source": (
            "MHCLG Council Taxbase 2024 (CTB1 LA-level data, snapshot "
            "7 October 2024). Single-person 25% discount is Table 1.08; "
            "denominator is Table 1.07 (chargeable dwellings)."
        ),
        "lastUpdated": "2026-04-29",
        "caveat": (
            "Single-person discount captures households with one adult "
            "and is the cleanest proxy for single-person occupancy. The "
            "separate 'all-but-one disregarded' (Table 1.09) and 'all "
            "residents disregarded' (Table 1.10) categories cover "
            "students, severely mentally impaired, and similar cases — "
            "surfaced separately. Snapshot is 7 October 2024."
        ),
        "totalLAs": len(areas),
        "topLAsBySpdShare": [
            {"code": c, "name": a["areaName"],
             "spdShare": a["singlePersonDiscountPctOfChargeable"],
             "spdCount": a["singlePersonDiscount25"]}
            for c, a in top
        ],
        "bottomLAsBySpdShare": [
            {"code": c, "name": a["areaName"],
             "spdShare": a["singlePersonDiscountPctOfChargeable"]}
            for c, a in bot
        ],
        "areas": areas,
    }
    OUT.write_text(json.dumps(out, indent=2))
    print(f"Wrote {OUT}")
    print(f"LAs: {len(areas)}")
    print(f"\nTop 10 LAs by single-person discount share:")
    for c, a in top[:10]:
        print(f"  {a['areaName']:30s} {a['singlePersonDiscountPctOfChargeable']:5.1f}%  ({a['singlePersonDiscount25']:,} of {a['chargeableDwellings']:,})")
    print(f"\nLancashire districts:")
    for code in ["E07000117","E07000118","E07000119","E07000120","E07000121","E07000122","E07000123","E07000124","E07000125","E07000126","E07000127","E07000128"]:
        a = areas.get(code)
        if a:
            print(f"  {a['areaName']:18s} SPD {a['singlePersonDiscountPctOfChargeable']:5.1f}%  ({a['singlePersonDiscount25']:,} of {a['chargeableDwellings']:,})")


if __name__ == "__main__":
    main()
