#!/usr/bin/env python3
"""
Parse Home Office Vis_D02 (entry-clearance visa outcomes 2005-2025 Q4) and
produce a national-level visa-route mix per nationality, plus a bridge
that joins each top-N NINo arriving nationality to its 2025 visa-route
composition.

Inputs:
  data/raw/ho_visas/entry-clearance-visa-outcomes-datasets-dec-2025.xlsx
  data/raw/ho_visas/safe-legal-routes-summary-tables-dec-2025.ods (used
    only to surface humanitarian-route national totals — these are NOT
    nationality-disaggregated in this transform)
  data/raw/supplementary/nino-statxplore-cube.json (UK NINo flow summed
    across LAs)

Output:
  src/data/live/visa-routes.json

Logic:
  Visa type groups in Vis_D02: Family, Visitor, Study, Work, Other.
  Applicant-type structure differs by group:
    - Family / Visitor / Other: rows tagged 'All' are the complete total.
    - Study / Work: only Main applicant + Dependant rows; sum these.
  The transform applies the appropriate rule per group.

  Filter to Year=2025 (calendar year), Case outcome='Issued'. This pairs
  with the NINo rolling-year (Q1-Q4 2025) total used elsewhere.

Caveats encoded in the output:
  - Visas are GRANTED at the point of entry-clearance application; NINo
    is registered after arrival when work or claim begins. The two are
    related populations but not identical: a person granted a visa in
    Q4 2024 may register a NINo in Q2 2025; a Visitor visa never leads
    to a NINo. Visa grants overstate the NINo-relevant inflow because
    Visitors dominate the visa total; the bridge below excludes Visitor
    from the route mix to make the proportions interpretable.
  - EU/EEA nationals largely fall outside entry-clearance for Visit; for
    them, NINo flow is a much better measure of arrival.
  - Humanitarian routes (BN(O), Ukraine, Resettlement, Asylum-grant) are
    NOT split by nationality in the same dataset. National totals only
    are surfaced in the output 'humanitarianTotals' block.
"""
import json
from collections import defaultdict
from pathlib import Path

import pandas as pd

ROOT = Path(__file__).resolve().parents[2]
XLSX = ROOT / "data/raw/ho_visas/entry-clearance-visa-outcomes-datasets-mar-2026.xlsx"
HUM_ODS = ROOT / "data/raw/ho_visas/safe-legal-routes-summary-tables-mar-2026.ods"
NINO_CUBE = ROOT / "data/raw/supplementary/nino-statxplore-cube.json"
OUT = ROOT / "src/data/live/visa-routes.json"

YEAR = 2025

GROUPS_USING_ALL = {"Family", "Visitor", "Other"}
GROUPS_USING_MAIN_DEP = {"Study", "Work"}
MAIN_DEP_TYPES = {"Main Applicant", "Main applicant", "Dependant"}


def load_visa_grants():
    """Return {nationality: {visa_type_group: total_issued_2025}}."""
    df = pd.read_excel(XLSX, engine="openpyxl", sheet_name="Data_Vis_D02", header=3)
    df["Year"] = pd.to_numeric(df["Year"], errors="coerce")
    df = df[(df["Year"] == YEAR) & (df["Case outcome"] == "Issued")]

    out = defaultdict(lambda: defaultdict(int))
    for _, row in df.iterrows():
        grp = row["Visa type group"]
        applicant = row["Applicant type"]
        nat = row["Nationality"]
        decisions = row["Decisions"]
        if pd.isna(decisions) or pd.isna(nat):
            continue
        try:
            d = int(decisions)
        except (TypeError, ValueError):
            continue
        if grp in GROUPS_USING_ALL:
            if applicant == "All":
                out[nat][grp] += d
        elif grp in GROUPS_USING_MAIN_DEP:
            if applicant in MAIN_DEP_TYPES:
                out[nat][grp] += d
    return out


def load_humanitarian_totals():
    """National headline totals from Hum_01 (no nationality split here)."""
    df = pd.read_excel(HUM_ODS, engine="odf", sheet_name="Hum_01", header=None)
    # Header row contains 'Year' and the year columns; data rows follow.
    # Find header row.
    header_idx = None
    for i, row in df.iterrows():
        if str(row.iloc[0]).strip() == "Year":
            header_idx = i
            break
    if header_idx is None:
        return {}
    headers = [str(c).strip() for c in df.iloc[header_idx].tolist()]
    try:
        col_2025 = headers.index("2025") if "2025" in headers else headers.index("2025.0")
    except ValueError:
        return {}
    totals = {}
    for i in range(header_idx + 1, len(df)):
        label = str(df.iloc[i, 0]).strip()
        val = df.iloc[i, col_2025]
        if not label or label.lower() in {"nan", ""} or pd.isna(val):
            continue
        try:
            totals[label] = int(val)
        except (TypeError, ValueError):
            pass
    return totals


def load_nino_uk_totals():
    cube = json.loads(NINO_CUBE.read_text())
    fields = cube["fields"]
    nat_field = fields[1]
    qtr_field = fields[2]
    n_qtr = len(qtr_field["items"])
    recent4 = list(range(n_qtr - 4, n_qtr))
    values = cube["cubes"][list(cube["cubes"].keys())[0]]["values"]
    totals = defaultdict(int)
    for la_slice in values:
        for ni in range(len(nat_field["items"])):
            cell = la_slice[ni]
            for qi in recent4:
                v = cell[qi] if qi < len(cell) else 0
                if v:
                    totals[nat_field["items"][ni]["labels"][0]] += int(v)
    return totals


# Map between HO Vis_D02 nationality strings and DWP NINo nationality
# strings where they differ. Most match exactly. Deltas listed below.
NINO_TO_VISA_NAME = {
    "United States": "United States of America",
    "Korea (South)": "Korea (South)",
    "Korea (North)": "Korea (North)",
    "The Gambia": "Gambia, The",
    "Bahamas": "Bahamas, The",
    "Republic of the Congo": "Congo (Republic)",
    "Democratic Republic of the Congo": "Congo (Democratic Republic)",
    "St. Vincent": "St Vincent and the Grenadines",
    "Russia": "Russian Federation",
    "Other / unknown": None,
}


def main():
    visa_by_nat = load_visa_grants()
    nino = load_nino_uk_totals()
    hum_totals = load_humanitarian_totals()

    # National totals across all nationalities, per route
    national_route_totals = defaultdict(int)
    for nat_routes in visa_by_nat.values():
        for grp, n in nat_routes.items():
            national_route_totals[grp] += n

    # Bridge: top NINo nationalities, with their 2025 visa-route mix.
    # We exclude Visitor from the displayed mix because Visitor visas don't
    # lead to NINo registrations and would dwarf the work/study split.
    workshare_groups = ["Work", "Study", "Family", "Other"]
    # Build entries for the union of (NINo nationalities) and (visa-data nationalities)
    # so any LA's top-5 lookup will find a match. Lookup is keyed by NINo-style
    # nationality name; HO uses subtly different naming for a few countries.
    VISA_TO_NINO = {v: k for k, v in NINO_TO_VISA_NAME.items() if v is not None}
    all_nino_nats = set(nino.keys())
    all_visa_nats = set(visa_by_nat.keys())
    # Translate visa names back to NINo names where mapping exists
    visa_nats_as_nino = set()
    for v in all_visa_nats:
        visa_nats_as_nino.add(VISA_TO_NINO.get(v, v))
    union_nats = all_nino_nats | visa_nats_as_nino
    union_nats.discard("Other / unknown")

    bridge = []
    for nino_name in union_nats:
        visa_name = NINO_TO_VISA_NAME.get(nino_name, nino_name)
        if visa_name is None:
            continue
        nat_routes = visa_by_nat.get(visa_name, {})
        ws_total = sum(nat_routes.get(g, 0) for g in workshare_groups)
        mix = {g: nat_routes.get(g, 0) for g in workshare_groups}
        mix_pct = {
            g: (round(nat_routes.get(g, 0) / ws_total * 100, 1) if ws_total else 0)
            for g in workshare_groups
        }
        bridge.append({
            "country": nino_name,
            "visaCountryNameUsed": visa_name,
            "ninoFlowRollingYear_UK": nino.get(nino_name, 0),
            "visaGrants2025_total_workShareRoutes": ws_total,
            "visaGrants2025_total_visitor": nat_routes.get("Visitor", 0),
            "visaRouteMixCounts": mix,
            "visaRouteMixPct_workShareBasis": mix_pct,
        })
    bridge.sort(key=lambda r: -r["ninoFlowRollingYear_UK"])

    # Top nationalities by total 2025 visa grants (across work-share routes)
    top_visa = sorted(
        ((nat, sum(routes.get(g, 0) for g in workshare_groups))
         for nat, routes in visa_by_nat.items()),
        key=lambda x: -x[1],
    )[:20]

    out = {
        "source": (
            "Home Office, Immigration system statistics, year ending March 2026 (released 21 May 2026); "
            "Vis_D02 (Entry clearance visa outcomes by nationality, visa type, and "
            "outcome). Joined with DWP Stat-Xplore NINo registrations rolling year "
            "ending Q4 2025."
        ),
        "lastUpdated": "2026-05-27",
        "caveat": (
            "Visa grants are issued at the point of entry-clearance application "
            "and are NOT the same population as NINo registrations. Visitor visas "
            "(2.24 million in 2025) do not lead to NINo and are excluded from the "
            "route-mix percentages so the Work / Study / Family / Other proportions "
            "are interpretable. Humanitarian routes (BN(O), Ukraine schemes, "
            "Resettlement, Asylum) are surfaced as national totals only because the "
            "same nationality split is not provided in this dataset. EU/EEA "
            "nationals largely fall outside entry-clearance for short stays, so "
            "their NINo flow is materially understated by visa data alone."
        ),
        "year": YEAR,
        "nationalRouteTotals2025": dict(national_route_totals),
        "humanitarianTotals2025": hum_totals,
        "topVisaNationalities2025_workShareRoutes": [
            {"country": n, "totalGrants": c} for n, c in top_visa
        ],
        "bridge": bridge,
    }
    OUT.write_text(json.dumps(out, indent=2))
    print(f"Wrote {OUT}")
    print("\n=== national 2025 grants by route ===")
    for g, n in sorted(national_route_totals.items(), key=lambda x: -x[1]):
        print(f"  {g:10s} {n:>10,}")
    print("\n=== humanitarian (national totals 2025) ===")
    for k, v in hum_totals.items():
        print(f"  {k}: {v:,}")
    print("\n=== bridge: top 10 NINo nationalities, route mix excluding Visitor ===")
    print(f"  {'Country':<20s} {'NINo':>8s} {'WorkShare':>10s}  {'Work%':>6s} {'Study%':>7s} {'Family%':>8s} {'Other%':>7s}")
    for r in bridge[:10]:
        m = r["visaRouteMixPct_workShareBasis"]
        print(
            f"  {r['country']:<20s} {r['ninoFlowRollingYear_UK']:>8,} "
            f"{r['visaGrants2025_total_workShareRoutes']:>10,}  "
            f"{m['Work']:>5.1f}% {m['Study']:>6.1f}% {m['Family']:>7.1f}% {m['Other']:>6.1f}%"
        )


if __name__ == "__main__":
    main()
