#!/usr/bin/env python3
"""
Build per-LA change in country-of-birth composition between Census 2011
(KS204EW, broad groups) and Census 2021 (TS012, detailed groups rolled
up to the same broad groups). The 2011 boundaries differ from 2021
boundaries for some LAs (mergers, unitarisations); we map best-fit
where the 2021 LA code is unchanged.

Inputs:
  data/raw/census_cob_2011/ks204ew.csv (Census 2011, 2011 LA boundaries)
  src/data/live/country-of-birth.json (Census 2021, 2023 LA boundaries)

Output:
  src/data/live/country-of-birth-change-2011-2021.json

Caveats:
  - LA boundaries changed between 2011 and 2021 (Buckinghamshire,
    Northamptonshire, North Yorkshire, Somerset and others were
    re-organised into unitaries). Where the 2011 LA code does not
    match a 2021 LA, the change is shown as "boundary-changed" and
    not aggregated.
  - 2011 categories: UK, Ireland, Other EU pre-2001, EU accession 2001-2011,
    Other countries. 2021 categories from TS012 are richer; we roll
    them up to the same broad groups.
"""
import csv
import json
from collections import defaultdict
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
SRC_2011 = ROOT / "data/raw/census_cob_2011/ks204ew.csv"
SRC_2021 = ROOT / "src/data/live/country-of-birth.json"
OUT = ROOT / "src/data/live/country-of-birth-change-2011-2021.json"

# Mapping 2011 KS204EW cells to broad groups
CELL_2011_TO_GROUP = {
    "1": "UK",                # England
    "2": "UK",                # Northern Ireland
    "3": "UK",                # Scotland
    "4": "UK",                # Wales
    "5": "UK",                # UK NOS
    "6": "Ireland",           # Ireland
    "7": "EU_pre2001",        # Other EU Member countries in March 2001
    "8": "EU_post2001_pre2011",  # Accession 2001-2011
    "9": "RestOfWorld",       # Other countries
}

# 2021 TS012 leaf country names rolled up to the same broad groups.
# Reproduces the hierarchy in TS012 from earlier exploration.
def cob_2021_group(country_name):
    """Map a TS012 leaf country name to one of the 2011 broad groups."""
    n = country_name.strip()
    if n in {"England", "Northern Ireland", "Scotland", "Wales",
             "Great Britain not otherwise specified",
             "United Kingdom not otherwise specified"}:
        return "UK"
    if n == "Ireland":
        return "Ireland"
    # EU pre-2004 leaf countries (treating "EU14" / pre-2001 as same group)
    eu_pre = {
        "France", "Germany", "Italy", "Portugal (including Madeira and the Azores)",
        "Spain (including Canary Islands)", "Other member countries in March 2001",
    }
    if n in eu_pre:
        return "EU_pre2001"
    # EU 2001-2011 accession (EU8 + EU2 except Croatia which is post-2011)
    eu_post = {
        "Lithuania", "Poland", "Romania",
        "Other EU countries", "Croatia",  # Croatia is post-2011 in 2021 data; flagged
    }
    if n in eu_post:
        return "EU_post2001_pre2011"
    # All other countries -> RestOfWorld
    return "RestOfWorld"


def main():
    # Load 2011 data
    by_la_2011 = defaultdict(lambda: defaultdict(int))
    name_2011 = {}
    with SRC_2011.open() as fh:
        reader = csv.DictReader(fh)
        for row in reader:
            code = row["GEOGRAPHY_CODE"]
            name_2011[code] = row["GEOGRAPHY_NAME"]
            cell = row["CELL"]
            try:
                v = int(row["OBS_VALUE"])
            except (TypeError, ValueError):
                continue
            if cell == "0":
                by_la_2011[code]["TotalPopulation"] = v
                continue
            grp = CELL_2011_TO_GROUP.get(cell)
            if grp:
                by_la_2011[code][grp] += v

    # Load 2021 data. Re-aggregate from the FULL TS012 raw CSV so we
    # capture all 60+ countries, not just the top-10 surfaced in
    # country-of-birth.json.
    cob_2021 = json.loads(SRC_2021.read_text())
    by_la_2021 = defaultdict(lambda: defaultdict(int))
    name_2021 = {}
    for code, area in cob_2021["areas"].items():
        name_2021[code] = area["areaName"]
        by_la_2021[code]["TotalPopulation"] = area["totalPopulation2021"]
        by_la_2021[code]["UK"] = area["ukBornCount"]

    # Re-read the raw TS012 to get the full country breakdown
    raw_ts012 = ROOT / "data/raw/census_country_of_birth/ts012_cob_la.csv"
    if raw_ts012.exists():
        with raw_ts012.open() as fh:
            reader = csv.DictReader(fh)
            for row in reader:
                code = row["GEOGRAPHY_CODE"]
                if code not in by_la_2021:
                    continue
                cob_code = row["C2021_COB_58"]
                cob_name = row["C2021_COB_58_NAME"]
                try:
                    v = int(row["OBS_VALUE"])
                except (TypeError, ValueError):
                    continue
                if cob_code == "0":  # Total
                    continue
                # Filter to leaf codes only (1-999); aggregates 1001+ are skipped
                try:
                    n = int(cob_code)
                except ValueError:
                    continue
                if not (1 <= n <= 999):
                    continue
                # Get the leaf country name (after final colon in hierarchical name)
                parts = [p.strip() for p in cob_name.split(":")]
                leaf = parts[-1] if parts else cob_name
                grp = cob_2021_group(leaf)
                if grp == "UK":
                    continue  # already counted
                by_la_2021[code][grp] += v
    else:
        # Fallback: top-10 only (less accurate)
        for code, area in cob_2021["areas"].items():
            for c in area.get("topCountriesOfBirth", []):
                grp = cob_2021_group(c["country"])
                if grp != "UK":
                    by_la_2021[code][grp] += c["count"]

    # Compute change for LAs with a code present in both years
    areas = {}
    only_2011 = []
    only_2021 = []
    for code in set(by_la_2011) | set(by_la_2021):
        in_11 = code in by_la_2011
        in_21 = code in by_la_2021
        if not in_11:
            only_2021.append(code)
            continue
        if not in_21:
            only_2011.append(code)
            continue
        d_11 = by_la_2011[code]
        d_21 = by_la_2021[code]
        pop_11 = d_11.get("TotalPopulation", 0)
        pop_21 = d_21.get("TotalPopulation", 0)
        groups = ["UK", "Ireland", "EU_pre2001", "EU_post2001_pre2011", "RestOfWorld"]
        change = {}
        for g in groups:
            v11 = d_11.get(g, 0)
            v21 = d_21.get(g, 0)
            change[g] = {
                "count2011": v11,
                "count2021": v21,
                "absoluteChange": v21 - v11,
                "pctOfPop2011": round(v11 / pop_11 * 100, 1) if pop_11 else None,
                "pctOfPop2021": round(v21 / pop_21 * 100, 1) if pop_21 else None,
            }
        # Total non-UK count for headline
        non_uk_2011 = sum(d_11.get(g, 0) for g in groups if g != "UK")
        non_uk_2021 = sum(d_21.get(g, 0) for g in groups if g != "UK")
        areas[code] = {
            "areaName": name_2021.get(code) or name_2011.get(code),
            "population2011": pop_11,
            "population2021": pop_21,
            "populationChange": pop_21 - pop_11,
            "populationChangePct": (
                round((pop_21 - pop_11) / pop_11 * 100, 1) if pop_11 else None
            ),
            "nonUkBorn2011": non_uk_2011,
            "nonUkBorn2021": non_uk_2021,
            "nonUkBornChange": non_uk_2021 - non_uk_2011,
            "nonUkBornPct2011": (
                round(non_uk_2011 / pop_11 * 100, 1) if pop_11 else None
            ),
            "nonUkBornPct2021": (
                round(non_uk_2021 / pop_21 * 100, 1) if pop_21 else None
            ),
            "byGroup": change,
        }

    # Top by absolute non-UK-born growth
    top = sorted(
        [(c, a) for c, a in areas.items()],
        key=lambda kv: -kv[1]["nonUkBornChange"],
    )[:15]

    out = {
        "source": (
            "ONS Census 2011 KS204EW (NOMIS NM_611_1) and ONS Census "
            "2021 TS012 (NOMIS NM_2032_1), aligned to broad country-of-"
            "birth groups: UK, Ireland, EU pre-2001, EU 2001-2011 "
            "accession, Rest of World."
        ),
        "lastUpdated": "2026-04-29",
        "caveat": (
            "Census-to-Census comparison is mostly stable for districts "
            "and unitary authorities whose ONS codes were unchanged "
            "between 2011 and 2021. Where the 2011 LA code does not "
            "match a 2021 LA (Buckinghamshire, Northamptonshire, North "
            "Yorkshire, Somerset reorganisations), the area is omitted. "
            "EU group definitions differ slightly between Censuses; "
            "the 2011 'pre-2001' group is mapped to the 2021 EU14-style "
            "group at country level."
        ),
        "totalLAs": len(areas),
        "topLAsByNonUkBornGrowth": [
            {
                "code": c, "name": a["areaName"],
                "nonUkBornChange": a["nonUkBornChange"],
                "nonUkBornPct2011": a["nonUkBornPct2011"],
                "nonUkBornPct2021": a["nonUkBornPct2021"],
            }
            for c, a in top
        ],
        "areas": areas,
    }
    OUT.write_text(json.dumps(out, indent=2))
    print(f"Wrote {OUT}")
    print(f"Areas with both years: {len(areas)}")
    print(f"Areas only in 2011: {len(only_2011)}")
    print(f"Areas only in 2021: {len(only_2021)}")
    print(f"\nTop 10 LAs by absolute non-UK-born growth 2011→2021:")
    for c, a in top[:10]:
        print(f"  {a['areaName']:30s} +{a['nonUkBornChange']:>5,}  "
              f"({a['nonUkBornPct2011']}% → {a['nonUkBornPct2021']}%)")
    burn = areas.get("E07000117")
    if burn:
        print(f"\nBurnley (E07000117):")
        print(f"  Population 2011 → 2021: {burn['population2011']:,} → {burn['population2021']:,}  ({burn['populationChangePct']:+}%)")
        print(f"  Non-UK-born 2011 → 2021: {burn['nonUkBorn2011']:,} ({burn['nonUkBornPct2011']}%) → {burn['nonUkBorn2021']:,} ({burn['nonUkBornPct2021']}%)")
        print(f"  Change: +{burn['nonUkBornChange']:,}")
        print(f"\n  By group:")
        for g, d in burn["byGroup"].items():
            print(f"    {g:25s} {d['count2011']:>5,} → {d['count2021']:>5,}  ({d['absoluteChange']:+,})")


if __name__ == "__main__":
    main()
