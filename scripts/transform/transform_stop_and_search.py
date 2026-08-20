#!/usr/bin/env python3
"""
Aggregate data.police.uk stop-and-search records (latest 3 months) by
force, by self-defined ethnicity broad group, by outcome, by object of
search.

Inputs:
  data/raw/police_stops/{force}-{YYYY-MM}.json (one file per force-month)

Output:
  src/data/live/stop-and-search.json

Caveats:
  - Self-defined ethnicity is the suspect's own declaration. Where they
    decline ('Not stated' / 'Other ethnic group - Not stated'), the
    record is bucketed into 'Not stated' here.
  - The data.police.uk API caps each force-month response at 2,000
    records. Met and West Midlands occasionally truncate; absolute
    counts for those forces are minimums, not totals.
  - Force coverage differs from LA: there is no clean force→LA join.
    The output is at force level; LA-level breakdown would require
    geocoding each stop's location, which is not always populated.
  - Not all forces publish every month. The 3-month window catches the
    latest data each force has uploaded.
"""
import json
from collections import defaultdict
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
SRC_DIR = ROOT / "data/raw/police_stops"
OUT = ROOT / "src/data/live/stop-and-search.json"

# Self-defined ethnicity strings → broad group
def broad_group(self_defined):
    if not self_defined:
        return "Not stated"
    s = self_defined.lower()
    if "white" in s:
        return "White"
    if "black" in s or "african" in s or "caribbean" in s:
        return "Black"
    if "asian" in s or "indian" in s or "pakistani" in s or "bangladeshi" in s or "chinese" in s:
        return "Asian"
    if "mixed" in s:
        return "Mixed"
    if "arab" in s:
        return "Arab"
    if "not stated" in s or "decline" in s or "other ethnic group" in s:
        return "Not stated"
    return "Other"


def main():
    files = sorted(SRC_DIR.glob("*.json"))
    if not files:
        print(f"ERROR: no files in {SRC_DIR}")
        return 2

    # by_force[force][group] = count, plus metadata
    by_force = defaultdict(lambda: {
        "total": 0,
        "ethnicityBroad": defaultdict(int),
        "outcome": defaultdict(int),
        "objectOfSearch": defaultdict(int),
        "monthsCovered": set(),
        "ageRange": defaultdict(int),
        "gender": defaultdict(int),
    })

    national = {
        "ethnicityBroad": defaultdict(int),
        "outcome": defaultdict(int),
        "objectOfSearch": defaultdict(int),
    }
    grand_total = 0

    for f in files:
        # filename pattern: {force}-{YYYY-MM}.json
        stem = f.stem
        # split at last hyphen-prefix for date
        # date is YYYY-MM (7 chars); force is the rest minus separator
        if len(stem) < 8 or stem[-3] != "-":
            continue
        month = stem[-7:]
        force = stem[:-8]
        try:
            records = json.loads(f.read_text())
        except json.JSONDecodeError:
            continue
        for r in records:
            grand_total += 1
            grp = broad_group(r.get("self_defined_ethnicity"))
            by_force[force]["total"] += 1
            by_force[force]["ethnicityBroad"][grp] += 1
            by_force[force]["outcome"][r.get("outcome") or "Unknown"] += 1
            by_force[force]["objectOfSearch"][r.get("object_of_search") or "Unknown"] += 1
            by_force[force]["ageRange"][r.get("age_range") or "Unknown"] += 1
            by_force[force]["gender"][r.get("gender") or "Unknown"] += 1
            by_force[force]["monthsCovered"].add(month)
            national["ethnicityBroad"][grp] += 1
            national["outcome"][r.get("outcome") or "Unknown"] += 1
            national["objectOfSearch"][r.get("object_of_search") or "Unknown"] += 1

    # Convert to plain dicts and add percentages
    forces = {}
    for force, agg in by_force.items():
        total = agg["total"]
        forces[force] = {
            "totalSearches": total,
            "monthsCovered": sorted(agg["monthsCovered"]),
            "ethnicityBroad": {
                g: {"count": n, "pct": round(n / total * 100, 1) if total else 0}
                for g, n in sorted(agg["ethnicityBroad"].items(), key=lambda kv: -kv[1])
            },
            "topObjectsOfSearch": [
                {"object": k, "count": v, "pct": round(v / total * 100, 1) if total else 0}
                for k, v in sorted(agg["objectOfSearch"].items(), key=lambda kv: -kv[1])[:6]
            ],
            "topOutcomes": [
                {"outcome": k, "count": v, "pct": round(v / total * 100, 1) if total else 0}
                for k, v in sorted(agg["outcome"].items(), key=lambda kv: -kv[1])[:6]
            ],
            "genderBreakdown": dict(agg["gender"]),
            "ageRangeBreakdown": dict(agg["ageRange"]),
        }

    # National headline
    national_summary = {
        "totalSearches": grand_total,
        "ethnicityBroad": {
            g: {"count": n, "pct": round(n / grand_total * 100, 1) if grand_total else 0}
            for g, n in sorted(national["ethnicityBroad"].items(), key=lambda kv: -kv[1])
        },
        "topObjectsOfSearch": [
            {"object": k, "count": v, "pct": round(v / grand_total * 100, 1)}
            for k, v in sorted(national["objectOfSearch"].items(), key=lambda kv: -kv[1])[:6]
        ],
        "topOutcomes": [
            {"outcome": k, "count": v, "pct": round(v / grand_total * 100, 1)}
            for k, v in sorted(national["outcome"].items(), key=lambda kv: -kv[1])[:6]
        ],
    }

    # Top forces by minority share (proxy for ethnic-disparity flag — but
    # NOT a per-capita disparity because we lack denominators here)
    forces_with_min_volume = [
        (f, a) for f, a in forces.items() if a["totalSearches"] >= 200
    ]
    by_asian = sorted(
        forces_with_min_volume,
        key=lambda fa: -fa[1]["ethnicityBroad"].get("Asian", {"pct": 0})["pct"],
    )[:10]
    by_black = sorted(
        forces_with_min_volume,
        key=lambda fa: -fa[1]["ethnicityBroad"].get("Black", {"pct": 0})["pct"],
    )[:10]

    out = {
        "source": (
            "data.police.uk Stop and Search API, latest 3 months published "
            "by each force (force coverage 36 of 45 forces in window). "
            "Self-defined ethnicity bucketed into broad groups."
        ),
        "lastUpdated": "2026-04-28",
        "monthsCovered": sorted({m for f in forces.values() for m in f["monthsCovered"]}),
        "totalRecords": grand_total,
        "totalForces": len(forces),
        "caveat": (
            "Stop-and-search composition is NOT a crime-rate measure. The "
            "ethnicity mix shown is who was stopped, not who committed an "
            "offence. Disparity-ratio interpretation requires a population "
            "denominator by ethnicity per force area, which is not "
            "computed here. data.police.uk caps response sizes at 2,000 "
            "records per force-month; high-volume forces (Met, West "
            "Midlands) may truncate."
        ),
        "national": national_summary,
        "topForcesByAsianShare": [
            {"force": f, "totalSearches": a["totalSearches"],
             "asianPct": a["ethnicityBroad"].get("Asian", {"pct": 0})["pct"]}
            for f, a in by_asian
        ],
        "topForcesByBlackShare": [
            {"force": f, "totalSearches": a["totalSearches"],
             "blackPct": a["ethnicityBroad"].get("Black", {"pct": 0})["pct"]}
            for f, a in by_black
        ],
        "forces": forces,
    }
    OUT.write_text(json.dumps(out, indent=2))
    print(f"Wrote {OUT}")
    print(f"Forces: {len(forces)}, total records: {grand_total:,}")
    print(f"\n=== national breakdown ({grand_total:,} stops, last 3 months) ===")
    for g, v in national_summary["ethnicityBroad"].items():
        print(f"  {g:15s} {v['count']:>7,}  ({v['pct']:5.1f}%)")
    print(f"\nTop 5 forces by Asian share of stops:")
    for f, a in by_asian[:5]:
        print(f"  {f:25s} {a['ethnicityBroad'].get('Asian', {'pct': 0})['pct']:5.1f}%  ({a['totalSearches']:,} stops)")
    print(f"\nTop 5 forces by Black share:")
    for f, a in by_black[:5]:
        print(f"  {f:25s} {a['ethnicityBroad'].get('Black', {'pct': 0})['pct']:5.1f}%  ({a['totalSearches']:,} stops)")
    print(f"\nLancashire force breakdown:")
    if "lancashire" in forces:
        print(json.dumps(forces["lancashire"], indent=2)[:1000])


if __name__ == "__main__":
    main()
