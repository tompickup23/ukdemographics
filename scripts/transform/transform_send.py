#!/usr/bin/env python3
"""
Transform DfE SEN in England 2024/25 ZIP → send-dashboard.json.

EHCP responsibility sits with upper-tier authorities (counties, unitaries,
London boroughs, mets) — ~153 LAs in coverage. Districts are correctly absent.

Sources inside the ZIP:
  data/sen_phase_type_.csv        — total EHCPs by LA × time_period (for
                                    headcount and 5yr growth)
  data/sen_secondary_need_.csv    — primary_need × LA × time_period (for ASD
                                    prevalence and primary-need breakdown)

Outputs: src/data/live/send-dashboard.json
"""
from pathlib import Path
import csv
import io
import json
import zipfile

ROOT = Path(__file__).resolve().parents[2]
SRC = ROOT / "data/raw/supplementary/dfe-sen-2024-25.zip"
OUT = ROOT / "src/data/live/send-dashboard.json"
EP = ROOT / "src/data/live/ethnic-projections.json"

CURRENT_PERIOD = "202425"
GROWTH_BASE_PERIOD = "201920"  # 5 years prior


def open_csv_in_zip(zf: zipfile.ZipFile, name: str):
    raw = zf.read(name).decode("utf-8-sig")
    return csv.DictReader(io.StringIO(raw))


def main() -> None:
    ep = json.loads(EP.read_text())
    name_by_la = {code: a.get("areaName", code) for code, a in ep["areas"].items()}
    pop_by_la = {code: (a.get("current", {}).get("total_population") or 0) for code, a in ep["areas"].items()}

    # Pass 1: total EHCPs by LA for current and 5yr-prior periods.
    # phase_type file has many rows per LA (per phase × establishment cross).
    # We want phase_type_grouping == "Total" AND type_of_establishment == "Total"
    # for the totals.
    ehcp_now = {}
    ehcp_then = {}

    with zipfile.ZipFile(SRC) as zf:
        for row in open_csv_in_zip(zf, "data/sen_phase_type_.csv"):
            if row["geographic_level"] != "Local authority":
                continue
            la = row["new_la_code"]
            if not la or not la.startswith("E"):
                continue
            if row.get("phase_type_grouping") != "Total":
                continue
            if row.get("type_of_establishment") != "Total":
                continue
            try:
                ehcp = int(row["ehc_plan"]) if row["ehc_plan"] not in ("", "z", "x", "c") else 0
            except (ValueError, KeyError):
                continue
            tp = row["time_period"]
            if tp == CURRENT_PERIOD:
                ehcp_now[la] = ehcp_now.get(la, 0) + ehcp
            elif tp == GROWTH_BASE_PERIOD:
                ehcp_then[la] = ehcp_then.get(la, 0) + ehcp

        # Pass 2: primary need breakdown + ASD prevalence at current period.
        # secondary_need file has one row per (LA × phase × pupil_sen_status × primary_need).
        # We want pupil_sen_status == "EHC plan" AND phase_type_grouping == "Total".
        primary_counts = {}
        for row in open_csv_in_zip(zf, "data/sen_secondary_need_.csv"):
            if row["geographic_level"] != "Local authority":
                continue
            if row["time_period"] != CURRENT_PERIOD:
                continue
            if row.get("phase_type_grouping") != "Total":
                continue
            if row.get("pupil_sen_status") != "EHC plan":
                continue
            la = row["new_la_code"]
            if not la or not la.startswith("E"):
                continue
            need = row["primary_need"]
            try:
                n = int(row["number_of_pupils"]) if row["number_of_pupils"] not in ("", "z", "x", "c") else 0
            except (ValueError, KeyError):
                continue
            primary_counts.setdefault(la, {})[need] = primary_counts.get(la, {}).get(need, 0) + n

    # Build output. Rate-per-10k uses total population (not school-age) since
    # school-age population is not in ethnic-projections.json. Field name
    # remains ehcpRatePer10k for schema compat — caveat documents this.
    areas = {}
    for la, total in ehcp_now.items():
        pop = pop_by_la.get(la) or 0
        if not pop:
            continue
        rate_per_10k = (total / pop) * 10000

        prev = ehcp_then.get(la)
        growth = ((total - prev) / prev * 100) if prev and prev > 0 else None

        # Primary need breakdown — top 6 by share, ASD prevalence as own field
        nm = primary_counts.get(la, {})
        denom = sum(nm.values()) or 1
        sorted_needs = sorted(nm.items(), key=lambda kv: kv[1], reverse=True)
        top6 = [
            {"need": k.replace(" Difficulties", "").replace(" and ", " & "), "pct": round(v / denom * 100, 1)}
            for k, v in sorted_needs[:6]
            if k not in ("Total", "")
        ]
        asd = next((round(v / denom * 100, 1) for k, v in nm.items() if "Autistic" in k or k == "ASD"), None)

        areas[la] = {
            "areaName": name_by_la.get(la, la),
            "ehcpRatePer10k": round(rate_per_10k, 1),
            "asdPrevalencePct": asd,
            "fiveYearGrowthPct": round(growth, 1) if growth is not None else None,
            "totalEhcps": total,
            "primaryNeeds": top6,
            "period": "2024-25 academic year",
        }

    out = {
        "source": "DfE Special educational needs in England, academic year 2024/25 (sen_phase_type_.csv + sen_secondary_need_.csv).",
        "methodology": "Total EHC plans summed across all phases and establishment types per LA (phase_type_grouping=Total, type_of_establishment=Total). 5-year growth compares 2024/25 to 2019/20. ASD prevalence and primary-need breakdown filtered to pupil_sen_status=EHC plan + phase_type_grouping=Total.",
        "lastUpdated": "2026-04-28",
        "caveat": "EHCP responsibility sits with upper-tier authorities only — ~153 LAs in coverage. Rate-per-10k uses total LA population (Census 2021) as denominator since school-age population is not in the ethnic-projections feed; cross-LA comparison is therefore directional rather than absolute. Rising EHCP counts may reflect improved identification, changes in diagnostic criteria, increased parental awareness, or genuine prevalence change.",
        "areas": dict(sorted(areas.items())),
    }
    OUT.write_text(json.dumps(out, indent=2))
    print(f"send-dashboard.json: {len(areas)} LAs with EHCP totals")


if __name__ == "__main__":
    main()
