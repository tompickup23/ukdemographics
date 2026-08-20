#!/usr/bin/env python3
"""
Transform raw NOMIS TS012 country-of-birth CSV into a per-LA dashboard
with stock-vs-flow comparison against nino-dashboard.json.

Inputs:
  data/raw/census_country_of_birth/ts012_cob_la.csv
  src/data/live/nino-dashboard.json

Output:
  src/data/live/country-of-birth.json

The CSV's C2021_COB_58_NAME values are hierarchical (e.g. "Middle East
and Asia: Southern Asia: Pakistan"). Aggregate rows (Europe, Africa, EU
countries, etc.) are excluded by checking that the row's value code is a
leaf code in the codelist (the deeper a name's colon-depth, the more
specific). Only leaf codes are used so we don't double-count.

The stock-vs-flow table joins on the trailing leaf name (e.g. "Pakistan",
"India", "Iran"). NINo nationality and TS012 country-of-birth are not
identical concepts (the former is self-declared citizenship at NINo
registration; the latter is country of birth on Census Day 21 March
2021) — for some countries they will differ. The output includes both
side by side, never combined into a single number.
"""
import csv
import json
from collections import defaultdict
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
CSV_PATH = ROOT / "data/raw/census_country_of_birth/ts012_cob_la.csv"
NINO_PATH = ROOT / "src/data/live/nino-dashboard.json"
OUT = ROOT / "src/data/live/country-of-birth.json"

# Aggregate codes from the C2021_COB_58 codelist (anything 1001+ or 0=Total)
# are excluded from the leaf list.
def is_leaf(code):
    try:
        n = int(code)
    except (TypeError, ValueError):
        return False
    return 1 <= n <= 999  # 1..999 are leaf country codes; 1001+ are aggregates


def leaf_name(hierarchical_name):
    """`Europe: Other Europe: ... : Pakistan` -> `Pakistan`."""
    parts = [p.strip() for p in (hierarchical_name or "").split(":")]
    return parts[-1] if parts else hierarchical_name


def main():
    if not CSV_PATH.exists():
        print(f"ERROR: {CSV_PATH} not found. Run scripts/fetch/fetch-country-of-birth.mjs first.")
        return 2

    # Group rows: la_code -> {country_name -> obs}, plus la_code -> total
    by_la = defaultdict(dict)
    la_total = {}
    la_name = {}

    with CSV_PATH.open() as fh:
        reader = csv.DictReader(fh)
        for row in reader:
            code = row["GEOGRAPHY_CODE"]
            la_name[code] = row["GEOGRAPHY_NAME"]
            cob_code = row["C2021_COB_58"]
            cob_name = row["C2021_COB_58_NAME"]
            try:
                obs = int(row["OBS_VALUE"])
            except (TypeError, ValueError):
                continue
            if cob_code == "0":
                la_total[code] = obs
                continue
            if not is_leaf(cob_code):
                continue
            by_la[code][leaf_name(cob_name)] = obs

    # Load NINo dashboard for stock-vs-flow join
    nino = json.loads(NINO_PATH.read_text())["areas"]

    areas = {}
    for code, breakdown in by_la.items():
        total = la_total.get(code)
        if not total:
            continue
        # Identify UK-born countries (England/NI/Scotland/Wales + GB/UK NOS)
        uk_keys = ["England", "Northern Ireland", "Scotland", "Wales",
                   "Great Britain not otherwise specified",
                   "United Kingdom not otherwise specified"]
        uk_born = sum(breakdown.get(k, 0) for k in uk_keys)
        non_uk_born = total - uk_born

        # Top 10 non-UK countries by stock
        non_uk_entries = [
            (k, v) for k, v in breakdown.items() if k not in uk_keys
        ]
        non_uk_entries.sort(key=lambda kv: -kv[1])
        top_cob = [
            {
                "country": k,
                "count": v,
                "sharePct": round(v / total * 100, 1),
            }
            for k, v in non_uk_entries[:10] if v > 0
        ]

        # Stock-vs-flow: for each NINo top-10 nationality, look up the
        # corresponding TS012 country-of-birth count, by leaf-name match.
        stock_vs_flow = []
        nino_area = nino.get(code)
        if nino_area:
            for entry in nino_area.get("byNationality", []):
                nat = entry["nationality"]
                if nat in {"Other / unknown"}:
                    continue
                stock = breakdown.get(nat)
                stock_vs_flow.append({
                    "country": nat,
                    "ninoFlowRollingYear": entry["count"],
                    "ninoFlowSharePct": entry["sharePct"],
                    "censusStock2021": stock,
                    "censusStockSharePct": (
                        round(stock / total * 100, 2) if stock else None
                    ),
                })

        areas[code] = {
            "areaName": la_name[code],
            "totalPopulation2021": total,
            "ukBornCount": uk_born,
            "ukBornPct": round(uk_born / total * 100, 1),
            "nonUkBornCount": non_uk_born,
            "nonUkBornPct": round(non_uk_born / total * 100, 1),
            "topCountriesOfBirth": top_cob,
            "stockVsFlow": stock_vs_flow,
        }

    out = {
        "source": "ONS Census 2021 TS012 (NOMIS NM_2032_1) joined with DWP NINo registrations (Stat-Xplore Ninos)",
        "methodology": (
            "TS012 country-of-birth shows the stock of usual residents on "
            "Census Day 21 March 2021 by country of birth. Joined per LA "
            "against the rolling-year NINo registrations to adult overseas "
            "nationals. Country-of-birth and self-declared nationality are "
            "different concepts; the join is by leaf country name only."
        ),
        "lastUpdated": "2026-04-28",
        "caveat": (
            "Stock and flow are not the same measure. Census 2021 country-"
            "of-birth counts everyone born outside the UK living here on "
            "21 March 2021, regardless of when they arrived. NINo flow "
            "counts new working-age registrations in the rolling year. A "
            "person already in the UK at Census Day does not appear in "
            "today's NINo flow; a NINo registrant's country of birth and "
            "their declared nationality may differ."
        ),
        "areas": areas,
    }
    OUT.write_text(json.dumps(out, indent=2))
    print(f"Wrote {OUT}")
    print(f"LAs covered: {len(areas)}")
    burn = areas.get("E07000117")
    if burn:
        print("\nBurnley stock-vs-flow snapshot:")
        print(f"  Population (2021): {burn['totalPopulation2021']:,}")
        print(f"  UK-born:     {burn['ukBornCount']:,} ({burn['ukBornPct']}%)")
        print(f"  Non-UK-born: {burn['nonUkBornCount']:,} ({burn['nonUkBornPct']}%)")
        top_strs = [f"{c['country']} {c['count']:,}" for c in burn['topCountriesOfBirth'][:5]]
        print(f"  Top 5 stock: {', '.join(top_strs)}")
        print(f"\n  Stock vs flow (Census stock 2021 vs NINo flow rolling year 2025):")
        for r in burn["stockVsFlow"][:8]:
            stock = f"{r['censusStock2021']:,}" if r['censusStock2021'] else "n/a"
            print(f"    {r['country']:15s} stock={stock:>8s}  flow={r['ninoFlowRollingYear']}")


if __name__ == "__main__":
    main()
