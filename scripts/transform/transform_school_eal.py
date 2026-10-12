#!/usr/bin/env python3
"""
DfE Schools, Pupils and their Characteristics: pupils by first language, per
upper-tier local authority, every academic year in the newest release on disk.

The DfE schools census reports at upper-tier (UTLA) level only: counties
own schools, not districts. So Burnley, Pendle and the other Lancashire
districts share the Lancashire CC schools figure. Unitaries (E06, E08,
E09 codes) report at their own level.

The transform produces per-LA records keyed by *district* code where
applicable, with the UTLA's figure attached and a clear `dataLevel`
field showing whether the figure is the LA's own or its parent county's.

Inputs:
  data/raw/dfe_schools/spc_pupils_ethnicity_and_language_<yyyy-yy>.csv, newest
  release, resolved by stem (scripts/fetch/fetch-dfe-pupil-characteristics.mjs
  downloads it under that name). The unsuffixed spc_pupils_ethnicity_and_language.csv
  is the model's calibration input (validate_schools.mjs) and is not read here.
  data/raw/manifests/dfe_pupil_characteristics.json (release title and dates, matched
  to the file by sha256)

Output:
  src/data/live/school-eal.json

Each area record has:
  areaName, dataLevel ('own' or 'parent_county'), parentCountyCode,
  parentCountyName, latestYear, totalPupils, eal_pct, english_pct,
  unclassified_pct, eal_count, timeSeries (every year in the file)

The academic year comes from the file's time_period column; the release title and
dates from the fetch manifest. Columns are read by header name and a missing one stops
the run.

Caveats:
  - Pupils with English as Additional Language ('Known or believed to be
    other than English') is a household-level signal, not an arrival
    measure. A child whose parents speak Urdu at home counts as EAL even
    if the child was born in the UK.
  - District-level pupils are reported via parent-county aggregation.
    A district within a high-EAL or low-EAL county will inherit the
    county figure; intra-county variation is not captured by this data.
"""
import json
import sys
from collections import defaultdict
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "lib"))
import dfe_csv  # noqa: E402

ROOT = Path(__file__).resolve().parents[2]
RAW_DIR = ROOT / "data/raw/dfe_schools"
MANIFEST = ROOT / "data/raw/manifests/dfe_pupil_characteristics.json"
OUT = ROOT / "src/data/live/school-eal.json"
REQUIRED = ["time_period", "geographic_level", "new_la_code", "la_name", "phase_type_grouping",
            "ethnicity_minor", "language", "headcount", "percent_of_pupils"]
EAL = "Known or believed to be other than English"
ENGLISH = "Known or believed to be English"
UNCLASSIFIED = "Language unclassified"

# District -> Upper-tier county mapping (E07 -> E10) for England's two-tier
# counties as at December 2024. Unitary codes (E06, E08, E09) and county
# codes (E10) pass through unchanged. Source: ONS Open Geography Portal,
# Local Authority District to County (December 2024) Lookup.
DISTRICT_TO_COUNTY = {
    # Cambridgeshire
    "E07000008": "E10000003", "E07000009": "E10000003", "E07000010": "E10000003",
    "E07000011": "E10000003", "E07000012": "E10000003",
    # Derbyshire
    "E07000032": "E10000007", "E07000033": "E10000007", "E07000034": "E10000007",
    "E07000035": "E10000007", "E07000036": "E10000007", "E07000037": "E10000007",
    "E07000038": "E10000007", "E07000039": "E10000007",
    # Devon
    "E07000040": "E10000008", "E07000041": "E10000008", "E07000042": "E10000008",
    "E07000043": "E10000008", "E07000044": "E10000008", "E07000045": "E10000008",
    "E07000046": "E10000008", "E07000047": "E10000008",
    # East Sussex
    "E07000061": "E10000011", "E07000062": "E10000011", "E07000063": "E10000011",
    "E07000064": "E10000011", "E07000065": "E10000011",
    # Essex
    "E07000066": "E10000012", "E07000067": "E10000012", "E07000068": "E10000012",
    "E07000069": "E10000012", "E07000070": "E10000012", "E07000071": "E10000012",
    "E07000072": "E10000012", "E07000073": "E10000012", "E07000074": "E10000012",
    "E07000075": "E10000012", "E07000076": "E10000012", "E07000077": "E10000012",
    # Gloucestershire
    "E07000078": "E10000013", "E07000079": "E10000013", "E07000080": "E10000013",
    "E07000081": "E10000013", "E07000082": "E10000013", "E07000083": "E10000013",
    # Hampshire
    "E07000084": "E10000014", "E07000085": "E10000014", "E07000086": "E10000014",
    "E07000087": "E10000014", "E07000088": "E10000014", "E07000089": "E10000014",
    "E07000090": "E10000014", "E07000091": "E10000014", "E07000092": "E10000014",
    "E07000093": "E10000014", "E07000094": "E10000014",
    # Hertfordshire
    "E07000095": "E10000015", "E07000096": "E10000015", "E07000098": "E10000015",
    "E07000099": "E10000015", "E07000102": "E10000015", "E07000103": "E10000015",
    "E07000241": "E10000015", "E07000243": "E10000015",
    # Kent
    "E07000105": "E10000016", "E07000106": "E10000016", "E07000107": "E10000016",
    "E07000108": "E10000016", "E07000109": "E10000016", "E07000110": "E10000016",
    "E07000111": "E10000016", "E07000112": "E10000016", "E07000113": "E10000016",
    "E07000114": "E10000016", "E07000115": "E10000016", "E07000116": "E10000016",
    # Lancashire
    "E07000117": "E10000017", "E07000118": "E10000017", "E07000119": "E10000017",
    "E07000120": "E10000017", "E07000121": "E10000017", "E07000122": "E10000017",
    "E07000123": "E10000017", "E07000124": "E10000017", "E07000125": "E10000017",
    "E07000126": "E10000017", "E07000127": "E10000017", "E07000128": "E10000017",
    # Leicestershire
    "E07000129": "E10000018", "E07000130": "E10000018", "E07000131": "E10000018",
    "E07000132": "E10000018", "E07000133": "E10000018", "E07000134": "E10000018",
    "E07000135": "E10000018",
    # Lincolnshire
    "E07000136": "E10000019", "E07000137": "E10000019", "E07000138": "E10000019",
    "E07000139": "E10000019", "E07000140": "E10000019", "E07000141": "E10000019",
    "E07000142": "E10000019",
    # Norfolk
    "E07000143": "E10000020", "E07000144": "E10000020", "E07000145": "E10000020",
    "E07000146": "E10000020", "E07000147": "E10000020", "E07000148": "E10000020",
    "E07000149": "E10000020",
    # Nottinghamshire
    "E07000170": "E10000024", "E07000171": "E10000024", "E07000172": "E10000024",
    "E07000173": "E10000024", "E07000174": "E10000024", "E07000175": "E10000024",
    "E07000176": "E10000024",
    # Oxfordshire
    "E07000177": "E10000025", "E07000178": "E10000025", "E07000179": "E10000025",
    "E07000180": "E10000025", "E07000181": "E10000025",
    # Staffordshire
    "E07000192": "E10000028", "E07000193": "E10000028", "E07000194": "E10000028",
    "E07000195": "E10000028", "E07000196": "E10000028", "E07000197": "E10000028",
    "E07000198": "E10000028", "E07000199": "E10000028",
    # Suffolk
    "E07000200": "E10000029", "E07000202": "E10000029", "E07000203": "E10000029",
    "E07000244": "E10000029", "E07000245": "E10000029",
    # Surrey
    "E07000207": "E10000030", "E07000208": "E10000030", "E07000209": "E10000030",
    "E07000210": "E10000030", "E07000211": "E10000030", "E07000212": "E10000030",
    "E07000213": "E10000030", "E07000214": "E10000030", "E07000215": "E10000030",
    "E07000216": "E10000030", "E07000217": "E10000030",
    # Warwickshire
    "E07000218": "E10000031", "E07000219": "E10000031", "E07000220": "E10000031",
    "E07000221": "E10000031", "E07000222": "E10000031",
    # West Sussex
    "E07000223": "E10000032", "E07000224": "E10000032", "E07000225": "E10000032",
    "E07000226": "E10000032", "E07000227": "E10000032", "E07000228": "E10000032",
    "E07000229": "E10000032",
    # Worcestershire
    "E07000234": "E10000034", "E07000235": "E10000034", "E07000236": "E10000034",
    "E07000237": "E10000034", "E07000238": "E10000034", "E07000239": "E10000034",
}


parse_period = dfe_csv.academic_year


def main():
    src = dfe_csv.resolve(RAW_DIR, dfe_csv.ETHNICITY_LANGUAGE)
    release = dfe_csv.release_for(src, MANIFEST)

    # utla_data[utla_code][period][language] = (headcount, pct)
    utla_data = defaultdict(lambda: defaultdict(dict))
    utla_name = {}
    languages = set()

    aliases = dfe_csv.area_code_aliases(ROOT)
    fh, reader = dfe_csv.open_reader(src, REQUIRED)
    with fh:
        for row in reader:
            if row.get("geographic_level") != "Local authority":
                continue
            if row.get("phase_type_grouping") != "Total":
                continue
            if row.get("ethnicity_minor") != "Total":
                continue
            code = row.get("new_la_code")
            if not code:
                continue
            code = aliases.get(code, code)
            period = row["time_period"]
            lang = row["language"]
            try:
                headcount = int(row["headcount"])
                pct = float(row["percent_of_pupils"])
            except (TypeError, ValueError):
                continue
            utla_data[code][period][lang] = (headcount, pct)
            utla_name[code] = row.get("la_name", code)
            languages.add(lang)

    for label in (EAL, ENGLISH, UNCLASSIFIED, "Total"):
        if label not in languages:
            raise RuntimeError(f"{src.name}: no rows for language '{label}'")
    if not utla_data:
        raise RuntimeError(f"{src.name}: no local authority totals read")

    # Build per-UTLA latest-year summary + time series
    utla_summary = {}
    for code, periods in utla_data.items():
        if not periods:
            continue
        sorted_periods = sorted(periods.keys())
        latest = sorted_periods[-1]
        latest_data = periods[latest]
        eal = latest_data.get("Known or believed to be other than English", (0, 0))
        eng = latest_data.get("Known or believed to be English", (0, 0))
        unc = latest_data.get("Language unclassified", (0, 0))
        total = latest_data.get("Total", (0, 0))
        time_series = {}
        for p in sorted_periods:
            d = periods[p]
            time_series[parse_period(p)] = {
                "totalPupils": d.get("Total", (0, 0))[0],
                "ealCount": d.get("Known or believed to be other than English", (0, 0))[0],
                "ealPct": round(d.get("Known or believed to be other than English", (0, 0))[1], 2),
                "englishPct": round(d.get("Known or believed to be English", (0, 0))[1], 2),
            }
        eal_5y = None
        if len(sorted_periods) >= 5:
            first_pct = periods[sorted_periods[-5]].get("Known or believed to be other than English", (0, 0))[1]
            eal_5y = round(eal[1] - first_pct, 2)
        utla_summary[code] = {
            "areaName": utla_name[code],
            "latestYear": parse_period(latest),
            "totalPupils": total[0],
            "ealCount": eal[0],
            "ealPct": round(eal[1], 2),
            "englishPct": round(eng[1], 2),
            "unclassifiedPct": round(unc[1], 2),
            "ealChangePp_5y": eal_5y,
            "timeSeries": time_series,
        }

    # Now produce per-area output: every UTLA gets its own record; every
    # E07 district inherits its parent county's record with the dataLevel
    # flag set to 'parent_county'.
    areas = {}
    for utla_code, summary in utla_summary.items():
        areas[utla_code] = {**summary, "dataLevel": "own", "parentCountyCode": None, "parentCountyName": None}

    for district_code, county_code in DISTRICT_TO_COUNTY.items():
        if county_code in utla_summary:
            cs = utla_summary[county_code]
            areas[district_code] = {
                **cs,
                "dataLevel": "parent_county",
                "parentCountyCode": county_code,
                "parentCountyName": cs["areaName"],
                "districtCode": district_code,
            }

    # Top 10 highest-EAL UTLAs
    top_eal = sorted(
        utla_summary.items(),
        key=lambda kv: -kv[1]["ealPct"],
    )[:10]

    periods = sorted({p for d in utla_data.values() for p in d})
    first_year, latest_year = parse_period(periods[0]), parse_period(periods[-1])
    if latest_year != release.get("yearTitle"):
        raise RuntimeError(f"{src.name} runs to {latest_year}, the manifest's release is {release.get('yearTitle')}")
    revisions = compare_with_previous(utla_summary)

    out = {
        "source": (
            f"{release['publisher']}, {release['publication']}, academic year {latest_year} "
            f"(published {dfe_csv.long_date(release['published'])}, last updated "
            f"{dfe_csv.long_date(release['lastUpdated'])}). Data set: "
            f"Pupil characteristics, number of pupils by ethnicity and language, {first_year} to "
            f"{latest_year}, local authority rows, all school types."
        ),
        "sourceUrl": release["page"],
        "sourceFile": src.name,
        "academicYear": latest_year,
        "lastUpdated": release["lastUpdated"],
        "caveat": (
            "Pupils whose first language is 'Known or believed to be other "
            "than English' captures children for whom the home language is "
            "not English. It is a household-level signal, not a measure of "
            "new arrivals: a child born in the UK whose parents speak a "
            "non-English language at home is counted as EAL. The DfE "
            "publishes this at upper-tier local authority level only: "
            "Lancashire, Kent and other two-tier counties report a single "
            "figure covering all their districts. For districts in this "
            "data file the dataLevel field is 'parent_county' and the "
            "figure is the county aggregate, not an intra-county figure."
        ),
        "totalUpperTierLAs": len(utla_summary),
        "totalAreasIncludingDistricts": len(areas),
        "topEalUTLAs": [
            {"code": c, "name": s["areaName"], "ealPct": s["ealPct"], "totalPupils": s["totalPupils"]}
            for c, s in top_eal
        ],
        "areas": areas,
    }
    OUT.write_text(json.dumps(out, indent=2, ensure_ascii=False) + "\n")
    print(f"Read {src.name} ({first_year} to {latest_year}); release {release['title']}, updated {release['lastUpdated']}")
    print(f"Upper-tier LAs: {len(utla_summary)}; areas including districts: {len(areas)}")
    if revisions is None:
        print("No earlier output to check against")
    else:
        print(f"Checked against the output it replaces: {len(revisions)} revised value(s) in overlapping years")
        for r in revisions[:20]:
            print(f"  {r}")
    print(f"Wrote {OUT}")


def compare_with_previous(utla_summary):
    """Revisions to earlier years' figures against the file being replaced, or None."""
    if not OUT.exists():
        return None
    previous = json.loads(OUT.read_text()).get("areas", {})
    revisions = []
    for code, summary in utla_summary.items():
        old = previous.get(code)
        if not old or old.get("dataLevel") != "own":
            continue
        for year, new_vals in summary["timeSeries"].items():
            old_vals = old.get("timeSeries", {}).get(year)
            if not old_vals:
                continue
            for key in ("totalPupils", "ealCount"):
                if old_vals.get(key) != new_vals.get(key):
                    revisions.append((code, year, key, old_vals.get(key), new_vals.get(key)))
    return revisions

if __name__ == "__main__":
    main()
