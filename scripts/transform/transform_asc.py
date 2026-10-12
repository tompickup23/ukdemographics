#!/usr/bin/env python3
"""
DHSC adult social care finance and activity data tables -> src/data/live/asc-dashboard.json.

Reads the files named as current in data/raw/manifests/dhsc_asc_finance.json and
dhsc_asc_activity.json, as fetched by scripts/fetch/fetch-dhsc-asc.mjs, after checking
each file's SHA-256 against its manifest. The two series are published separately and on
different dates, so each measure carries its own period, edition and table.

Tables read, each found by its title text (never its number or sheet name) and its
columns by header text:

  Finance report
    "Gross current expenditure, by care type, <period>": the Total column, in GBP
      thousands, for each council with adult social services responsibilities (CASSR)
      and for England.
    "Gross current expenditure per 100,000 adults, year on year comparison, <period>":
      DHSC's own adult population (ONS mid-2024), read only to check the population join.
  Activity report
    "Number of clients accessing long term support during the year, by age band and
      support setting, <period>": the "65 and over - Residential" column.
    "Number of clients accessing long term support during the year per 100,000 adults,
      by age band, <period>": DHSC's own 65 and over population, read only as a check.

What the figures count:
  grossSpendPerCapita: gross current expenditure on adult social care by the council in
    the financial year, in GBP, divided by the ONS mid-2025 resident population aged 18
    and over. It is spend per adult resident, not per person receiving care.
  residentialRatePer10k65: people aged 65 and over who received long term support in a
    residential (not nursing) setting at any point in the financial year, per 10,000
    residents aged 65 and over in the ONS mid-2025 estimates.

Population: src/data/live/population-estimates.json (ONS mid-2025, on 2023 local authority
boundaries). Unitaries, metropolitan districts and London boroughs are read directly. A
county's population is the sum of its districts, using src/data/lookups/district-to-utla.json;
that sum equals the county rows in the ONS workbook. The 18 and over band is the 18-64 band
plus the 65+ band.

Upper tier only: district (E07) place pages show their county's figures, labelled as the
county's, through src/lib/area-hierarchy.ts. Nothing here is apportioned to districts.

    python3 scripts/transform/transform_asc.py
"""
from __future__ import annotations

import hashlib
import json
import math
import re
import sys
from pathlib import Path

import pandas as pd

ROOT = Path(__file__).resolve().parents[2]
RAW_DIR = ROOT / "data/raw/dhsc_asc"
MANIFESTS = {
    "finance": ROOT / "data/raw/manifests/dhsc_asc_finance.json",
    "activity": ROOT / "data/raw/manifests/dhsc_asc_activity.json",
}
POPULATION = ROOT / "src/data/live/population-estimates.json"
AREAS = ROOT / "src/data/live/ethnic-projections.json"
LOOKUP = ROOT / "src/data/lookups/district-to-utla.json"
OUT = ROOT / "src/data/live/asc-dashboard.json"

CASSR_CODE = re.compile(r"^E(06|08|09|10)\d{6}$")
ENGLAND = "E92000001"
PERIOD = r"(\d{4}) to (\d{4})|(\d{4})-(\d{2})"

# Agreement thresholds for the checks that stop the transform. Each compares two
# published sources, never a pinned figure.
SUM_TOLERANCE = 0.5            # GBP thousands per CASSR: England total vs sum of CASSRs, allowing rounding
POP_TOLERANCE = 0.10           # ONS mid-2025 vs the ONS mid-2024 population DHSC used
CORRECTION_PENDING = re.compile(
    r"planned corrections?|corrections? (?:are|is) planned|corrected figures will be published|"
    r"updated figures will be published",
    re.I,
)


def fail(msg: str):
    raise SystemExit(f"transform_asc: {msg}")


def period_label(text: str) -> str:
    """'2024 to 2025' or '2024-25' -> '2024-25'. Fails on anything else."""
    m = re.search(PERIOD, text)
    if not m:
        fail(f"no financial year in {text!r}")
    if m.group(1):
        start, end = int(m.group(1)), int(m.group(2))
    else:
        start, end = int(m.group(3)), 2000 + int(m.group(4))
    if end != start + 1:
        fail(f"{text!r} is not a single financial year")
    return f"{start}-{str(end)[2:]}"


def long_period(label: str) -> str:
    """'2024-25' -> '2024 to 2025', the form the finance report uses in its headers."""
    start = int(label[:4])
    return f"{start} to {start + 1}"


def load_current(kind: str) -> tuple[dict, dict, Path]:
    manifest = json.loads(MANIFESTS[kind].read_text())
    current = manifest.get("current") or fail(f"{MANIFESTS[kind].name} names no current file")
    path = RAW_DIR / current["fileName"]
    if not path.exists():
        fail(f"{path} is missing; run node scripts/fetch/fetch-dhsc-asc.mjs")
    digest = hashlib.sha256(path.read_bytes()).hexdigest()
    if digest != current["fileSha256"]:
        fail(f"{path.name} hashes to {digest}, manifest says {current['fileSha256']}")
    attempt = next(a for a in reversed(manifest["attempts"]) if a.get("blob_sha256") == digest)
    return manifest, attempt, path


def find_table(book: dict, subject: str):
    """The one sheet whose title is 'Table <n>: <subject>, <period>'. Fails on none or several."""
    pattern = re.compile(rf"^Table \d+:\s*{subject},\s*(?:{PERIOD})\s*$", re.I)
    hits = [(name, df) for name, df in book.items() if len(df) and pattern.match(str(df.iat[0, 0]).strip())]
    if len(hits) != 1:
        fail(f"expected one table titled '{subject}, <period>', found {[h[0] for h in hits]}")
    return hits[0][1], str(hits[0][1].iat[0, 0]).strip()


def header_map(df, required: dict[str, str]):
    """Locate the header row and map each key to a column by exact header text (case-insensitive)."""
    for i in range(min(len(df), 30)):
        cells = [re.sub(r"\s+", " ", str(v)).strip().lower() for v in df.iloc[i].tolist()]
        found = {}
        for key, text in required.items():
            cols = [j for j, c in enumerate(cells) if c == text.lower()]
            if len(cols) == 1:
                found[key] = cols[0]
        if len(found) == len(required):
            return i, found
    fail(f"no header row carries all of {list(required.values())} in table {str(df.iat[0, 0])[:80]!r}")


def cell(v):
    """A number, or None with the publisher's marker: [c] under 5, [x] not submitted, [z] n/a."""
    if isinstance(v, str):
        s = v.strip()
        if s in {"[c]", "[x]", "[z]"}:
            return None, s
        try:
            return float(s.replace(",", "")), None
        except ValueError:
            fail(f"unreadable cell {v!r}")
    if v is None or (isinstance(v, float) and math.isnan(v)):
        return None, "blank"
    return float(v), None


def rows(df, header_row: int, cols: dict, code_col: int, region_col: int):
    """Yield (code, values) for CASSR rows and ('ENGLAND', values) for the England row."""
    for i in range(header_row + 1, len(df)):
        code = str(df.iat[i, code_col]).strip()
        region = str(df.iat[i, region_col]).strip()
        if CASSR_CODE.match(code):
            yield code, {k: df.iat[i, c] for k, c in cols.items()}
        elif region == ENGLAND and code in {"nan", ""}:
            yield "ENGLAND", {k: df.iat[i, c] for k, c in cols.items()}


def cover_lines(book: dict) -> list[str]:
    cover = book.get("Cover")
    if cover is None:
        fail("workbook has no Cover sheet")
    return [str(v).strip() for v in cover.iloc[:, 0].tolist() if str(v).strip() not in {"", "nan"}]


def first_sentence(text: str) -> str:
    return text.split(". ")[0].rstrip(".") + "." if text else ""


def source_line(df) -> str:
    for i in range(min(len(df), 10)):
        text = str(df.iat[i, 0]).strip()
        if text.lower().startswith("source:"):
            return text
    return ""


def populations():
    """18 and over and 65 and over populations by CASSR code, ONS mid-2025, counties summed."""
    pe = json.loads(POPULATION.read_text())
    lookup = json.loads(LOOKUP.read_text())["districts"]
    areas = pe["areas"]

    def bands(entry):
        b = entry["ageBands"]
        return b["18-64"] + b["65+"], b["65+"]

    pop = {code: bands(a) for code, a in areas.items() if not code.startswith(("E07", "W"))}
    counties: dict[str, list[str]] = {}
    for district, entry in lookup.items():
        counties.setdefault(entry["countyCode"], []).append(district)
    for county, districts in counties.items():
        missing = [d for d in districts if d not in areas]
        if missing:
            fail(f"population-estimates.json lacks districts {missing} of {county}")
        pop[county] = tuple(sum(bands(areas[d])[k] for d in districts) for k in (0, 1))
    england = next((c for c in pe.get("countries", {}).values() if str(c.get("name", "")).upper() == "ENGLAND"), None)
    if england:
        pop["ENGLAND"] = bands(england)
    src = pe["source"]
    label = f"{src['publisher']}, {src['title']}, tables {src['tables']}. {src['published']}"
    return pop, label, src


def main() -> None:
    fin_manifest, fin_attempt, fin_path = load_current("finance")
    act_manifest, act_attempt, act_path = load_current("activity")
    fin = pd.read_excel(fin_path, sheet_name=None, header=None, engine="odf")
    act = pd.read_excel(act_path, sheet_name=None, header=None, engine="odf")

    # Finance: gross current expenditure by CASSR.
    t14, t14_title = find_table(fin, "Gross current expenditure, by care type")
    fin_period = period_label(t14_title.split(",")[-1])
    fin_cover = cover_lines(fin)
    if period_label(fin_cover[0]) != fin_period:
        fail(f"finance cover {fin_cover[0]!r} and table period {fin_period} disagree")
    h, c = header_map(t14, {"code": "Geography code", "name": "LA name", "region": "Region code", "total": "Total"})
    gce, fin_names = {}, {}
    for code, v in rows(t14, h, c, c["code"], c["region"]):
        value, marker = cell(v["total"])
        if value is None:
            fail(f"Table 14 total for {code} is {marker}")
        gce[code] = value
        if code != "ENGLAND":
            fin_names[code] = str(v["name"]).strip()
    if "ENGLAND" not in gce:
        fail("no England row in the gross current expenditure table")

    t16, t16_title = find_table(fin, "Gross current expenditure per 100,000 adults, year on year comparison")
    lp = long_period(fin_period)
    h, c = header_map(t16, {"code": "Geography code", "region": "Region code", "pop": f"Population 18+: {lp}"})
    dhsc_pop18 = {code: cell(v["pop"])[0] for code, v in rows(t16, h, c, c["code"], c["region"])}
    t16_source = source_line(t16)

    # Activity: clients aged 65 and over in residential long term support during the year.
    t34, t34_title = find_table(
        act, "Number of clients accessing long term support during the year, by age band and support setting"
    )
    act_period = period_label(t34_title.split(",")[-1])
    act_cover = cover_lines(act)
    h, c = header_map(t34, {"code": "Geography code", "region": "Region code", "res65": "65 and over - Residential"})
    res65, res65_marker = {}, {}
    for code, v in rows(t34, h, c, c["code"], c["region"]):
        res65[code], res65_marker[code] = cell(v["res65"])

    t36, t36_title = find_table(
        act, "Number of clients accessing long term support during the year per 100,000 adults, by age band"
    )
    h, c = header_map(t36, {"code": "Geography code", "region": "Region code", "pop65": "65 and over - Population"})
    dhsc_pop65 = {code: cell(v["pop65"])[0] for code, v in rows(t36, h, c, c["code"], c["region"])}
    act_notes = act.get("Notes")
    dhsc_pop_note = ""
    if act_notes is not None:
        for text in act_notes.iloc[:, 1].astype(str).tolist():
            if text.lower().startswith("population data comes from"):
                dhsc_pop_note = text.strip()

    # Codes: every CASSR must be a place the site knows, or a county in the district lookup.
    ep = json.loads(AREAS.read_text())["areas"]
    lookup = json.loads(LOOKUP.read_text())["districts"]
    county_names = {e["countyCode"]: e["countyName"] for e in lookup.values()}
    cassrs = sorted(k for k in gce if k != "ENGLAND")
    unknown = [k for k in cassrs if k not in ep and k not in county_names]
    if unknown:
        fail(f"CASSR codes not on the site or in the county lookup: {unknown}")
    if set(res65) - {"ENGLAND"} != set(cassrs):
        fail(f"finance and activity list different CASSRs: {sorted(set(res65) ^ set(gce))}")

    # Check 1: the England total equals the sum of CASSRs (finance is unrounded).
    total = sum(gce[k] for k in cassrs)
    if abs(total - gce["ENGLAND"]) > SUM_TOLERANCE * len(cassrs):
        fail(f"sum of CASSR spend {total:.0f} vs England {gce['ENGLAND']:.0f}")

    pop, pop_label, pop_src = populations()

    # Check 2: the mid-2025 populations joined here agree with the mid-2024 ones DHSC used.
    for k in cassrs:
        if k not in pop:
            fail(f"no mid-2025 population for {k}")
        for ours, theirs, band in ((pop[k][0], dhsc_pop18.get(k), "18+"), (pop[k][1], dhsc_pop65.get(k), "65+")):
            if theirs and abs(ours / theirs - 1) > POP_TOLERANCE:
                fail(f"{k} {band} population {ours} vs DHSC {theirs}: the join is wrong")

    areas = {}
    for k in cassrs:
        p18, p65 = pop[k]
        spend = gce[k] * 1000 / p18
        rate = res65[k] / p65 * 10000 if res65[k] is not None else None
        same = fin_period == act_period
        areas[k] = {
            "areaName": (ep.get(k) or {}).get("areaName") or county_names.get(k) or fin_names[k],
            "grossSpendPerCapita": round(spend),
            "residentialRatePer10k65": round(rate) if rate is not None else None,
            "qualityOfLifeScore": None,
            "dtocDaysAnnual": None,
            "period": fin_period if same else f"finance {fin_period}, activity {act_period}",
            "grossSpendPeriod": fin_period,
            "residentialPeriod": act_period,
            "grossCurrentExpenditureThousands": round(gce[k], 3),
            "residentialClients65": None if res65[k] is None else int(res65[k]),
            **({"residentialClients65Marker": res65_marker[k]} if res65[k] is None else {}),
            "population18Plus": p18,
            "population65Plus": p65,
            "dhscPopulation18Plus": None if dhsc_pop18.get(k) is None else int(dhsc_pop18[k]),
            "dhscPopulation65Plus": None if dhsc_pop65.get(k) is None else int(dhsc_pop65[k]),
        }

    england = {
        "grossCurrentExpenditureThousands": round(gce["ENGLAND"], 3),
        "residentialClients65": None if res65.get("ENGLAND") is None else int(res65["ENGLAND"]),
        "population18Plus": pop.get("ENGLAND", (None, None))[0],
        "population65Plus": pop.get("ENGLAND", (None, None))[1],
        "dhscPopulation18Plus": None if dhsc_pop18.get("ENGLAND") is None else int(dhsc_pop18["ENGLAND"]),
        "dhscPopulation65Plus": None if dhsc_pop65.get("ENGLAND") is None else int(dhsc_pop65["ENGLAND"]),
    }
    if england["population18Plus"]:
        england["grossSpendPerCapita"] = round(gce["ENGLAND"] * 1000 / england["population18Plus"])
    if england["population65Plus"] and england["residentialClients65"] is not None:
        england["residentialRatePer10k65"] = round(england["residentialClients65"] / england["population65Plus"] * 10000)

    def change_notes(attempt):
        notes = sorted(attempt.get("change_notes") or [], key=lambda n: n["public_timestamp"], reverse=True)
        return notes[0] if notes else None

    act_latest = change_notes(act_attempt)
    revision_notice = None
    if act_latest and CORRECTION_PENDING.search(act_latest["note"]):
        revision_notice = {"note": act_latest["note"], "date": act_latest["public_timestamp"][:10]}

    fin_edition = fin_cover[0]
    act_edition = f"{act_attempt['edition']}"
    measures = {
        "grossSpendPerCapita": {
            "label": "Gross current expenditure per adult",
            "counts": (
                "Gross current expenditure on adult social care by the council in the financial year, in pounds, "
                "divided by residents aged 18 and over. Spend per adult resident, not per person receiving care."
            ),
            "period": fin_period,
            "numerator": f"{t14_title}: Total column (values in GBP thousands)",
            "denominator": f"Residents aged 18 and over, {pop_src['title']}",
            "edition": fin_edition,
            "published": next((l for l in fin_cover if l.lower().startswith("publication date")), ""),
            "status": first_sentence(next((l for l in fin_cover if "classed as" in l.lower()), "")),
            "publisher": fin_manifest["publisher"],
            "landingPage": fin_attempt.get("landing_page"),
            "fileName": fin_path.name,
            "fileSha256": fin_attempt["blob_sha256"],
            "pageUpdated": (fin_attempt.get("edition_updated_at") or "")[:10],
            "check": f"{t16_title}; {t16_source}",
        },
        "residentialRatePer10k65": {
            "label": "Residents aged 65 and over in residential care, per 10,000 aged 65 and over",
            "counts": (
                "People aged 65 and over who received long term support in a residential (not nursing) setting at "
                "any point in the financial year, per 10,000 residents aged 65 and over. Counts are rounded to the "
                "nearest 5 by DHSC."
            ),
            "period": act_period,
            "numerator": f"{t34_title}: residential setting, aged 65 and over",
            "denominator": f"Residents aged 65 and over, {pop_src['title']}",
            "edition": act_edition,
            "published": next((l for l in act_cover if l.lower().startswith("published")), ""),
            "status": first_sentence(next((l for l in act_cover if "official statistics" in l.lower()), "")),
            "publisher": act_manifest["publisher"],
            "landingPage": act_attempt.get("landing_page"),
            "fileName": act_path.name,
            "fileSha256": act_attempt["blob_sha256"],
            "pageUpdated": (act_attempt.get("edition_updated_at") or "")[:10],
            "check": f"{t36_title}; {dhsc_pop_note}",
            "seriesBreak": (
                "Built from client level data, which replaced the SALT return from 2024-25. Not comparable with the "
                "NHS England SALT figures for 2023-24 and earlier."
            ),
            "revisionNotice": revision_notice,
        },
    }

    updated = max(m["pageUpdated"] for m in measures.values() if m["pageUpdated"])
    same = fin_period == act_period
    out = {
        "source": (
            f"{fin_manifest['publisher']}, {fin_attempt['edition']}, {t14_title.split(':')[0]}"
            f"; {act_manifest['publisher']}, {act_attempt['edition']}, {t34_title.split(':')[0]}"
            f"; {pop_src['publisher']}, {pop_src['title']}, for the per-head rates"
        ),
        "methodology": (
            "Gross spend per adult = gross current expenditure (finance report, total, GBP thousands) x 1,000 / "
            "ONS mid-2025 residents aged 18 and over. Residential rate = clients aged 65 and over in residential "
            "long term support during the year (activity report) / ONS mid-2025 residents aged 65 and over x 10,000. "
            "Mid-2025 populations come from population-estimates.json; a county's is the sum of its districts. "
            + ("" if same else f"Finance is {fin_period} and activity {act_period}: the two reports are published separately.")
        ).strip(),
        "populationSource": pop_label,
        "lastUpdated": updated,
        "caveat": (
            "Adult social care is run by upper tier councils (counties, unitaries, metropolitan districts and London "
            "boroughs), so a district shows its county's figures. Spend reflects age structure, deprivation and "
            "unpaid care, so differences between councils are not a measure of efficiency. Activity figures are "
            "official statistics in development."
        ),
        "measures": measures,
        "england": england,
        "areas": areas,
    }
    OUT.write_text(json.dumps(out, indent=2, ensure_ascii=False) + "\n")
    n_rate = sum(1 for a in areas.values() if a["residentialRatePer10k65"] is not None)
    print(
        f"asc-dashboard.json: {len(areas)} CASSRs; finance {fin_period}, activity {act_period}; "
        f"{n_rate} with a residential rate; England spend per adult {england.get('grossSpendPerCapita')}"
    )


if __name__ == "__main__":
    main()
