#!/usr/bin/env python3
"""
Transform Census 2021 RM192 — HMO dwelling counts per LA — into a
per-LA HMO indicator with rate per 1,000 population.

Inputs:
  data/raw/census_hmo/rm192_hmo_la.csv (NOMIS NM_2292_1)
  src/data/live/health-demand.json (LA population denominator)

Output:
  src/data/live/hmo-density.json

Caveats:
  - Census 2021 RM192 is the count of DWELLINGS classified as HMO on
    Census Day (21 March 2021). It is NOT a count of currently-licensed
    HMOs — those are held in per-council licensing registers and not
    centrally published. Census methodology classifies a dwelling as
    HMO based on usual-resident composition (multiple unrelated adults
    forming separate households).
  - Small HMO = up to 4 unrelated adults; Large HMO = 5+ (mandatory
    licensing threshold).
  - Stock measure on a single date.
"""
import csv
import json
from collections import defaultdict
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
SRC = ROOT / "data/raw/census_hmo/rm192_hmo_la.csv"
POP = ROOT / "src/data/live/health-demand.json"
OUT = ROOT / "src/data/live/hmo-density.json"


def main():
    by_la = defaultdict(dict)
    name = {}
    with SRC.open() as fh:
        reader = csv.DictReader(fh)
        for row in reader:
            code = row["GEOGRAPHY_CODE"]
            name[code] = row["GEOGRAPHY_NAME"]
            cat = row["C2021_DWELL_HMO_3_NAME"]
            try:
                v = int(row["OBS_VALUE"])
            except (TypeError, ValueError):
                continue
            by_la[code][cat] = v

    pop_data = json.loads(POP.read_text())["areas"]

    areas = {}
    for code, vals in by_la.items():
        small = vals.get("Is a small HMO", 0)
        large = vals.get("Is a large HMO", 0)
        total_hmo = vals.get("Total", small + large)
        pop = pop_data.get(code, {}).get("population")
        rate_per_1k = round(total_hmo / pop * 1000, 2) if pop else None
        large_share = round(large / total_hmo * 100, 1) if total_hmo else None
        areas[code] = {
            "areaName": name[code],
            "totalHmoDwellings": total_hmo,
            "smallHmo": small,
            "largeHmo": large,
            "largeHmoSharePct": large_share,
            "population2021": pop,
            "hmoPer1kPopulation": rate_per_1k,
        }

    # Top by rate per 1k
    top = sorted(
        [(c, a) for c, a in areas.items() if a["hmoPer1kPopulation"] is not None],
        key=lambda kv: -kv[1]["hmoPer1kPopulation"],
    )[:15]

    out = {
        "source": (
            "ONS Census 2021 RM192 — Number of dwellings that are houses "
            "in multiple occupation, by local authority. NOMIS NM_2292_1. "
            "Population denominator from health-demand.json (Census 2021)."
        ),
        "lastUpdated": "2026-04-29",
        "caveat": (
            "Census 2021 RM192 counts dwellings classified as HMO on "
            "Census Day (21 March 2021). NOT a current licensing register; "
            "those are held by individual councils and not centrally "
            "published. Small HMO = up to 4 unrelated adults; Large HMO "
            "= 5+ adults (the mandatory licensing threshold)."
        ),
        "totalLAs": len(areas),
        "topByRatePer1k": [
            {"code": c, "name": a["areaName"], "rate": a["hmoPer1kPopulation"],
             "totalHmo": a["totalHmoDwellings"]}
            for c, a in top
        ],
        "areas": areas,
    }
    OUT.write_text(json.dumps(out, indent=2))
    print(f"Wrote {OUT}")
    print(f"LAs: {len(areas)}")
    print(f"\nTop 10 LAs by HMO per 1k population:")
    for c, a in top[:10]:
        print(f"  {a['areaName']:30s} {a['hmoPer1kPopulation']:5.2f}/1k  ({a['totalHmoDwellings']:,} HMOs)")
    print(f"\nLancashire districts:")
    lancs_codes = ["E07000117","E07000118","E07000119","E07000120","E07000121","E07000122","E07000123","E07000124","E07000125","E07000126","E07000127","E07000128"]
    for code in lancs_codes:
        a = areas.get(code)
        if a:
            print(f"  {a['areaName']:18s} HMO {a['totalHmoDwellings']:>4} ({a['hmoPer1kPopulation']:5.2f}/1k)")


if __name__ == "__main__":
    main()
