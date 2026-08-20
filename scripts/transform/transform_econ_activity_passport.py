#!/usr/bin/env python3
"""
Transform Census 2021 RM021 (Economic activity status by passports held)
into a per-LA "employment rate by passport group" dataset — the
direct LA-level Census answer to "of {nationality group} residents in
this LA, what share are in employment".

Inputs:
  data/raw/census_econ_passport/rm021_econ_passport_la.csv

Output:
  src/data/live/econ-activity-by-passport.json

Caveats:
  - Census 2021 is a stock measure on Census Day (21 March 2021). It
    does NOT reflect post-2021 arrivals (Iran / Eritrea / Sudan in
    Burnley arrived almost entirely post-2022 and are mostly absent
    from this stock).
  - Passports held is a self-declared question and is the proxy for
    nationality. People with multiple passports may declare only one;
    UK + non-UK dual nationals typically counted as UK.
  - The denominator for "employment rate" is "economically active
    excluding full-time students", not the total population, so the
    rate is comparable across passport groups.
"""
import csv
import json
from collections import defaultdict
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
SRC = ROOT / "data/raw/census_econ_passport/rm021_econ_passport_la.csv"
OUT = ROOT / "src/data/live/econ-activity-by-passport.json"

# Codelist mapping
ECON = {
    "0": "Total",
    "1001": "EconomicallyActive_excludingFTstudents",
    "1": "InEmployment_excludingFTstudents",
    "2": "Unemployed_excludingFTstudents",
    "1002": "EconomicallyActive_FTstudents",
    "3": "InEmployment_FTstudent",
    "4": "Unemployed_FTstudent",
    "1003": "EconomicallyInactive",
    "5": "Inactive_Retired",
    "6": "Inactive_Student",
    "7": "Inactive_LookingAfterFamily",
    "8": "Inactive_LongTermSick",
    "9": "Inactive_Other",
}

PASS = {
    "0": "Total",
    "1001": "Europe_total",
    "1": "UK",
    "2": "Ireland",
    "1002": "Europe_other",
    "3": "EU_member",
    "4": "Rest_of_Europe",
    "5": "Africa",
    "6": "Middle_East_and_Asia",
    "7": "Americas_and_Caribbean",
    "8": "Antarctica_Oceania",
    "9": "British_Overseas_Territories",
    "10": "No_passport_held",
}


def main():
    # by_la[la_code][passport_label][econ_label] = count
    by_la = defaultdict(lambda: defaultdict(dict))
    name = {}
    with SRC.open() as fh:
        reader = csv.DictReader(fh)
        for row in reader:
            la_code = row["GEOGRAPHY_CODE"]
            name[la_code] = row["GEOGRAPHY_NAME"]
            econ_code = row["C2021_EASTAT_10"]
            pass_code = row["C2021_PASS_11"]
            try:
                v = int(row["OBS_VALUE"])
            except (TypeError, ValueError):
                continue
            econ_label = ECON.get(econ_code)
            pass_label = PASS.get(pass_code)
            if not econ_label or not pass_label:
                continue
            by_la[la_code][pass_label][econ_label] = v

    # Per-LA per-passport-group: compute headline rates
    # Standardised passport groups for output:
    output_groups = [
        "Total", "UK", "Ireland", "EU_member", "Rest_of_Europe",
        "Africa", "Middle_East_and_Asia", "Americas_and_Caribbean",
        "Antarctica_Oceania", "British_Overseas_Territories", "No_passport_held",
    ]

    areas = {}
    for la_code, by_pass in by_la.items():
        groups = {}
        for pass_label in output_groups:
            ea = by_pass.get(pass_label, {})
            total = ea.get("Total", 0)
            in_emp_excl = ea.get("InEmployment_excludingFTstudents", 0)
            unemp_excl = ea.get("Unemployed_excludingFTstudents", 0)
            in_emp_fts = ea.get("InEmployment_FTstudent", 0)
            unemp_fts = ea.get("Unemployed_FTstudent", 0)
            inactive = ea.get("EconomicallyInactive", 0)
            in_emp_all = in_emp_excl + in_emp_fts
            unemp_all = unemp_excl + unemp_fts
            active_excl = ea.get("EconomicallyActive_excludingFTstudents", 0)
            active_fts = ea.get("EconomicallyActive_FTstudents", 0)
            active_all = active_excl + active_fts
            employment_rate_excl = (
                round(in_emp_excl / active_excl * 100, 1)
                if active_excl else None
            )
            employment_rate_all = (
                round(in_emp_all / active_all * 100, 1)
                if active_all else None
            )
            inactive_rate = (
                round(inactive / total * 100, 1)
                if total else None
            )
            groups[pass_label] = {
                "totalPopulation16plus": total,
                "inEmployment_total": in_emp_all,
                "unemployed_total": unemp_all,
                "economicallyActive_total": active_all,
                "economicallyInactive": inactive,
                "employmentRate_excludingFTstudents_pct": employment_rate_excl,
                "employmentRate_inclFTstudents_pct": employment_rate_all,
                "inactivityRate_pct": inactive_rate,
                "inactiveBreakdown": {
                    "Retired": ea.get("Inactive_Retired", 0),
                    "Student": ea.get("Inactive_Student", 0),
                    "LookingAfterFamily": ea.get("Inactive_LookingAfterFamily", 0),
                    "LongTermSick": ea.get("Inactive_LongTermSick", 0),
                    "Other": ea.get("Inactive_Other", 0),
                },
            }
        areas[la_code] = {
            "areaName": name[la_code],
            "byPassportGroup": groups,
        }

    out = {
        "source": (
            "ONS Census 2021 RM021 — Economic activity status by "
            "passports held, by local authority district. NOMIS "
            "NM_2121_1."
        ),
        "lastUpdated": "2026-04-29",
        "caveat": (
            "Stock measure on Census Day (21 March 2021). Passports-held "
            "is a proxy for nationality (UK = UK passport holder). "
            "Employment rate excludes full-time students from the "
            "denominator (the standard ONS definition). The 'inactive' "
            "category includes retirees, full-time students who do not "
            "work, those looking after family, long-term sick, and "
            "other reasons."
        ),
        "totalLAs": len(areas),
        "passportGroupsOrder": output_groups,
        "areas": areas,
    }
    OUT.write_text(json.dumps(out, indent=2))
    print(f"Wrote {OUT}")
    print(f"LAs: {len(areas)}")
    # Burnley readout
    b = areas.get("E07000117")
    if b:
        print(f"\n=== Burnley E07000117 employment rate by passport group ===")
        for pg in output_groups:
            g = b["byPassportGroup"].get(pg, {})
            tot = g.get("totalPopulation16plus", 0)
            er = g.get("employmentRate_excludingFTstudents_pct")
            ir = g.get("inactivityRate_pct")
            if tot >= 50:
                er_s = f"{er}%" if er is not None else "n/a"
                ir_s = f"{ir}%" if ir is not None else "n/a"
                print(f"  {pg:32s} pop16+ {tot:>6,}   employed {er_s:>6s}   inactive {ir_s:>6s}")


if __name__ == "__main__":
    main()
