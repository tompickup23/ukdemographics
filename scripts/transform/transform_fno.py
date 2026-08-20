#!/usr/bin/env python3
"""
Parse MOJ Offender Management Statistics — Table 1.Q.12 (prison population
by nationality and sex, as at 31 December 2025, England and Wales) — and
produce a national-level FNO bridge that pairs each top NINo arriving
nationality with the corresponding England-and-Wales prison-population
count.

Inputs:
  data/raw/moj_fno/prison-population-2025-12-31.ods (sheet Table_1_Q_12)
  data/raw/supplementary/nino-statxplore-cube.json  (UK-wide NINo flow,
                                                    summed across LAs)

Output:
  src/data/live/fno-bridge.json

Caveats encoded in the output:
  - Geographic mismatch: NINo is UK-wide, FNO is England and Wales only.
    Both Scotland and Northern Ireland prison populations are excluded
    from the FNO numerator.
  - Concept mismatch: NINo nationality is self-declared at registration,
    not the same as the nationality recorded at the point of arrest by
    Prison NOMIS.
  - Stock vs flow: prison population is a stock measure (people in
    custody on a single date); NINo flow is a one-year flow. They cannot
    be combined into a per-capita rate. The bridge presents both side
    by side, never as a ratio.
  - Adjectival to country mapping: MOJ uses adjectival forms (Pakistani,
    Eritrean, Polish). NINo uses country names (Pakistan, Eritrea,
    Poland). Mapping is deterministic and listed below.
"""
import json
from collections import defaultdict
from pathlib import Path

import pandas as pd

ROOT = Path(__file__).resolve().parents[2]
ODS = ROOT / "data/raw/moj_fno/prison-population-2025-12-31.ods"
NINO_CUBE = ROOT / "data/raw/supplementary/nino-statxplore-cube.json"
OUT = ROOT / "src/data/live/fno-bridge.json"

# MOJ adjective -> NINo country name. Only entries that are at all likely
# to appear in either dataset's top 30 are listed; unmapped MOJ rows fall
# through and are reported under their adjectival form.
ADJ_TO_COUNTRY = {
    "Albanian": "Albania",
    "Algerian": "Algeria",
    "Angolan": "Angola",
    "Afghan": "Afghanistan",
    "Bangladeshi": "Bangladesh",
    "Belarusian": "Belarus",
    "Brazilian": "Brazil",
    "British": "United Kingdom",
    "Bulgarian": "Bulgaria",
    "Burmese": "Myanmar",
    "Cameroonian": "Cameroon",
    "Chinese": "China",
    "Colombian": "Colombia",
    "Congolese (Congo, Democratic Republic)": "Congo (Democratic Republic)",
    "Croatian": "Croatia",
    "Cypriot": "Cyprus",
    "Czech": "Czech Republic",
    "Czechoslovakian": "Czech Republic",
    "Danish": "Denmark",
    "Dominican (Dominican Republic)": "Dominican Republic",
    "Dutch": "Netherlands",
    "Egyptian": "Egypt",
    "Eritrean": "Eritrea",
    "Estonian": "Estonia",
    "Ethiopian": "Ethiopia",
    "Filipino": "Philippines",
    "Finnish": "Finland",
    "French": "France",
    "Gambian": "The Gambia",
    "Georgian": "Georgia",
    "German": "Germany",
    "Ghanaian": "Ghana",
    "Greek": "Greece",
    "Hungarian": "Hungary",
    "Icelandic": "Iceland",
    "Indian": "India",
    "Indonesian": "Indonesia",
    "Iranian": "Iran",
    "Iraqi": "Iraq",
    "Irish": "Ireland",
    "Israeli": "Israel",
    "Italian": "Italy",
    "Jamaican": "Jamaica",
    "Japanese": "Japan",
    "Jordanian": "Jordan",
    "Kazakhstani": "Kazakhstan",
    "Kenyan": "Kenya",
    "Korean (North)": "Korea (North)",
    "Korean (South)": "Korea (South)",
    "Kuwaiti": "Kuwait",
    "Latvian": "Latvia",
    "Lebanese": "Lebanon",
    "Liberian": "Liberia",
    "Libyan": "Libya",
    "Lithuanian": "Lithuania",
    "Luxembourgish": "Luxembourg",
    "Malaysian": "Malaysia",
    "Maltese": "Malta",
    "Mauritian": "Mauritius",
    "Mexican": "Mexico",
    "Moldovan": "Moldova",
    "Mongolian": "Mongolia",
    "Moroccan": "Morocco",
    "Namibian": "Namibia",
    "Nepalese": "Nepal",
    "Nigerian": "Nigeria",
    "Norwegian": "Norway",
    "Pakistani": "Pakistan",
    "Palestinian": "Palestine",
    "Polish": "Poland",
    "Portuguese": "Portugal",
    "Romanian": "Romania",
    "Russian": "Russia",
    "Rwandan": "Rwanda",
    "Saudi": "Saudi Arabia",
    "Saudi Arabian": "Saudi Arabia",
    "Serbian": "Serbia",
    "Sierra Leonean": "Sierra Leone",
    "Singaporean": "Singapore",
    "Slovak": "Slovakia",
    "Slovakian": "Slovakia",
    "Slovenian": "Slovenia",
    "Somali": "Somalia",
    "South African": "South Africa",
    "Spanish": "Spain",
    "Sri Lankan": "Sri Lanka",
    "Sudanese": "Sudan",
    "Swedish": "Sweden",
    "Swiss": "Switzerland",
    "Syrian": "Syria",
    "Tajik": "Tajikistan",
    "Tanzanian": "Tanzania",
    "Thai": "Thailand",
    "Tunisian": "Tunisia",
    "Turkish": "Turkey",
    "Ugandan": "Uganda",
    "Ukrainian": "Ukraine",
    "American": "United States",
    "Uzbekistani": "Uzbekistan",
    "Venezuelan": "Venezuela",
    "Vietnamese": "Vietnam",
    "Yemeni": "Yemen",
    "Zambian": "Zambia",
    "Zimbabwean": "Zimbabwe",
}


def load_fno():
    df = pd.read_excel(ODS, engine="odf", sheet_name="Table_1_Q_12", header=None)
    # Header on row 4: Region | Nationality | Male and female | Male | Female
    rows = []
    for _, row in df.iloc[5:].iterrows():
        region = row.iloc[0]
        nat = row.iloc[1]
        total = row.iloc[2]
        if pd.isna(nat) or pd.isna(total):
            continue
        try:
            count = int(total)
        except (TypeError, ValueError):
            continue
        rows.append((str(region), str(nat).strip(), count))
    return rows


def aggregate_nino_uk_by_nationality():
    cube = json.loads(NINO_CUBE.read_text())
    fields = cube["fields"]
    # Field order from script: [LA, Nationality, Quarter]
    nat_field = fields[1]
    qtr_field = fields[2]
    n_qtr = len(qtr_field["items"])
    recent4 = list(range(n_qtr - 4, n_qtr))
    values = cube["cubes"][list(cube["cubes"].keys())[0]]["values"]
    n_la = len(values)
    n_nat = len(nat_field["items"])

    totals = defaultdict(int)
    for li in range(n_la):
        for ni in range(n_nat):
            cell = values[li][ni]
            for qi in recent4:
                v = cell[qi] if qi < len(cell) else 0
                if v:
                    totals[nat_field["items"][ni]["labels"][0]] += int(v)
    return totals


def main():
    fno_rows = load_fno()
    nino_totals = aggregate_nino_uk_by_nationality()

    # Build country -> FNO count. Track three buckets:
    #   British, foreign-mapped, foreign-unmapped, not-recorded.
    fno_by_country = defaultdict(int)
    fno_total_uk = 0
    fno_total_not_recorded = 0
    fno_total_foreign_unmapped = 0
    fno_unmapped = []
    for region, adj, count in fno_rows:
        if adj == "Nationality not recorded":
            fno_total_not_recorded += count
            continue
        if adj == "British":
            fno_total_uk += count
            continue
        country = ADJ_TO_COUNTRY.get(adj)
        if country:
            fno_by_country[country] += count
        else:
            fno_unmapped.append((region, adj, count))
            fno_total_foreign_unmapped += count

    fno_total_foreign_mapped = sum(fno_by_country.values())
    fno_total_foreign = fno_total_foreign_mapped + fno_total_foreign_unmapped
    fno_total_all = fno_total_uk + fno_total_foreign + fno_total_not_recorded

    # Top-20 FNO countries (mapped only — fno_by_country never holds UK)
    top_fno = sorted(fno_by_country.items(), key=lambda x: -x[1])[:20]

    # Top-20 NINo arriving nationalities UK-wide
    top_nino = sorted(nino_totals.items(), key=lambda x: -x[1])[:20]

    # Bridge table: top-N union of both lists
    union_countries = set(c for c, _ in top_fno) | set(c for c, _ in top_nino[:15])
    bridge = []
    for country in union_countries:
        bridge.append({
            "country": country,
            "ninoFlowRollingYear_UK": nino_totals.get(country, 0),
            "fnoPrisonPopulation_EnglandAndWales_31Dec2025": fno_by_country.get(country, 0),
        })
    bridge.sort(key=lambda r: -r["fnoPrisonPopulation_EnglandAndWales_31Dec2025"])

    out = {
        "source": "Ministry of Justice, Offender Management Statistics Quarterly (July to September 2025), Table 1.Q.12 (snapshot 31 Dec 2025) + DWP Stat-Xplore NINo registrations (rolling year ending Q4 2025)",
        "lastUpdated": "2026-04-28",
        "caveat": (
            "Stock vs flow, never combined into a ratio: prison population "
            "is a snapshot on 31 December 2025; NINo flow is one rolling "
            "year of new registrations. Geographic scope differs: FNO is "
            "England and Wales only, NINo is UK-wide. Concept differs: "
            "MOJ records nationality of the prisoner; NINo records "
            "nationality self-declared at registration. Both numbers tell "
            "you nothing about whether overseas arrivals commit crime at "
            "any particular rate, because we have no per-individual link "
            "between the two datasets and no shared denominator. The "
            "bridge is offered to surface composition only."
        ),
        "totals": {
            "fno_prisonPopulation_total": fno_total_all,
            "fno_prisonPopulation_British": fno_total_uk,
            "fno_prisonPopulation_foreignNational": fno_total_foreign,
            "fno_prisonPopulation_foreignNational_mapped": fno_total_foreign_mapped,
            "fno_prisonPopulation_foreignNational_unmapped": fno_total_foreign_unmapped,
            "fno_prisonPopulation_nationalityNotRecorded": fno_total_not_recorded,
            "fno_foreignSharePct": (
                round(fno_total_foreign / fno_total_all * 100, 1)
                if fno_total_all else None
            ),
            "nino_uk_rollingYearTotal": sum(nino_totals.values()),
        },
        "topFnoForeignCountries": [
            {"country": c, "prisonPopulation": n} for c, n in top_fno
        ],
        "topNinoArrivingCountries": [
            {"country": c, "ninoFlow": n} for c, n in top_nino
        ],
        "bridge": bridge,
        "fnoUnmappedAdjectives": [
            {"region": r, "adjective": a, "count": c} for r, a, c in fno_unmapped
        ],
    }
    OUT.write_text(json.dumps(out, indent=2))
    print(f"Wrote {OUT}")
    print(f"\nFNO total prison population (E&W, 31 Dec 2025): {out['totals']['fno_prisonPopulation_total']:,}")
    print(f"  British:                {fno_total_uk:,}")
    print(f"  Foreign nationals:      {fno_total_foreign:,}  ({out['totals']['fno_foreignSharePct']}%)")
    print(f"  Nationality not recorded: {fno_total_not_recorded:,}")
    print(f"\nUK NINo rolling year total: {out['totals']['nino_uk_rollingYearTotal']:,}")
    print(f"\nTop 10 FNO countries (E&W prison population):")
    for c, n in top_fno[:10]:
        print(f"  {c:30s} {n:>6,}")
    print(f"\nTop 10 NINo arriving countries (UK rolling year 2025):")
    for c, n in top_nino[:10]:
        print(f"  {c:30s} {n:>7,}")
    print(f"\nUnmapped MOJ adjectival rows ({len(fno_unmapped)}):")
    for r, a, c in fno_unmapped[:10]:
        print(f"  {r:20s} {a:30s} {c}")


if __name__ == "__main__":
    main()
