#!/usr/bin/env python3
"""
Transform NINo demographic cube (LA × Age × Sex × Quarter, rolling year
ending Q4 2025) into a per-LA profile of new arrivals by age band and
sex share.

Inputs:
  data/raw/supplementary/nino-demographic-cube.json

Output:
  src/data/live/nino-demographic-profile.json
"""
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
SRC = ROOT / "data/raw/supplementary/nino-demographic-cube.json"
OUT = ROOT / "src/data/live/nino-demographic-profile.json"

# Order from valueset; "Unknown" usually trivial
AGE_BAND_ORDER = [
    "Less than 18", "18-24", "25-29", "30-34", "35-39",
    "40-44", "45-49", "50-54", "55-59", "60 or over", "Unknown",
]


def main():
    cube = json.loads(SRC.read_text())
    fields = cube["fields"]
    # dim order: LA, Age, Sex, Quarter
    la_field, age_field, sex_field, qtr_field = fields
    values = cube["cubes"][list(cube["cubes"].keys())[0]]["values"]

    age_labels = [it["labels"][0] for it in age_field["items"]]
    sex_labels = [it["labels"][0] for it in sex_field["items"]]
    n_qtr = len(qtr_field["items"])

    areas = {}
    national_age = {a: 0 for a in age_labels}
    national_sex = {s: 0 for s in sex_labels}
    national_total = 0

    for li, la_item in enumerate(la_field["items"]):
        la_label = la_item["labels"][0]
        la_uri = la_item["uris"][0]
        la_code = la_uri.split(":")[-1]

        by_age = {a: 0 for a in age_labels}
        by_sex = {s: 0 for s in sex_labels}
        # Sum across quarters
        la_total = 0
        for ai, age in enumerate(age_labels):
            for si, sex in enumerate(sex_labels):
                cell = values[li][ai][si]
                cnt = sum((cell[qi] or 0) for qi in range(n_qtr))
                cnt = int(cnt)
                if cnt:
                    by_age[age] += cnt
                    by_sex[sex] += cnt
                    la_total += cnt

        if la_total == 0:
            continue
        areas[la_code] = {
            "areaName": la_label,
            "rollingYearTotal": la_total,
            "byAgeBand": [
                {"band": a, "count": by_age[a],
                 "sharePct": round(by_age[a] / la_total * 100, 1)}
                for a in AGE_BAND_ORDER if by_age.get(a, 0) > 0
            ],
            "bySex": [
                {"sex": s, "count": by_sex[s],
                 "sharePct": round(by_sex[s] / la_total * 100, 1)}
                for s in sex_labels if by_sex[s] > 0
            ],
        }
        for a in age_labels:
            national_age[a] += by_age[a]
        for s in sex_labels:
            national_sex[s] += by_sex[s]
        national_total += la_total

    out = {
        "source": (
            "DWP Stat-Xplore Ninos cube — LA × Age band × Sex, rolling "
            "year ending Q4 2025 (Jan-Dec 2025 calendar year). Counts "
            "are NEW NINo registrations to adult overseas nationals."
        ),
        "lastUpdated": "2026-04-29",
        "caveat": (
            "Age is age at NINo registration, not age at arrival. The "
            "registration may follow arrival by months. 'Less than 18' "
            "is rare in this dataset because the published Ninos series "
            "is filtered to adult overseas nationals; values reflect "
            "young workers/claimants close to 18. 'Unknown' age is a "
            "small residual."
        ),
        "ageBandsOrder": AGE_BAND_ORDER,
        "national": {
            "rollingYearTotal": national_total,
            "byAgeBand": [
                {"band": a, "count": national_age[a],
                 "sharePct": round(national_age[a] / national_total * 100, 1)}
                for a in AGE_BAND_ORDER if national_age.get(a, 0) > 0
            ],
            "bySex": [
                {"sex": s, "count": national_sex[s],
                 "sharePct": round(national_sex[s] / national_total * 100, 1)}
                for s in sex_labels if national_sex[s] > 0
            ],
        },
        "areas": areas,
    }
    OUT.write_text(json.dumps(out, indent=2))
    print(f"Wrote {OUT}")
    print(f"LAs: {len(areas)}; National total: {national_total:,}")
    print(f"\nNational age breakdown:")
    for entry in out["national"]["byAgeBand"]:
        print(f"  {entry['band']:15s} {entry['count']:>7,}  ({entry['sharePct']}%)")
    print(f"\nNational sex breakdown:")
    for entry in out["national"]["bySex"]:
        print(f"  {entry['sex']:10s} {entry['count']:>7,}  ({entry['sharePct']}%)")
    print(f"\nBurnley:")
    b = areas.get("E07000117")
    if b:
        print(json.dumps(b, indent=2))


if __name__ == "__main__":
    main()
