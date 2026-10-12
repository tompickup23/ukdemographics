#!/usr/bin/env python3
"""
Aggregate the DfE school level underlying data (newest release on disk) to
DISTRICT-level EAL and ethnicity figures, breaking the upper-tier-LA-only DfE
published breakdown into genuine district granularity.

Each school row has district_administrative_code (ONS LAD) and pupil
counts by first language and ethnicity. Summing across schools whose
district matches gives a district-level EAL share that the DfE does
not publish directly.

Inputs:
  data/raw/dfe_schools_per_school/spc_school_level_underlying_data_<yyyy>.csv, newest
  release, resolved by stem (scripts/fetch/fetch-dfe-pupil-characteristics.mjs)
  data/raw/manifests/dfe_pupil_characteristics.json (release title and dates, matched
  to the file by sha256)

Output:
  src/data/live/school-eal-district.json

Caveats:
  - Only state-funded schools are in scope; private schools excluded.
  - District = catchment-of-school; some schools serve neighbouring
    districts. Pupil residence is NOT in this file.
  - Suppressed values (X / *) are treated as zero where they appear.

The academic year comes from the file's time_period column (one value, or the run
stops); the release title and dates from the fetch manifest. Every column below is read
by header name and a missing one stops the run. The 2024/25 file was Windows-1252 and
the 2025/26 file is UTF-8 with a byte order mark; the encoding is read from the bytes.
"""
import json
import sys
from collections import defaultdict
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "lib"))
import dfe_csv  # noqa: E402

ROOT = Path(__file__).resolve().parents[2]
RAW_DIR = ROOT / "data/raw/dfe_schools_per_school"
MANIFEST = ROOT / "data/raw/manifests/dfe_pupil_characteristics.json"
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
    src = dfe_csv.resolve(RAW_DIR, dfe_csv.SCHOOL_LEVEL)
    release = dfe_csv.release_for(src, MANIFEST)
    required = [COL_DISTRICT_CODE, COL_DISTRICT_NAME, COL_LA_CODE, COL_LA_NAME, COL_HEADCOUNT,
                COL_ENGLISH_N, COL_EAL_N, COL_UNCLASS_N, COL_PUPILS_COMPSCH, COL_FSM_N,
                "time_period", *ETH_COLS.values()]
    periods = set()
    aliases = dfe_csv.area_code_aliases(ROOT)

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
    fh, reader = dfe_csv.open_reader(src, required)
    with fh:
        for row in reader:
            periods.add(row["time_period"])
            district_code = row.get(COL_DISTRICT_CODE)
            if not district_code or district_code in {"", "z", "c"}:
                continue
            district_code = aliases.get(district_code, district_code)
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

    if len(periods) != 1:
        raise RuntimeError(f"{src.name}: expected one time_period, found {sorted(periods)}")
    year = dfe_csv.academic_year(periods.pop())
    if year != release.get("yearTitle"):
        raise RuntimeError(f"{src.name} is {year}, the manifest's release is {release.get('yearTitle')}")

    out = {
        "source": (
            f"{release['publisher']}, {release['publication']}, academic year {year} "
            f"(published {dfe_csv.long_date(release['published'])}, last updated "
            f"{dfe_csv.long_date(release['lastUpdated'])}). School level underlying data, "
            "aggregated to district administrative code (E07/E06/E08/E09)."
        ),
        "sourceUrl": release["page"],
        "sourceFile": src.name,
        "academicYear": year,
        "lastUpdated": release["lastUpdated"],
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
    OUT.write_text(json.dumps(out, indent=2, ensure_ascii=False) + "\n")
    print(f"Read {src.name} ({year}); release {release['title']}, updated {release['lastUpdated']}")
    print(f"Schools processed: {schools_processed:,}; districts: {len(areas)}")
    print(f"Wrote {OUT}")

if __name__ == "__main__":
    main()
