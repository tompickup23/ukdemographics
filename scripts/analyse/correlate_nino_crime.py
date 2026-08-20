#!/usr/bin/env python3
"""
Per-LA correlation: NINo flow (rolling-year, per 1,000 population) and YoY%
change against total crime rate per 1,000 and YoY% change.

Outputs src/data/live/nino-crime-correlation.json with the same
ecological-fallacy caveat as the existing crime-correlation.json. Reports
two Pearson coefficients (level-on-level, change-on-change).

Inputs:
  - src/data/live/nino-dashboard.json
  - src/data/live/crime-dashboard.json
  - src/data/live/health-demand.json (LA population denominator)
"""
import json
from pathlib import Path
from statistics import mean

ROOT = Path(__file__).resolve().parents[2]
NINO = ROOT / "src/data/live/nino-dashboard.json"
CRIME = ROOT / "src/data/live/crime-dashboard.json"
POP = ROOT / "src/data/live/health-demand.json"
OUT = ROOT / "src/data/live/nino-crime-correlation.json"


def pearson(xs, ys):
    n = len(xs)
    if n < 3:
        return None
    mx, my = mean(xs), mean(ys)
    num = sum((x - mx) * (y - my) for x, y in zip(xs, ys))
    dx = sum((x - mx) ** 2 for x in xs) ** 0.5
    dy = sum((y - my) ** 2 for y in ys) ** 0.5
    if dx == 0 or dy == 0:
        return None
    return round(num / (dx * dy), 3)


def main():
    nino = json.loads(NINO.read_text())["areas"]
    crime = json.loads(CRIME.read_text())["areas"]
    pop = json.loads(POP.read_text())["areas"]

    pairs = []
    for code, n in nino.items():
        c = crime.get(code)
        p = pop.get(code, {})
        if not c or not p.get("population"):
            continue
        pop_k = p["population"] / 1000.0
        nino_total = n.get("totalRollingYear")
        nino_yoy = n.get("yearOnYearChangePct")
        crime_rate = c.get("totalCrimeRate")
        crime_yoy = c.get("yearOnYearChange")
        if nino_total is None or crime_rate is None:
            continue
        pairs.append({
            "areaCode": code,
            "areaName": n.get("areaName") or c.get("areaName"),
            "ninoFlowPer1k": round(nino_total / pop_k, 2),
            "ninoYoyPct": nino_yoy,
            "totalCrimeRate": crime_rate,
            "crimeYoyPct": crime_yoy,
            "population": p["population"],
        })

    level_pairs = [(r["ninoFlowPer1k"], r["totalCrimeRate"]) for r in pairs]
    r_level = pearson([a for a, _ in level_pairs], [b for _, b in level_pairs])

    change_pairs = [
        (r["ninoYoyPct"], r["crimeYoyPct"])
        for r in pairs
        if r["ninoYoyPct"] is not None and r["crimeYoyPct"] is not None
    ]
    r_change = pearson([a for a, _ in change_pairs], [b for _, b in change_pairs])

    pairs.sort(key=lambda r: -r["ninoFlowPer1k"])

    out = {
        "source": "nino-dashboard.json + crime-dashboard.json + health-demand.json",
        "methodology": (
            "Pearson correlation across local authorities with all three datasets. "
            "Level-on-level uses NINo registrations per 1,000 population (rolling "
            "year, latest 4 quarters) against police-recorded total crime rate per "
            "1,000 (year ending March 2024). Change-on-change uses NINo YoY% "
            "(latest rolling year vs prior 4 quarters) against crime YoY%."
        ),
        "lastUpdated": "2026-04-28",
        "caveat": (
            "ECOLOGICAL FALLACY WARNING: A correlation between area-level NINo "
            "flow and area-level crime does NOT mean overseas arrivals cause "
            "crime. Both variables are jointly affected by deprivation, age "
            "structure, urbanisation, and labour-market characteristics. "
            "Demographic flow data cannot identify offender attributes. This "
            "analysis cannot and must not be used to draw conclusions about "
            "individual or group behaviour."
        ),
        "pairsAnalysed": len(pairs),
        "correlationCoefficient_levelOnLevel": r_level,
        "correlationCoefficient_changeOnChange": r_change,
        "pairs": pairs,
    }
    OUT.write_text(json.dumps(out, indent=2))
    print(f"Wrote {OUT}")
    print(f"Pairs: {len(pairs)}")
    print(f"Pearson r (NINo per 1k vs crime rate per 1k): {r_level}")
    print(f"Pearson r (NINo YoY% vs crime YoY%):          {r_change}")
    print("\nTop 5 LAs by NINo flow rate (per 1k):")
    for r in pairs[:5]:
        print(
            f"  {r['areaName']:30s} "
            f"flow {r['ninoFlowPer1k']:>5.1f}/1k  "
            f"crime {r['totalCrimeRate']:>6.1f}/1k"
        )
    print("\nBurnley:")
    burn = next((r for r in pairs if r["areaCode"] == "E07000117"), None)
    if burn:
        print(json.dumps(burn, indent=2))


if __name__ == "__main__":
    main()
