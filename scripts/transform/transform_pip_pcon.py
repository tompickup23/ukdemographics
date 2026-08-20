#!/usr/bin/env python3
"""
Transform PIP_Monthly_new cube (per-constituency) into a per-LA-mappable
JSON for surfacing on place pages. Uses the Westminster Parliamentary
Constituency 2024 boundaries.

For LAs whose boundaries align well with one PCON (e.g. Burnley LA =
Burnley PCON), the mapping is direct. For LAs that span multiple PCONs
or vice versa, we map by best-fit name match.

Inputs:
  data/raw/supplementary/pip-pcon-latest.json

Output:
  src/data/live/pip-pcon.json

The output is keyed by PCON ONS code (E14...) AND also indexed by
the (LA name -> matched PCON) approximation for convenience on the
place page.
"""
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
SRC = ROOT / "data/raw/supplementary/pip-pcon-latest.json"
OUT = ROOT / "src/data/live/pip-pcon.json"

# LA-name to PCON-name fuzzy mapping for common cases. Where multiple
# PCONs cover an LA (or vice versa), we pick the canonical match. For
# unmatched LAs the place page falls back to no PIP figure.
LA_NAME_TO_PCON_NAME = {
    "Burnley": "Burnley",
    "Pendle": "Pendle",
    "Preston": "Preston",
    "Hyndburn": "Hyndburn",
    "Chorley": "Chorley",
    "Ribble Valley": "Ribble Valley",
    "Lancaster": "Lancaster and Wyre",
    "Wyre": "Lancaster and Wyre",
    "South Ribble": "South Ribble",
    "West Lancashire": "West Lancashire",
    "Rossendale": "Rossendale and Darwen",
    "Fylde": "Fylde",
    "Blackburn with Darwen": "Blackburn",
    "Blackpool": "Blackpool South",
}


def main():
    cube = json.loads(SRC.read_text())
    fields = cube["fields"]
    date_field = fields[0]
    pcon_field = fields[1]
    latest_month_label = date_field["items"][0]["labels"][0]
    values = cube["cubes"][list(cube["cubes"].keys())[0]]["values"][0]

    by_pcon_name = {}
    by_pcon_code = {}
    total = 0
    for i, pcon in enumerate(pcon_field["items"]):
        name = pcon["labels"][0]
        uri = pcon["uris"][0]
        # Last element of the URI after the colon = the ONS PCON code (E14...)
        code = uri.split(":")[-1]
        v = values[i]
        if v is None:
            continue
        v = int(v)
        by_pcon_name[name] = {"code": code, "name": name, "claimants": v}
        by_pcon_code[code] = {"code": code, "name": name, "claimants": v}
        total += v

    sorted_pcons = sorted(by_pcon_name.values(), key=lambda r: -r["claimants"])
    top10 = sorted_pcons[:10]
    bot10 = sorted_pcons[-10:]

    # LA -> PCON best-fit mapping
    la_to_pcon = {}
    for la_name, pcon_name in LA_NAME_TO_PCON_NAME.items():
        match = by_pcon_name.get(pcon_name)
        if match:
            la_to_pcon[la_name] = match

    out = {
        "source": (
            "DWP Stat-Xplore PIP_Monthly_new dataset, latest published "
            "month. Geography: Westminster Parliamentary Constituency "
            "2024 boundaries."
        ),
        "lastUpdated": "2026-04-29",
        "latestMonth": latest_month_label,
        "totalConstituencies": len(by_pcon_name),
        "totalClaimants": total,
        "caveat": (
            "PIP is the working-age disability benefit. Claimant count "
            "is residence-based, by Westminster Parliamentary "
            "Constituency 2024. PCON does not perfectly align with LA "
            "for two-tier counties. PCON figures are NOT broken down by "
            "nationality at any level on the public Stat-Xplore API."
        ),
        "topConstituencies": top10,
        "bottomConstituencies": bot10,
        "byPconCode": by_pcon_code,
        "laToPconBestMatch": la_to_pcon,
    }
    OUT.write_text(json.dumps(out, indent=2))
    print(f"Wrote {OUT}")
    print(f"Latest month: {latest_month_label}")
    print(f"Constituencies: {len(by_pcon_name)}")
    print(f"Total claimants: {total:,}")
    print(f"\nLA → PCON sample (Lancashire):")
    for la in ["Burnley", "Pendle", "Preston", "Hyndburn", "Lancaster", "Blackburn with Darwen", "Blackpool"]:
        m = la_to_pcon.get(la)
        if m:
            print(f"  {la:25s} → {m['name']:30s} {m['claimants']:>6,}")


if __name__ == "__main__":
    main()
