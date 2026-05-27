#!/usr/bin/env python3
"""
Build a national-level NINo × Asylum × Returns bridge.

For each top-N NINo arriving nationality, surface:
  - Claims lodged in 2025 (Asy_D01)
  - Initial-decision grant rate (from asylum-grant-rates.json, lifted from
    asylumstats — Asy_D02-derived, recent-period substantive grant rate
    plus appeal uplift)
  - Returns from the UK in 2025, split into enforced / voluntary /
    refused-entry / port-refusal categories (Ret_D01)

Inputs:
  /Users/tompickup/asylumstats/data/raw/uk_routes/asylum-claims-datasets-dec-2025.xlsx
    (sheet Data_Asy_D01)
  /Users/tompickup/asylumstats/data/raw/uk_routes/returns-datasets-dec-2025.xlsx
    (sheet Data_Ret_D01)
  src/data/live/asylum-grant-rates.json (already lifted)
  data/raw/supplementary/nino-statxplore-cube.json (NINo flow summed
    across LAs)

Output:
  src/data/live/asylum-bridge.json

Caveats encoded in the output:
  - The four numbers come from different concepts and should not be
    summed: NINo flow is registrations-to-work; asylum claims are
    protection applications; grant rate is on the SUBSTANTIVE decisions
    cohort (different timing); returns are people removed or departed.
    The bridge surfaces each independently.
  - Asylum claims are by nationality of CLAIMANT, but a single
    individual may also generate a NINo registration AFTER being
    granted leave. There is no per-individual link between datasets;
    the bridge presents aggregates only.
  - Returns include enforced removals AND voluntary departures AND
    port-refusal events. The bridge surfaces each separately so the
    type can be read at a glance.
  - 2025 data is provisional in the latest HO release; back revisions
    in subsequent quarters can move the totals slightly.
"""
import json
from collections import defaultdict
from pathlib import Path

import pandas as pd

ROOT = Path(__file__).resolve().parents[2]
ASY_XLSX = Path("/Users/tompickup/asylumstats/data/raw/uk_routes/asylum-claims-datasets-mar-2026.xlsx")
RET_XLSX = Path("/Users/tompickup/asylumstats/data/raw/uk_routes/returns-datasets-mar-2026.xlsx")
GRANT_RATES = ROOT / "src/data/live/asylum-grant-rates.json"
NINO_CUBE = ROOT / "data/raw/supplementary/nino-statxplore-cube.json"
OUT = ROOT / "src/data/live/asylum-bridge.json"

YEAR = 2025


def load_claims_2025():
    """Total asylum claims by nationality, 2025, applicant type Main+Dep."""
    df = pd.read_excel(ASY_XLSX, engine="openpyxl", sheet_name="Data_Asy_D01", header=1)
    df = df[pd.to_numeric(df["Year"], errors="coerce") == YEAR]
    out = defaultdict(int)
    for _, row in df.iterrows():
        nat = row.get("Nationality")
        claims = row.get("Claims")
        if pd.isna(nat) or pd.isna(claims):
            continue
        try:
            out[str(nat)] += int(claims)
        except (TypeError, ValueError):
            continue
    return dict(out)


def load_returns_2025():
    """Returns 2025 by nationality, split by return-type group."""
    df = pd.read_excel(RET_XLSX, engine="openpyxl", sheet_name="Data_Ret_D01", header=1)
    df = df[pd.to_numeric(df["Year"], errors="coerce") == YEAR]
    out = defaultdict(lambda: defaultdict(int))
    for _, row in df.iterrows():
        nat = row.get("Nationality")
        rtype = row.get("Return type group")
        n = row.get("Number of returns")
        if pd.isna(nat) or pd.isna(rtype) or pd.isna(n):
            continue
        try:
            out[str(nat)][str(rtype)] += int(n)
        except (TypeError, ValueError):
            continue
    return {k: dict(v) for k, v in out.items()}


def load_grant_rates():
    """Look-up: nationality -> grant rate dict from the lifted JSON."""
    g = json.loads(GRANT_RATES.read_text())
    out = {}
    for entry in g.get("leagueTable", []):
        out[entry["nationality"]] = entry
    return out


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
    return dict(totals)


# Map between datasets where names differ. NINo and HO Asylum/Returns
# both use country-style names but a few canonicalisations differ.
NINO_TO_HO = {
    "United States": "United States",
    "Russia": "Russia",
    "Other / unknown": None,
}


def main():
    claims = load_claims_2025()
    returns = load_returns_2025()
    grant_rates = load_grant_rates()
    nino = load_nino_uk_totals()

    # National totals
    total_claims_2025 = sum(claims.values())
    total_returns_2025 = sum(sum(v.values()) for v in returns.values())
    total_returns_by_type = defaultdict(int)
    for nat, types in returns.items():
        for t, n in types.items():
            total_returns_by_type[t] += n

    # Build bridge: top-30 NINo × asylum claims × grant rate × returns
    top_nino = sorted(nino.items(), key=lambda x: -x[1])[:30]
    bridge = []
    for nino_name, nino_count in top_nino:
        ho_name = NINO_TO_HO.get(nino_name, nino_name)
        if ho_name is None:
            continue
        c = claims.get(ho_name, 0)
        r = returns.get(ho_name, {})
        gr = grant_rates.get(ho_name, {})
        bridge.append({
            "country": nino_name,
            "ninoFlowRollingYear_UK": nino_count,
            "asylumClaims2025": c,
            "asylumGrantRatePctRecent": gr.get("grantRatePct"),
            "asylumGrantRateIncludingAppealsPct": gr.get("trueGrantRatePct"),
            "appealUpliftPp": gr.get("appealUpliftPp"),
            "asylumClaimsAllTime_total": gr.get("totalDecisions"),
            "returns2025_total": sum(r.values()),
            "returns2025_byType": r,
        })

    # Top-15 by claims and by returns for at-a-glance leaderboards
    top_claims = sorted(claims.items(), key=lambda x: -x[1])[:15]
    top_returns = sorted(
        ((nat, sum(v.values())) for nat, v in returns.items()),
        key=lambda x: -x[1],
    )[:15]

    out = {
        "source": (
            "Home Office Immigration Statistics, year ending March 2026 (released 21 May 2026): "
            "Asy_D01 (claims), Ret_D01 (returns), and asylum-grant-rates.json "
            "(lifted from asylumstats, derived from Asy_D02 with appeal uplift "
            "from FT-IAC outcomes). Joined with DWP Stat-Xplore NINo flow "
            "rolling year ending Q4 2025."
        ),
        "lastUpdated": "2026-05-27",
        "caveat": (
            "Each metric comes from a different concept and they cannot be "
            "summed or netted. NINo flow is who registered to work or claim. "
            "Asylum claims are who applied for protection. Grant rate is on "
            "substantive initial decisions (the cohort being decided in the "
            "recent period, not the same individuals as 2025 claimants). "
            "Returns include enforced removals AND voluntary departures AND "
            "port refusals — three distinct flows surfaced separately. The "
            "bridge does not produce a per-individual story; it shows the "
            "aggregate composition of each flow per nationality."
        ),
        "nationalTotals": {
            "asylumClaims2025": total_claims_2025,
            "returns2025": total_returns_2025,
            "returns2025_byType": dict(total_returns_by_type),
            "ninoUk_rollingYearTotal": sum(nino.values()),
        },
        "topClaimNationalities2025": [
            {"country": n, "claims": c} for n, c in top_claims
        ],
        "topReturnNationalities2025": [
            {"country": n, "returns": c} for n, c in top_returns
        ],
        "bridge": bridge,
    }
    OUT.write_text(json.dumps(out, indent=2))
    print(f"Wrote {OUT}")
    print(f"\nNational totals 2025:")
    print(f"  Asylum claims:     {total_claims_2025:,}")
    print(f"  Returns:           {total_returns_2025:,}")
    for t, n in sorted(total_returns_by_type.items(), key=lambda x: -x[1]):
        print(f"    {t:30s} {n:>7,}")
    print(f"\nTop 10 claim nationalities 2025:")
    for n, c in top_claims[:10]:
        print(f"  {n:30s} {c:>7,}")
    print(f"\nTop 10 return nationalities 2025:")
    for n, c in top_returns[:10]:
        print(f"  {n:30s} {c:>7,}")
    print(f"\nBridge — top 12 NINo nationalities × asylum × returns:")
    print(f"  {'Country':<18s} {'NINo':>8s} {'Claims':>7s} {'Grant%':>7s} {'+Appeals%':>10s} {'Returns':>8s}")
    for r in bridge[:12]:
        gr_pct = r['asylumGrantRatePctRecent']
        gr_app = r['asylumGrantRateIncludingAppealsPct']
        gr_str = f"{gr_pct}%" if gr_pct is not None else "n/a"
        gr_app_str = f"{gr_app}%" if gr_app is not None else "n/a"
        print(
            f"  {r['country']:<18s} "
            f"{r['ninoFlowRollingYear_UK']:>8,} "
            f"{r['asylumClaims2025']:>7,} "
            f"{gr_str:>7s} "
            f"{gr_app_str:>10s} "
            f"{r['returns2025_total']:>8,}"
        )


if __name__ == "__main__":
    main()
