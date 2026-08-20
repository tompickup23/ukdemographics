#!/usr/bin/env python3
"""
Consolidate per-year NINo cube files (data/raw/supplementary/nino-by-year/{Y}.json)
into a per-LA time series 2002 → 2025.

Outputs:
  src/data/live/nino-historical.json
    {
      "years": [2002, ..., 2025],
      "areas": {
        "E07000117": {
          "areaName": "Burnley",
          "totalByYear": [n2002, n2003, ..., n2025],
          "topNationalitiesByYear": {
            "2025": [{"nationality":"Pakistan","count":196,"sharePct":39.4}, ...]
            // top 10 per year
          }
        }
      },
      "national": {
        "totalByYear": [...],
        "topNationalitiesByYear": {...}
      }
    }

Sized to fit within an Astro static-data file (per-LA totals are 24 ints,
top-10 entries per year keep the JSON readable for chart libraries).
"""
import json
from collections import defaultdict
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
SRC_DIR = ROOT / "data/raw/supplementary/nino-by-year"
OUT_COMPACT = ROOT / "src/data/live/nino-historical.json"
OUT_DETAIL = ROOT / "src/data/live/nino-nationality-history.json"

YEARS = list(range(2002, 2026))


def parse_year_cube(year):
    path = SRC_DIR / f"{year}.json"
    if not path.exists():
        return None
    cube = json.loads(path.read_text())
    fields = cube["fields"]
    la_field, nat_field, qtr_field = fields[0], fields[1], fields[2]
    values = cube["cubes"][list(cube["cubes"].keys())[0]]["values"]

    n_la = len(values)
    n_nat = len(nat_field["items"])

    # values shape: [LA][nationality][quarter]
    # Sum across all 4 quarters for the year, per LA per nationality
    la_year = []
    for li in range(n_la):
        item = la_field["items"][li]
        la_label = item["labels"][0]
        # ONS code from URI: ...:LA_TO_REGION_NI:E07000117
        la_uri = item["uris"][0]
        la_code = la_uri.split(":")[-1]
        nat_totals = {}
        la_total = 0
        for ni in range(n_nat):
            cell = values[li][ni]
            n_qtr = len(cell)
            ssum = 0
            for qi in range(n_qtr):
                v = cell[qi]
                if v:
                    ssum += int(v)
            if ssum > 0:
                nat_label = nat_field["items"][ni]["labels"][0]
                nat_totals[nat_label] = ssum
                la_total += ssum
        la_year.append({
            "code": la_code,
            "name": la_label,
            "total": la_total,
            "byNat": nat_totals,
        })
    return la_year


def main():
    # Collect per-year data
    per_year_data = {}
    for year in YEARS:
        d = parse_year_cube(year)
        if d is None:
            print(f"WARNING: {year} cube missing")
            continue
        per_year_data[year] = d
        print(f"  {year}: {len(d)} LAs, total flow {sum(la['total'] for la in d):,}")

    # Build per-LA structure
    # area_code -> areaName, totalByYear[], topNationalitiesByYear{}
    areas = {}
    # First, get the union of all LA codes that appear in any year
    all_codes = set()
    for year, las in per_year_data.items():
        for la in las:
            all_codes.add(la["code"])

    # Initialize each LA
    code_to_name = {}
    for year, las in per_year_data.items():
        for la in las:
            if la["code"] not in code_to_name and la["name"]:
                code_to_name[la["code"]] = la["name"]

    for code in all_codes:
        areas[code] = {
            "areaName": code_to_name.get(code, code),
            "totalByYear": [],
            "topNationalitiesByYear": {},
        }

    # Fill in per-year per-LA data
    for year in YEARS:
        las = per_year_data.get(year)
        if not las:
            for code in all_codes:
                areas[code]["totalByYear"].append(None)
            continue
        by_code = {la["code"]: la for la in las}
        for code in all_codes:
            la = by_code.get(code)
            if not la:
                areas[code]["totalByYear"].append(None)
                continue
            areas[code]["totalByYear"].append(la["total"])
            # top 10 nationalities for this LA in this year
            top = sorted(la["byNat"].items(), key=lambda kv: -kv[1])[:10]
            areas[code]["topNationalitiesByYear"][str(year)] = [
                {
                    "nationality": n,
                    "count": c,
                    "sharePct": round(c / la["total"] * 100, 1) if la["total"] else 0,
                }
                for n, c in top
            ]

    # National totals — sum across all LAs per year
    national_totals_by_year = []
    national_top_by_year = {}
    for year in YEARS:
        las = per_year_data.get(year)
        if not las:
            national_totals_by_year.append(None)
            continue
        nat_totals = defaultdict(int)
        year_total = 0
        for la in las:
            year_total += la["total"]
            for nat, c in la["byNat"].items():
                nat_totals[nat] += c
        national_totals_by_year.append(year_total)
        top = sorted(nat_totals.items(), key=lambda kv: -kv[1])[:15]
        national_top_by_year[str(year)] = [
            {
                "nationality": n,
                "count": c,
                "sharePct": round(c / year_total * 100, 1) if year_total else 0,
            }
            for n, c in top
        ]

    # Compute peak/trough per LA
    for code, area in areas.items():
        totals = [t for t in area["totalByYear"] if t is not None]
        if totals:
            area["peakYear"] = YEARS[area["totalByYear"].index(max(totals))]
            area["peakValue"] = max(totals)
            area["troughYear"] = YEARS[area["totalByYear"].index(min(totals))]
            area["troughValue"] = min(totals)
            area["latestValue"] = totals[-1] if area["totalByYear"][-1] is not None else None
            area["earliestValue"] = totals[0]
            # Cumulative flow over the period
            area["cumulativeFlow_2002_2025"] = sum(totals)
        else:
            area["peakYear"] = area["peakValue"] = area["troughYear"] = area["troughValue"] = None
            area["latestValue"] = area["earliestValue"] = None
            area["cumulativeFlow_2002_2025"] = 0

    SOURCE = (
        "DWP Stat-Xplore — NINO Registrations to Adult Overseas Nationals "
        "Entering the UK (Ninos cube), aggregated per calendar year by "
        "summing the four constituent quarters. Geography: ONS LA codes."
    )
    CAVEAT = (
        "Counts are NEW NINo registrations per calendar year. A NINo is "
        "issued once per person at the point of first work or claim, so "
        "this is a flow measure, not a stock. People who arrive but never "
        "register (some students, dependants, retirees) are excluded. "
        "Late registrations show in a later year than the year of arrival. "
        "Pre-2010 figures used a different administrative system; series "
        "is comparable but small methodological revisions to the early "
        "years are possible."
    )

    # Compact file — per-LA total time series only (no nationality breakdown)
    # Designed for cheap place-page rendering of the long-run flow trend.
    compact_areas = {}
    for code, area in areas.items():
        compact_areas[code] = {
            "areaName": area["areaName"],
            "totalByYear": area["totalByYear"],
            "peakYear": area.get("peakYear"),
            "peakValue": area.get("peakValue"),
            "troughYear": area.get("troughYear"),
            "troughValue": area.get("troughValue"),
            "latestValue": area.get("latestValue"),
            "earliestValue": area.get("earliestValue"),
            "cumulativeFlow_2002_2025": area.get("cumulativeFlow_2002_2025", 0),
        }
    compact = {
        "source": SOURCE,
        "lastUpdated": "2026-04-29",
        "years": YEARS,
        "caveat": CAVEAT,
        "national": {
            "totalByYear": national_totals_by_year,
            "topNationalitiesByYear": {
                # Only latest year for context — full series is in detail file
                str(YEARS[-1]): national_top_by_year.get(str(YEARS[-1]), []),
            },
        },
        "areas": compact_areas,
    }
    OUT_COMPACT.write_text(json.dumps(compact, indent=2))
    compact_mb = OUT_COMPACT.stat().st_size / (1024 * 1024)
    print(f"\nCompact file: {OUT_COMPACT.name} — {compact_mb:.2f} MB")

    # Detail file — full per-LA × per-year top-10 nationality breakdown.
    # Loaded lazily by analysis pages, NOT by the default place page.
    detail = {
        "source": SOURCE,
        "lastUpdated": "2026-04-29",
        "years": YEARS,
        "caveat": CAVEAT,
        "national": {
            "totalByYear": national_totals_by_year,
            "topNationalitiesByYear": national_top_by_year,
        },
        "areas": areas,
    }
    OUT_DETAIL.write_text(json.dumps(detail, indent=2))
    detail_mb = OUT_DETAIL.stat().st_size / (1024 * 1024)
    print(f"Detail file:  {OUT_DETAIL.name} — {detail_mb:.2f} MB")
    print(f"Areas: {len(areas)}")
    print(f"\nNational total flow by year:")
    for y, t in zip(YEARS, national_totals_by_year):
        print(f"  {y}: {t:>9,}" if t else f"  {y}: missing")
    print(f"\nBurnley (E07000117) trajectory:")
    b = areas.get("E07000117", {})
    for y, t in zip(YEARS, b.get("totalByYear", [])):
        print(f"  {y}: {t}" if t is not None else f"  {y}: -")
    print(f"  Peak: {b.get('peakYear')} ({b.get('peakValue')})")
    print(f"  Trough: {b.get('troughYear')} ({b.get('troughValue')})")
    print(f"  Cumulative 2002-2025: {b.get('cumulativeFlow_2002_2025'):,}")


if __name__ == "__main__":
    main()
