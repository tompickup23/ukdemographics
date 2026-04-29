#!/usr/bin/env python3
"""
Aggregate DfE per-school 2024/25 census to DISTRICT-level EAL and
ethnicity figures, breaking the upper-tier-LA-only DfE published
breakdown into genuine district granularity.

Each school row has district_administrative_code (ONS LAD) and pupil
counts by first language and ethnicity. Summing across schools whose
district matches gives a district-level EAL share that the DfE does
not publish directly.

Inputs:
  data/raw/dfe_schools_per_school/spc_school_level_2024-25.csv

Output:
  src/data/live/school-eal-district.json

Caveats:
  - Only state-funded schools are in scope; private schools excluded.
  - District = catchment-of-school; some schools serve neighbouring
    districts. Pupil residence is NOT in this file.
  - Suppressed values (X / *) are treated as zero where they appear.
"""
import csv
import json
from collections import defaultdict
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
SRC = ROOT / "data/raw/dfe_schools_per_school/spc_school_level_2024-25.csv"
OUT = ROOT / "src/data/live/school-eal-district.json"

# Columns of interest in the wide CSV
COL_DISTRICT_CODE = "district_administrative_code"
COL_DISTRICT_NAME = "district_administrative_name"
COL_LA_CODE = "new_la_code"
COL_LA_NAME = "la_name"
COL_HEADCOUNT = "headcount of pupils"
COL_ENGLISH_N = "number of pupils whose first language is known or believed to be English"
COL_EAL_N = "number of pupils whose first language is known or believed to be other than English"
COL_UNCLASS_N = "number of pupils whose first language is unclassified"
COL_PUPILS_COMPSCH = "number of pupils of compulsory school age and above (rounded)"
COL_FSM_N = "number of pupils known to be eligible for free school meals"
ETH_COLS = {
    "white_british": "number of pupils classified as white British ethnic origin",
    "any_other_white": "number of pupils classified as any other white background ethnic origin",
    "indian": "number of pupils classified as Indian ethnic origin",
    "pakistani": "number of pupils classified as Pakistani ethnic origin",
    "bangladeshi": "number of pupils classified as Bangladeshi ethnic origin",
    "any_other_asian": "number of pupils classified as any other Asian background ethnic origin",
    "caribbean": "number of pupils classified as Caribbean ethnic origin",
    "african": "number of pupils classified as African ethnic origin",
    "any_other_black": "number of pupils classified as any other black background ethnic origin",
    "chinese": "number of pupils classified as Chinese ethnic origin",
    "any_other_ethnic_group": "number of pupils classified as any other ethnic group ethnic origin",
}


def to_int(s):
    if s is None or s == "" or s in {":", "*", "x", "X", "z", "c"}:
        return 0
    try:
        return int(float(s))
    except (TypeError, ValueError):
        return 0


def main():
    if not SRC.exists():
        print(f"ERROR: {SRC} not found.")
        return 2

    # Per district aggregator
    by_district = defaultdict(lambda: {
        "name": None,
        "utla_code": None,
        "utla_name": None,
        "schoolCount": 0,
        "headcount": 0,
        "english": 0,
        "eal": 0,
        "unclass": 0,
        "compulsorySchoolAgeOrAbove": 0,
        "fsm": 0,
        "ethnicity": defaultdict(int),
    })

    schools_processed = 0
    # Encoding: DfE CSVs are typically Windows-1252 with stray accented characters
    with SRC.open(encoding="cp1252") as fh:
        reader = csv.DictReader(fh)
        for row in reader:
            district_code = row.get(COL_DISTRICT_CODE)
            if not district_code or district_code in {"", "z", "c"}:
                continue
            agg = by_district[district_code]
            agg["name"] = row.get(COL_DISTRICT_NAME) or agg["name"]
            agg["utla_code"] = row.get(COL_LA_CODE) or agg["utla_code"]
            agg["utla_name"] = row.get(COL_LA_NAME) or agg["utla_name"]
            agg["schoolCount"] += 1
            agg["headcount"] += to_int(row.get(COL_HEADCOUNT))
            agg["english"] += to_int(row.get(COL_ENGLISH_N))
            agg["eal"] += to_int(row.get(COL_EAL_N))
            agg["unclass"] += to_int(row.get(COL_UNCLASS_N))
            agg["compulsorySchoolAgeOrAbove"] += to_int(row.get(COL_PUPILS_COMPSCH))
            agg["fsm"] += to_int(row.get(COL_FSM_N))
            for eth_key, col_name in ETH_COLS.items():
                agg["ethnicity"][eth_key] += to_int(row.get(col_name))
            schools_processed += 1

    # Build output keyed by district code (E07000xxx, E06xxxxxxx, E08xxxxxxx, E09xxxxxxx)
    areas = {}
    for code, d in by_district.items():
        head = d["headcount"]
        denom = d["english"] + d["eal"] + d["unclass"]
        if denom == 0:
            continue
        eal_pct = round(d["eal"] / denom * 100, 1) if denom else None
        eng_pct = round(d["english"] / denom * 100, 1) if denom else None
        eth_total = sum(d["ethnicity"].values())
        ethnicity_pct = {
            k: round(v / eth_total * 100, 1)
            for k, v in d["ethnicity"].items()
        } if eth_total else {}
        areas[code] = {
            "areaName": d["name"],
            "parentUtlaCode": d["utla_code"],
            "parentUtlaName": d["utla_name"],
            "schoolCount": d["schoolCount"],
            "totalPupils": head,
            "englishCount": d["english"],
            "ealCount": d["eal"],
            "ealPct": eal_pct,
            "englishPct": eng_pct,
            "fsmCount": d["fsm"],
            "fsmPct": round(d["fsm"] / d["compulsorySchoolAgeOrAbove"] * 100, 1)
                       if d["compulsorySchoolAgeOrAbove"] else None,
            "ethnicityCounts": dict(d["ethnicity"]),
            "ethnicityPct": ethnicity_pct,
        }

    # Top EAL districts
    top_eal = sorted(
        [(c, a) for c, a in areas.items() if a["totalPupils"] >= 1000],
        key=lambda kv: -kv[1]["ealPct"],
    )[:15]

    out = {
        "source": (
            "DfE Schools, Pupils and their Characteristics, academic year "
            "2024/25 — school-level underlying data, aggregated to "
            "district administrative code (E07/E06/E08/E09)."
        ),
        "lastUpdated": "2026-04-29",
        "caveat": (
            "Aggregated per district where the school sits, not where "
            "the pupil lives. Only state-funded schools are in scope; "
            "private schools excluded. Suppressed cells in the source "
            "are treated as zero (this affects very small schools)."
        ),
        "schoolsProcessed": schools_processed,
        "totalDistricts": len(areas),
        "topDistrictsByEAL": [
            {"code": c, "name": a["areaName"], "ealPct": a["ealPct"], "totalPupils": a["totalPupils"]}
            for c, a in top_eal
        ],
        "areas": areas,
    }
    OUT.write_text(json.dumps(out, indent=2))
    print(f"Wrote {OUT}")
    print(f"Schools processed: {schools_processed:,}")
    print(f"Districts: {len(areas)}")
    print(f"\nTop 10 districts by EAL share:")
    for c, a in top_eal[:10]:
        print(f"  {a['areaName']:30s} {a['ealPct']:5.1f}% EAL  ({a['totalPupils']:,} pupils, {a['schoolCount']} schools)")
    print(f"\nLancashire district comparison (Burnley + neighbours):")
    for code in ["E07000117", "E07000122", "E07000120", "E07000121", "E07000123", "E07000125"]:
        a = areas.get(code)
        if a:
            print(f"  {a['areaName']:18s} EAL {a['ealPct']:5.1f}%  ({a['totalPupils']:,} pupils, {a['schoolCount']} schools)")
    print(f"\nLancashire UTLA comparison: 14.47% (parent-county figure from DfE)")


if __name__ == "__main__":
    main()
